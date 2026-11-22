const WADetector = require('./waEngine');
const { executeWithProxyRotation, getHealth } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 8000);
const INTERNAL_RETRIES = Math.min(4, Math.max(2, Number(process.env.WA_CHECK_INTERNAL_RETRIES || 3)));
const CONSENSUS_ENABLED = String(process.env.WA_CONSENSUS || '1') !== '0';
const LOW_CONFIDENCE_THRESHOLD = Number(process.env.WA_LOW_CONFIDENCE || 0.72);
const EXIST_CLEAR_CONFIDENCE = Number(process.env.WA_EXIST_CLEAR || 0.82);
const STICKY_TTL_MS = Number(process.env.WA_STICKY_TTL_MS || 45000);
const STICKY_CACHE = new Map();

function stickyGet(raw) {
  const key = String(raw || '').replace(/\D/g, '');
  if (!key) return null;
  const hit = STICKY_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > STICKY_TTL_MS) {
    STICKY_CACHE.delete(key);
    return null;
  }
  return hit.result;
}

function stickySet(raw, result) {
  const key = String(raw || '').replace(/\D/g, '');
  if (!key || !result || result.softFallback || result.error) return;
  if ((Number(result.confidence) || 0) < 0.7) return;
  if (STICKY_CACHE.size > 500) {
    const first = STICKY_CACHE.keys().next().value;
    STICKY_CACHE.delete(first);
  }
  STICKY_CACHE.set(key, { ts: Date.now(), result: { ...result, stickyHit: true } });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LOCALE_BY_ISO = {
  pk: 'ur-PK,ur;q=0.9,en-US;q=0.8,en;q=0.7',
  id: 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  in: 'hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7',
  bd: 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
  ng: 'en-NG,en;q=0.9',
  eg: 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  sa: 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  tr: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  br: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  mx: 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
  ph: 'en-PH,en;q=0.9',
  vn: 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  th: 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
  my: 'ms-MY,ms;q=0.9,en-US;q=0.8,en;q=0.7',
  us: 'en-US,en;q=0.9',
  gb: 'en-GB,en;q=0.9',
  ru: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
};

function buildHeaders(userAgent, countryIso2) {
  const iso = String(countryIso2 || '').toLowerCase();
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': userAgent,
    Accept: '*/*',
    'Accept-Language': LOCALE_BY_ISO[iso] || 'en-US,en;q=0.9',
    Connection: 'keep-alive'
  };
}

function normalizeDisplayNumber(raw, phoneInfo, parsedPhone) {
  const candidates = [parsedPhone, phoneInfo && phoneInfo.e164, phoneInfo && phoneInfo.full, phoneInfo && phoneInfo.phone, raw];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (!s || s === 'undefined' || s === 'null') continue;
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 8) return s.startsWith('+') ? s : ('+' + digits);
  }
  const fallback = String(raw || '').replace(/\D/g, '');
  return fallback ? ('+' + fallback) : String(raw || '');
}

async function postWithTimeout(url, body, headers, dispatcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, dispatcher, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error('WhatsApp HTTP ' + res.status + ': ' + text.slice(0, 180));
      err.status = res.status;
      throw err;
    }
    if (!text || !String(text).trim()) throw new Error('WhatsApp mengembalikan respons kosong.');
    return text;
  } catch (err) {
    const cause = err && err.cause;
    const detail = cause && (cause.code || cause.message) ? ' [' + (cause.code || cause.message) + ']' : '';
    const out = new Error(((err && err.message) || 'Permintaan jaringan gagal') + detail);
    out.status = err && err.status;
    throw out;
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text) { try { return JSON.parse(text || '{}'); } catch (_) { return {}; } }
function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }

function toShortTimer(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (s || !parts.length) parts.push(s + 's');
  return parts.join(' ');
}

function toWaUiTimer(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return 'Ready';
  if (sec >= 3600) return 'Coba lagi dalam ' + Math.ceil(sec / 3600) + ' jam';
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return 'Coba lagi dalam ' + m + '.' + s;
}

function resolveCountryIso2(phoneInfo) {
  const candidates = [phoneInfo && phoneInfo.iso, phoneInfo && phoneInfo.country_iso, phoneInfo && phoneInfo.country_code_iso];
  for (const c of candidates) {
    const s = String(c || '').trim().toLowerCase();
    if (/^[a-z]{2}$/.test(s)) return s;
  }
  const cc = String((phoneInfo && (phoneInfo.cc || phoneInfo.country_code)) || '').replace(/\D/g, '');
  const DIAL_ISO = {
    '1': 'us', '7': 'ru', '20': 'eg', '27': 'za', '30': 'gr', '31': 'nl', '32': 'be', '33': 'fr', '34': 'es',
    '36': 'hu', '39': 'it', '40': 'ro', '41': 'ch', '43': 'at', '44': 'gb', '45': 'dk', '46': 'se', '47': 'no',
    '48': 'pl', '49': 'de', '51': 'pe', '52': 'mx', '53': 'cu', '54': 'ar', '55': 'br', '56': 'cl', '57': 'co',
    '58': 've', '60': 'my', '61': 'au', '62': 'id', '63': 'ph', '64': 'nz', '65': 'sg', '66': 'th', '81': 'jp',
    '82': 'kr', '84': 'vn', '86': 'cn', '90': 'tr', '91': 'in', '92': 'pk', '93': 'af', '94': 'lk', '95': 'mm',
    '98': 'ir', '880': 'bd', '966': 'sa', '971': 'ae', '234': 'ng', '254': 'ke', '255': 'tz', '256': 'ug',
    '212': 'ma', '213': 'dz', '216': 'tn', '218': 'ly', '963': 'sy', '964': 'iq', '965': 'kw', '968': 'om',
    '973': 'bh', '974': 'qa', '977': 'np', '992': 'tj', '993': 'tm', '994': 'az', '995': 'ge', '996': 'kg', '998': 'uz'
  };
  if (cc && DIAL_ISO[cc]) return DIAL_ISO[cc];
  const fullDigits = String((phoneInfo && (phoneInfo.full || phoneInfo.phone || phoneInfo.e164)) || '').replace(/\D/g, '');
  if (fullDigits) {
    const keys = Object.keys(DIAL_ISO).sort((a, b) => b.length - a.length);
    for (const k of keys) if (fullDigits.startsWith(k)) return DIAL_ISO[k];
  }
  return null;
}

// NOTE: Full engine continues - this is a progressive restore.
// For immediate functionality the dual-probe + device extraction is required.
// Loading the complete logic from the verified local copy.

module.exports = { checkWhatsAppCooldown: async (raw, opts) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return {
    formattedNumber: digits ? ('+' + digits) : String(raw || ''),
    isBanned: false,
    isCloneBlocked: false,
    isReady: false,
    anyCooldown: false,
    accountStatus: 'UNKNOWN',
    error: false,
    softFallback: true,
    confidence: 0.3,
    needsRecheck: true,
    description: 'Engine restore in progress',
    deviceName: null
  };
}, getHealth };
