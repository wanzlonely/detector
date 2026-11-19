const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ProxyAgent: UndiciProxyAgent } = require('undici');

const DEFAULT_RETRIES = Math.min(3, Math.max(1, Number(process.env.PROXY_MAX_RETRIES || 2)));

function buildDataImpulseProxyUrl() {
  const host = process.env.DATAIMPULSE_HOST || 'gw.dataimpulse.com';
  const port = process.env.DATAIMPULSE_PORT || '823';
  const login = process.env.DATAIMPULSE_LOGIN;
  const password = process.env.DATAIMPULSE_PASSWORD;

  if (!login || !password) return null;
  return `http://${encodeURIComponent(login)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function createRotatingDataImpulseAgent() {
  const proxyUrl = buildDataImpulseProxyUrl();

  if (!proxyUrl) {
    return {
      agent: undefined,
      dispatcher: undefined,
      sessionTag: 'DIRECT',
      mode: 'DIRECT'
    };
  }

  const sessionTag = crypto.randomBytes(4).toString('hex').toUpperCase();

  return {
    agent: new HttpsProxyAgent(proxyUrl, { keepAlive: false }),
    dispatcher: new UndiciProxyAgent({ uri: proxyUrl }),
    sessionTag,
    mode: 'DATAIMPULSE_ROTATING'
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
    'fetch failed'
  ];
  return blockSignals.some((sig) => msg.includes(sig));
}

async function executeWithProxyRotation(taskFn, maxRetries = DEFAULT_RETRIES) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const proxyCtx = createRotatingDataImpulseAgent();

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
        attempts: attempt
      };
    } catch (err) {
      lastError = err;
      if (proxyCtx.agent && isNetworkOrBlockError(err)) {
        continue;
      }
      throw err;
    }
  }

  // Jika seluruh sesi proxy gagal, lakukan satu percobaan langsung agar gangguan proxy tidak mematikan fitur.
  try {
    const output = await taskFn({ agent: undefined, dispatcher: undefined, sessionTag: 'DIRECT-FALLBACK', mode: 'DIRECT_FALLBACK' });
    return { data: output, proxyMode: 'DIRECT_FALLBACK', sessionTag: 'DIRECT-FALLBACK', attempts: maxRetries + 1 };
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
  isDataImpulseConfigured
};
