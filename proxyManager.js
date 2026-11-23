const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ProxyAgent: UndiciProxyAgent } = require('undici');

const DEFAULT_RETRIES = Math.min(4, Math.max(2, Number(process.env.PROXY_MAX_RETRIES || 3)));

const healthMap = new Map();
const dirtySessions = new Map();
const HEALTH_TTL_MS = 15 * 60 * 1000;
const DIRTY_TTL_MS = 8 * 60 * 1000;

function healthKey(countryIso2) {
  const cc = String(countryIso2 || 'xx').toLowerCase();
  return /^[a-z]{2}$/.test(cc) ? cc : 'global';
}

function getHealth(countryIso2) {
  const key = healthKey(countryIso2);
  const row = healthMap.get(key);
  if (!row) return { success: 0, fail: 0, score: 0.5, lastFailAt: 0, dirty: 0 };
  if (Date.now() - (row.touched || 0) > HEALTH_TTL_MS) {
    healthMap.delete(key);
    return { success: 0, fail: 0, score: 0.5, lastFailAt: 0, dirty: 0 };
  }
  const total = row.success + row.fail;
  const score = total === 0 ? 0.5 : row.success / total;
  return { success: row.success, fail: row.fail, score, lastFailAt: row.lastFailAt || 0, dirty: row.dirty || 0 };
}

function recordProxyOutcome(countryIso2, ok, dirty) {
  const key = healthKey(countryIso2);
  const prev = healthMap.get(key) || { success: 0, fail: 0, dirty: 0, lastFailAt: 0, touched: Date.now() };
  if (ok) prev.success += 1;
  else {
    prev.fail += 1;
    prev.lastFailAt = Date.now();
  }
  if (dirty) prev.dirty = (prev.dirty || 0) + 1;
  if (prev.success + prev.fail > 40) {
    prev.success = Math.floor(prev.success * 0.7);
    prev.fail = Math.floor(prev.fail * 0.7);
    prev.dirty = Math.floor((prev.dirty || 0) * 0.7);
  }
  prev.touched = Date.now();
  healthMap.set(key, prev);
}

function markDirtySession(sessionTag) {
  if (!sessionTag) return;
  dirtySessions.set(String(sessionTag), Date.now());
  if (dirtySessions.size > 200) {
    const first = dirtySessions.keys().next().value;
    dirtySessions.delete(first);
  }
}

function isDirtySession(sessionTag) {
  if (!sessionTag) return false;
  const ts = dirtySessions.get(String(sessionTag));
  if (!ts) return false;
  if (Date.now() - ts > DIRTY_TTL_MS) {
    dirtySessions.delete(String(sessionTag));
    return false;
  }
  return true;
}

function shouldPreferDirect(countryIso2) {
  const h = getHealth(countryIso2);
  return (h.fail >= 3 && h.score < 0.35 && (Date.now() - h.lastFailAt) < 120000) || (h.dirty >= 2 && h.score < 0.45);
}

function buildDataImpulseProxyUrl(countryIso2) {
  const host = process.env.DATAIMPULSE_HOST || 'gw.dataimpulse.com';
  const port = process.env.DATAIMPULSE_PORT || '823';
  const login = process.env.DATAIMPULSE_LOGIN;
  const password = process.env.DATAIMPULSE_PASSWORD;
  if (!login || !password) return null;
  let user = login;
  const cc = String(countryIso2 || '').trim().toLowerCase();
  if (/^[a-z]{2}$/.test(cc) && !/__cr\./i.test(login)) {
    user = login + '__cr.' + cc;
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
    'econnreset', 'econnrefused', 'etimedout', 'socket hang up', 'proxy',
    '407', '403', '429', '502', '503', '504', 'rate', 'too_many',
    'temporarily_unavailable', 'network', 'timeout', 'fetch failed',
    'abort', 'empty', 'dual probe', 'proxy_dirty', 'proxy_dead'
  ];
  return blockSignals.some((sig) => msg.includes(sig));
}

function isDirtyProxyError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('proxy_dirty') || msg.includes('dirty_ip') || msg.includes('451') || msg.includes('403') || msg.includes('429');
}

async function executeWithProxyRotation(taskFn, maxRetries = DEFAULT_RETRIES, countryIso2 = null) {
  let lastError = null;
  const preferDirectEarly = shouldPreferDirect(countryIso2);
  const retries = Math.max(2, Number(maxRetries) || DEFAULT_RETRIES);

  for (let attempt = 1; attempt <= retries; attempt++) {
    let useCountry = countryIso2;
    if (preferDirectEarly && attempt >= 2) useCountry = null;
    if (attempt === retries) useCountry = null;
    else if (attempt === retries - 1 && countryIso2) useCountry = null;

    const proxyCtx = createRotatingDataImpulseAgent(useCountry);

    try {
      const output = await taskFn(proxyCtx);
      if (output && output.__proxyBlocked) {
        markDirtySession(proxyCtx.sessionTag);
        recordProxyOutcome(useCountry, false, true);
        lastError = new Error(output.reason || 'IP rate-limited by WhatsApp');
        continue;
      }
      recordProxyOutcome(useCountry, true, false);
      return {
        data: output,
        proxyMode: proxyCtx.mode,
        sessionTag: proxyCtx.sessionTag,
        attempts: attempt,
        proxyCountry: proxyCtx.country,
        health: getHealth(useCountry)
      };
    } catch (err) {
      lastError = err;
      const dirty = isDirtyProxyError(err);
      if (dirty) markDirtySession(proxyCtx.sessionTag);
      recordProxyOutcome(useCountry, false, dirty);
      if (attempt < retries) continue;
      throw err;
    }
  }

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
      attempts: retries + 1,
      proxyCountry: null,
      health: getHealth(null)
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
  buildDataImpulseProxyUrl,
  recordProxyOutcome,
  getHealth,
  markDirtySession,
  isDirtySession,
  isDirtyProxyError
};
