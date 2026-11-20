const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ProxyAgent: UndiciProxyAgent } = require('undici');

const DEFAULT_RETRIES = Math.min(4, Math.max(2, Number(process.env.PROXY_MAX_RETRIES || 3)));

/**
 * DataImpulse country targeting:
 *   http://login__cr.pk:password@gw.dataimpulse.com:823
 * ISO-2 lowercase (pk, id, us, ...)
 */
function buildDataImpulseProxyUrl(countryIso2) {
  const host = process.env.DATAIMPULSE_HOST || 'gw.dataimpulse.com';
  const port = process.env.DATAIMPULSE_PORT || '823';
  const login = process.env.DATAIMPULSE_LOGIN;
  const password = process.env.DATAIMPULSE_PASSWORD;

  if (!login || !password) return null;

  let user = login;
  const cc = String(countryIso2 || '').trim().toLowerCase();
  if (/^[a-z]{2}$/.test(cc)) {
    // Avoid double-appending if login already has __cr.
    if (!/__cr\./i.test(login)) {
      user = login + '__cr.' + cc;
    }
  }

  return `http://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function createRotatingDataImpulseAgent(countryIso2) {
  const proxyUrl = buildDataImpulseProxyUrl(countryIso2);

  if (!proxyUrl) {
    return {
      agent: undefined,
      dispatcher: undefined,
      sessionTag: 'DIRECT',
      mode: 'DIRECT',
      country: null
    };
  }

  const sessionTag = crypto.randomBytes(4).toString('hex').toUpperCase();
  const cc = String(countryIso2 || '').trim().toLowerCase();
  const tagged = /^[a-z]{2}$/.test(cc) ? cc.toUpperCase() + '-' + sessionTag : sessionTag;

  return {
    agent: new HttpsProxyAgent(proxyUrl, { keepAlive: false }),
    dispatcher: new UndiciProxyAgent({ uri: proxyUrl }),
    sessionTag: tagged,
    mode: /^[a-z]{2}$/.test(cc) ? 'DATAIMPULSE_GEO_' + cc.toUpperCase() : 'DATAIMPULSE_ROTATING',
    country: /^[a-z]{2}$/.test(cc) ? cc : null
  };
}

function isNetworkOrBlockError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const blockSignals = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'socket hang up',
    'proxy',
    '407',
    '403',
    '429',
    '502',
    '503',
    '504',
    'rate',
    'too_many',
    'temporarily_unavailable',
    'network',
    'timeout',
    'fetch failed',
    'no_ray',
    'abort',
    'empty',
    'dual probe'
  ];
  return blockSignals.some((sig) => msg.includes(sig));
}

/**
 * @param {Function} taskFn - receives proxyCtx
 * @param {number} maxRetries
 * @param {string|null} countryIso2 - optional ISO-2 for geo proxy (e.g. 'pk')
 */
async function executeWithProxyRotation(taskFn, maxRetries = DEFAULT_RETRIES, countryIso2 = null) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Prefer geo for early attempts; last attempts try rotating without country then direct
    let useCountry = countryIso2;
    if (attempt === maxRetries) useCountry = null;
    else if (attempt === maxRetries - 1 && countryIso2) useCountry = null;

    const proxyCtx = createRotatingDataImpulseAgent(useCountry);

    try {
      const output = await taskFn(proxyCtx);
      if (output && output.__proxyBlocked) {
        lastError = new Error(output.reason || 'IP rate-limited by WhatsApp');
        continue;
      }
      return {
        data: output,
        proxyMode: proxyCtx.mode,
        sessionTag: proxyCtx.sessionTag,
        attempts: attempt,
        proxyCountry: proxyCtx.country
      };
    } catch (err) {
      lastError = err;
      if (proxyCtx.agent && isNetworkOrBlockError(err)) {
        continue;
      }
      // Non-network errors still worth one more proxy rotation if retries remain
      if (attempt < maxRetries && isNetworkOrBlockError(err)) {
        continue;
      }
      if (attempt < maxRetries) continue;
      throw err;
    }
  }

  // Fallback direct so proxy outage does not kill the feature
  try {
    const output = await taskFn({
      agent: undefined,
      dispatcher: undefined,
      sessionTag: 'DIRECT-FALLBACK',
      mode: 'DIRECT_FALLBACK',
      country: null
    });
    return {
      data: output,
      proxyMode: 'DIRECT_FALLBACK',
      sessionTag: 'DIRECT-FALLBACK',
      attempts: maxRetries + 1,
      proxyCountry: null
    };
  } catch (directError) {
    const proxyMessage = lastError && lastError.message ? lastError.message : 'Proxy gagal';
    const directMessage = directError && directError.message ? directError.message : 'Koneksi langsung gagal';
    throw new Error('Semua jalur koneksi gagal. Proxy: ' + proxyMessage + '. Jalur langsung: ' + directMessage);
  }
}

function isDataImpulseConfigured() {
  return Boolean(process.env.DATAIMPULSE_LOGIN && process.env.DATAIMPULSE_PASSWORD);
}

module.exports = {
  createRotatingDataImpulseAgent,
  executeWithProxyRotation,
  isDataImpulseConfigured,
  buildDataImpulseProxyUrl
};
