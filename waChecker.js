const WADetector = require('./waEngine');
const { executeWithProxyRotation, getHealth } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 4000);
const INTERNAL_RETRIES = Math.min(2, Math.max(1, Number(process.env.WA_CHECK_INTERNAL_RETRIES || 1)));
const CONSENSUS_ENABLED = String(process.env.WA_CONSENSUS || '0') === '1';
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
  const ua = String(userAgent || '');
  const isIOS = /iphone|ipad|ios/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': ua,
    'Accept': '*/*',
    'Accept-Language': LOCALE_BY_ISO[iso] || 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };
  if (isIOS) {
    headers['Sec-CH-UA-Mobile'] = '?1';
    headers['Sec-CH-UA-Platform'] = '"iOS"';
  } else if (isAndroid) {
    headers['Sec-CH-UA-Mobile'] = '?1';
    headers['Sec-CH-UA-Platform'] = '"Android"';
  }
  return headers;
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

async function checkProxyHealth(dispatcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch('https://www.whatsapp.com/', {
      method: 'GET',
      dispatcher,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (res.status === 403 || res.status === 429 || res.status === 451) {
      throw new Error('PROXY_DIRTY_IP_BANNED');
    }
    if (res.status >= 500) {
      throw new Error('PROXY_DEAD');
    }
    return true;
  } catch (err) {
    if (err && err.message === 'PROXY_DIRTY_IP_BANNED') throw err;
    throw new Error('PROXY_DEAD');
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

function extractChannelTimers(existRaw, codeRaw) {
  const exist = existRaw || {};
  const code = codeRaw || {};
  const existNoRoutes = exist.reason === 'no_routes' || exist.reason === 'no_route';
  const codeNoRoutes = code.reason === 'no_routes' || code.reason === 'no_route';

  const existSms = existNoRoutes ? 0 : Math.max(num(exist.sms_wait), num(exist.send_sms_wait), num(exist.sms_cooldown));
  const codeSmsRaw = codeNoRoutes ? 0 : Math.max(num(code.sms_wait), num(code.send_sms_wait), num(code.sms_cooldown));

  const existVoice = Math.max(num(exist.voice_wait), num(exist.voice_cooldown));
  const codeVoice = Math.max(num(code.voice_wait), num(code.voice_cooldown));
  const existFlash = Math.max(num(exist.flash_wait), num(exist.flash_cooldown));
  const codeFlash = Math.max(num(code.flash_wait), num(code.flash_cooldown));
  const existEmail = Math.max(num(exist.email_wait), num(exist.email_cooldown));
  const codeEmail = Math.max(num(code.email_wait), num(code.email_cooldown));

  const waOldWait = Math.max(num(exist.wa_old_wait), num(exist.wa_old_cooldown), num(code.wa_old_wait), num(code.wa_old_cooldown));
  const existRetry = existNoRoutes ? 0 : num(exist.retry_after);
  const codeRetry = codeNoRoutes ? 0 : num(code.retry_after);
  const isCodeSent = code.status === 'sent' || code.status === 'ok';

  const codeMethod = String(code.method || code.login_method || '').toLowerCase();
  const isWaOldMethod = codeMethod.includes('wa_old');

  const isWaOldEcho =
    existSms === 0 &&
    codeSmsRaw > 0 &&
    codeSmsRaw <= 90 &&
    isWaOldMethod &&
    !isCodeSent;

  let smsSeconds = Math.max(existSms, isWaOldEcho ? 0 : codeSmsRaw);

  let voiceWait = existVoice > 0 ? existVoice : (isWaOldEcho ? 0 : codeVoice);
  let flashWait = existFlash > 0 ? existFlash : (isWaOldEcho ? 0 : codeFlash);
  let emailWait = existEmail > 0 ? existEmail : (isWaOldEcho ? 0 : codeEmail);

  if (voiceWait >= 240 && existVoice === 0 && isWaOldMethod) voiceWait = 0;
  if (flashWait >= 240 && existFlash === 0 && isWaOldMethod) flashWait = 0;

  const deviceName = pickDeviceName(exist, code);
  const explicitEligible = Number(exist.wa_old_eligible ?? code.wa_old_eligible ?? 0) === 1;
  const waOldEligible = Boolean(deviceName || (explicitEligible && (waOldWait > 0 || isWaOldMethod)));

  return {
    sms: smsSeconds,
    voice: voiceWait,
    flash: flashWait,
    email: emailWait,
    wa_old: waOldWait,
    retry_after: Math.max(existRetry, codeRetry),
    wa_old_eligible: waOldEligible,
    device_name: deviceName,
    is_wa_old_echo: isWaOldEcho,
    exist_no_routes: existNoRoutes,
    code_no_routes: codeNoRoutes,
    is_code_sent: isCodeSent,
    exist_sms: existSms,
    code_sms: codeSmsRaw
  };
}

function pickDeviceName(exist, code) {
  const sources = [exist, code];
  const keys = [
    'wa_old_device_name', 'wa_old_device', 'device_name', 'old_device_name',
    'wa_device_name', 'registered_device_name', 'phone_model',
    'device_model', 'wa_old_model', 'last_device_name', 'device_os_name',
    'os_name', 'device_board', 'marketing_name'
  ];
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const k of keys) {
      const v = src[k];
      if (v == null) continue;
      if (typeof v === 'string' && v.trim() && v.trim().length >= 2) return cleanDeviceName(v);
      if (typeof v === 'object') {
        const nested = v.name || v.device_name || v.model || v.model_name || v.marketing_name || v.device || null;
        if (nested && String(nested).trim()) return cleanDeviceName(nested);
      }
    }
    for (const nestKey of ['account_security', 'security', 'device_info', 'wa_old', 'device', 'meta']) {
      const nest = src[nestKey];
      if (!nest || typeof nest !== 'object') continue;
      for (const k of keys) {
        const v = nest[k];
        if (typeof v === 'string' && v.trim() && v.trim().length >= 2) return cleanDeviceName(v);
      }
    }
  }
  try {
    const blob = JSON.stringify({ exist, code });
    const patterns = [
      /"wa_old_device_name"\s*:\s*"([^"]{2,80})"/i,
      /"device_name"\s*:\s*"([^"]{2,80})"/i,
      /"old_device_name"\s*:\s*"([^"]{2,80})"/i,
      /"wa_device_name"\s*:\s*"([^"]{2,80})"/i,
      /"marketing_name"\s*:\s*"([^"]{2,80})"/i,
      /"model_name"\s*:\s*"([^"]{2,80})"/i
    ];
    for (const re of patterns) {
      const m = blob.match(re);
      if (m && m[1] && m[1].trim() && m[1].toLowerCase() !== 'null') return cleanDeviceName(m[1]);
    }
  } catch (_) {}
  return null;
}

function cleanDeviceName(name) {
  let s = String(name || '').trim();
  if (!s) return null;
  s = s.replace(/^[\s"']+|[\s"']+$/g, '');
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s === '-') return null;
  if (s.length > 40) s = s.slice(0, 40).trim();
  return s;
}

function extractEmail(exist, code, parsed) {
  const candidates = [
    exist && exist.email, exist && exist.email_address,
    exist && exist.masked_email, exist && exist.recovery_email,
    exist && exist.email_masked, exist && exist.contact_email,
    exist && exist.security_email, exist && exist.two_step_email,
    code && code.email, code && code.email_address,
    code && code.masked_email, code && code.recovery_email,
    code && code.email_masked, code && code.contact_email,
    code && code.security_email, code && code.two_step_email,
    parsed && parsed.maskedEmail, parsed && parsed.email
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.includes('@') && c.length >= 5) return c.trim();
    if (c && typeof c === 'object') {
      const e = c.email || c.address || c.value || c.masked;
      if (typeof e === 'string' && e.includes('@')) return e.trim();
    }
  }
  for (const nest of [exist, code]) {
    if (!nest || typeof nest !== 'object') continue;
    for (const key of ['account_security', 'security', 'recovery', 'two_step', 'verification', 'meta', 'email_info']) {
      const sub = nest[key];
      if (!sub || typeof sub !== 'object') continue;
      for (const k of ['email', 'email_address', 'masked_email', 'recovery_email', 'email_masked']) {
        const v = sub[k];
        if (typeof v === 'string' && v.includes('@')) return v.trim();
      }
    }
  }
  try {
    const blob = JSON.stringify({ exist: exist || {}, code: code || {} });
    const masked = blob.match(/"([a-zA-Z0-9._%+\-]{1,}\*+[a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})"/);
    if (masked && masked[1]) return masked[1];
    const plain = blob.match(/"([a-zA-Z0-9._%+\-]{3,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})"/g);
    if (plain) {
      for (const p of plain) {
        const email = p.replace(/^"|"$/g, '');
        if (!/whatsapp|facebook|fbcdn|meta\.com|graph\./i.test(email)) return email;
      }
    }
  } catch (_) {}
  return null;
}

function buildChannel(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  return { isCooldown: sec > 0, rawSeconds: sec, uiTimer: toShortTimer(sec), humanTime: toWaUiTimer(sec), formatted: toShortTimer(sec) };
}

function applyPatternLibrary(exist, code, timers) {
  const reason = String(exist.reason || code.reason || '').toLowerCase();
  const status = String(exist.status || code.status || '').toLowerCase();
  const hints = [];
  if (timers.is_wa_old_echo) hints.push('WA_OLD_ECHO');
  if (reason === 'temporarily_unavailable' || status === 'temporarily_unavailable') hints.push('TEMP_LOCK');
  if (reason.includes('too_many') || reason === 'too_recent') hints.push('RATE_LIMIT');
  if (exist.high_sms_rereg_user || code.high_sms_rereg_user) hints.push('HIGH_REREG');
  if (reason === 'no_routes' || reason === 'no_route') hints.push('NO_ROUTES');
  if (code.reason === 'method_not_allowed' && !timers.exist_no_routes && timers.sms === 0) hints.push('METHOD_NOT_ALLOWED_SOFT');
  if (timers.is_code_sent && timers.sms === 0) hints.push('CODE_SENT_READY');
  if (exist.violation_type || code.violation_type || exist.in_app_ban_appeal || code.in_app_ban_appeal) hints.push('HARD_BAN');
  return hints;
}

function detectBanSignals(exist, code, parsed, patternHints) {
  if (patternHints.includes('HARD_BAN')) return true;
  if (parsed && parsed.isBanned === true && (exist.violation_type || code.violation_type || exist.in_app_ban_appeal || code.in_app_ban_appeal)) return true;
  return Boolean(
    exist.status === 'banned' || code.status === 'banned' ||
    exist.reason === 'banned' || code.reason === 'banned' ||
    exist.violation_type || code.violation_type ||
    exist.in_app_ban_appeal || code.in_app_ban_appeal
  );
}

function detectCloneSignals(exist, code, parsed) {
  if (parsed && (parsed.isCloneBlocked || parsed.isUnofficialAppBlock)) {
    return { isCloneBlocked: true, isSecurityBlock: Boolean(parsed.isSecurityBlock) };
  }
  const rawBlock = exist.custom_block_screen || code.custom_block_screen || exist.block_screen || code.block_screen || null;
  let blockScreen = '';
  if (rawBlock && typeof rawBlock === 'object') {
    blockScreen = JSON.stringify(rawBlock).toLowerCase();
  } else {
    blockScreen = String(rawBlock || '').toLowerCase();
  }
  const reason = String(exist.reason || code.reason || '').toLowerCase();
  const status = String(exist.status || code.status || '').toLowerCase();
  const textBlob = (blockScreen + ' ' + JSON.stringify({ exist: { reason: exist.reason, status: exist.status }, code: { reason: code.reason, status: code.status } })).toLowerCase();

  const unofficial = (
    blockScreen.includes('unofficial') ||
    blockScreen.includes('clone') ||
    blockScreen.includes('tidak resmi') ||
    blockScreen.includes('aplikasi resmi') ||
    blockScreen.includes('official whatsapp') ||
    blockScreen.includes('whatsapp.com/download') ||
    blockScreen.includes('unduh whatsapp') ||
    blockScreen.includes('download whatsapp') ||
    reason.includes('unofficial') ||
    reason.includes('clone')
  );
  const security = (
    blockScreen.includes('security') ||
    blockScreen.includes('keamanan') ||
    blockScreen.includes('demi keamanan') ||
    blockScreen.includes('login not available') ||
    blockScreen.includes('login is not available') ||
    reason.includes('security') ||
    status.includes('security') ||
    textBlob.includes('tidak dapat masuk saat ini') ||
    Boolean(parsed && parsed.isSecurityBlock)
  );
  if (!unofficial && rawBlock && typeof rawBlock === 'object') {
    const title = String(rawBlock.title || rawBlock.header || '').toLowerCase();
    if (title.includes('resmi') || title.includes('official') || title.includes('unduh') || title.includes('download')) {
      return { isCloneBlocked: true, isSecurityBlock: false };
    }
  }
  return { isCloneBlocked: Boolean(unofficial), isSecurityBlock: Boolean(security) && !unofficial };
}

async function runExistOnlyProbe(payloads, headers, countryIso2) {
  const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
    await checkProxyHealth(proxyCtx.dispatcher);
    const existText = await postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher);
    return { existText, codeText: null, partial: true };
  }, 2, countryIso2);
  return { existText: data.existText || null, codeText: null, partial: true, proxyMode, sessionTag, existOnly: true };
}

async function runDualProbe(payloads, headers, countryIso2) {
  const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
    await checkProxyHealth(proxyCtx.dispatcher);
    let existText = null;
    let codeText = null;
    try {
      existText = await postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher);
    } catch (_) {}
    await sleep(25);
    try {
      codeText = await postWithTimeout(payloads.code.url, payloads.code.body, headers, proxyCtx.dispatcher);
    } catch (_) {}
    if (!existText && !codeText) throw new Error('Dual probe gagal: jaringan');
    return { existText, codeText, partial: !existText || !codeText };
  }, undefined, countryIso2);
  return { existText: data.existText || null, codeText: data.codeText || null, partial: Boolean(data.partial), proxyMode, sessionTag };
}

function computeQualityScore(f) {
  let s = 50;
  if (f.isBanned) return 5;
  if (f.isCloneBlocked) return 15;
  if (f.isSecurityBlock) return 20;
  if (f.existNoRoutes) return 25;
  if (f.isReady) s += 30;
  if (f.hasDevicePath) s += 10;
  if (f.maskedEmail) s += 8;
  if (f.hasPassword) s += 5;
  if (f.highRereg) s -= 15;
  if (f.isCooldown) s -= 10;
  return Math.max(0, Math.min(100, s));
}

function classifyFromResponses(payloads, existText, codeText, proxyMode, sessionTag, countryIso2, meta) {
  const existResponse = safeJson(existText);
  const codeResponse = safeJson(codeText);
  const parsed = WADetector.parseDualResponse(payloads.phoneInfo, existText || '{}', codeText || '{}');
  const timers = extractChannelTimers(existResponse, codeResponse);
  const patternHints = applyPatternLibrary(existResponse, codeResponse, timers);

  const reasonBlob = (
    String(existResponse.reason || '') + ' ' + String(codeResponse.reason || '') + ' ' +
    String(existResponse.status || '') + ' ' + String(codeResponse.status || '')
  ).toLowerCase();
  
  const hasAppeal = Boolean(
    existResponse.in_app_ban_appeal || codeResponse.in_app_ban_appeal ||
    existResponse.appeal_token || codeResponse.appeal_token
  );
  const hasViolation = Boolean(existResponse.violation_type || codeResponse.violation_type);
  const explicitBan =
    existResponse.status === 'banned' || codeResponse.status === 'banned' ||
    existResponse.reason === 'banned' || codeResponse.reason === 'banned' ||
    /\bbanned\b/.test(reasonBlob);
  const blockedHard =
    (existResponse.reason === 'blocked' || codeResponse.reason === 'blocked') &&
    (hasViolation || hasAppeal);
  const hardBan = Boolean(explicitBan || blockedHard || (hasViolation && hasAppeal));
  let isBanned = hardBan;

  const isUnregistered =
    existResponse.status === 'not_registered' || existResponse.reason === 'not_registered' ||
    existResponse.status === 'unregistered' || existResponse.reason === 'unregistered' ||
    codeResponse.status === 'not_registered' || codeResponse.reason === 'not_registered' ||
    /\bunregistered\b|\bnot[_\s]?registered\b/.test(reasonBlob);

  const isTempLock = reasonBlob.includes('temporarily_unavailable') ||
    reasonBlob.includes('too_many') || reasonBlob.includes('too_recent') ||
    reasonBlob.includes('rate_limit') || patternHints.includes('TEMP_LOCK') ||
    patternHints.includes('RATE_LIMIT');

  const cloneSig = detectCloneSignals(existResponse, codeResponse, parsed);
  let isCloneBlocked = Boolean((parsed && (parsed.isCloneBlocked || parsed.isUnofficialAppBlock)) || cloneSig.isCloneBlocked);
  let isSecurityBlock = Boolean((parsed && parsed.isSecurityBlock) || cloneSig.isSecurityBlock);
  if (isBanned) { isCloneBlocked = false; isSecurityBlock = false; }
  if (isCloneBlocked) isSecurityBlock = false;

  const existNoRoutes = Boolean(
    timers.exist_no_routes ||
    existResponse.reason === 'no_routes' ||
    existResponse.reason === 'no_route'
  );
  const existAnswered = Boolean(existText && String(existText).trim());

  let smsSeconds = timers.sms;
  const engineCd = Math.max(0, Number(parsed && parsed.cooldownSeconds) || 0);
  const st = String((parsed && parsed.state) || '').toUpperCase();

  if (smsSeconds === 0 && engineCd >= 600 && parsed && parsed.isCooldown && !parsed.isReady) {
    smsSeconds = engineCd;
  }

  let isCooldown = false;
  let isReady = false;

  if (!isBanned && !isUnregistered) {
    if (smsSeconds > 0) {
      isCooldown = true;
      isReady = false;
    } else if (parsed && parsed.isReady) {
      isReady = true;
      isCooldown = false;
    } else if (st === 'AVAILABLE_READY' || st === 'REGISTERED_ON_DEVICE') {
      isReady = true;
      isCooldown = false;
    } else if (isTempLock && engineCd >= 60) {
      isCooldown = true;
      isReady = false;
      smsSeconds = engineCd;
    } else if (st === 'IN_COOLDOWN' || st === 'TEMP_LOCKED_COOLDOWN' || st === 'RATE_LIMITED_COOLDOWN') {
      if (engineCd > 0) {
        isCooldown = true;
        smsSeconds = engineCd;
      } else if (parsed && parsed.isCooldown && timers.exist_sms > 0) {
        isCooldown = true;
        smsSeconds = timers.exist_sms;
      } else if (parsed && parsed.isReady) {
        isReady = true;
      } else {
        isReady = true;
      }
    } else if (parsed && parsed.isCooldown && timers.exist_sms > 0) {
      isCooldown = true;
      smsSeconds = timers.exist_sms;
    } else if (existAnswered && !existNoRoutes && !isTempLock) {
      const positiveSignal =
        (existResponse.send_sms_eligible === true || codeResponse.send_sms_eligible === true) ||
        (existResponse.status === 'ok' || existResponse.status === 'available') ||
        (codeResponse.status === 'ok' || codeResponse.status === 'available');
      if (positiveSignal) {
        isReady = true;
        isCooldown = false;
      }
    }
  }

  const hasDevicePath = Boolean(
    timers.device_name ||
    (timers.wa_old_eligible && (Number(existResponse.wa_old_eligible || codeResponse.wa_old_eligible || 0) === 1 || timers.wa_old > 0))
  );

  const channels = {
    sms: buildChannel(smsSeconds),
    voice: buildChannel(timers.voice),
    flash: buildChannel(timers.flash),
    email: buildChannel(timers.email),
    wa_old: buildChannel(timers.wa_old)
  };

  if (!isBanned && isCloneBlocked) isReady = false;
  if (!isBanned && isSecurityBlock) isReady = false;

  let accountStatus = 'UNKNOWN';
  let description = (parsed && parsed.description) || '';
  if (isBanned) {
    accountStatus = 'BANNED';
    description = description || 'Nomor dibatasi / banned';
  } else if (isUnregistered) {
    accountStatus = 'NOT_REGISTERED';
    description = 'Nomor tidak terdaftar di WhatsApp';
  } else if (isCloneBlocked) {
    accountStatus = 'CLONE_BLOCK';
    description = description || 'Diblokir karena APK tidak resmi / clone';
  } else if (isSecurityBlock) {
    accountStatus = 'SECURITY_BLOCK';
    description = description || 'Demi keamanan: tidak dapat masuk saat ini';
  } else if (isCooldown) {
    accountStatus = 'IN_COOLDOWN';
    description = description || ('Cooldown SMS · ' + (channels.sms.uiTimer || '0s'));
  } else if (isReady) {
    accountStatus = hasDevicePath ? 'REGISTERED_ON_DEVICE' : 'READY';
    description = description || (hasDevicePath ? 'Siap diverifikasi · perangkat terdaftar' : 'Siap diverifikasi');
  } else if (existNoRoutes) {
    accountStatus = 'NO_ROUTES';
    description = description || 'Jalur SMS tidak tersedia';
  }

  const maskedEmail = extractEmail(existResponse, codeResponse, parsed);
  const emailVerified = Boolean(maskedEmail) || Boolean(parsed && parsed.emailOtpEligible);
  const hasPassword = Boolean(
    Number(existResponse.password_eligible || codeResponse.password_eligible || 0) === 1 ||
    existResponse.security_code_set || codeResponse.security_code_set
  );
  const hasPasskey = Boolean(
    existResponse.passkey_auth_challenge || existResponse.passkey_credential ||
    codeResponse.passkey_auth_challenge || codeResponse.passkey_credential
  );
  const recommendedMethods = existResponse.recommended_method || codeResponse.recommended_method || [];
  const fallbackMethods = existResponse.fallback_methods || codeResponse.fallback_methods || [];
  const highRereg = Boolean(existResponse.high_sms_rereg_user || codeResponse.high_sms_rereg_user);
  const wipeType = existResponse.wipe_type || codeResponse.wipe_type || null;
  const wipeWait = Math.max(num(existResponse.wipe_wait), num(codeResponse.wipe_wait));
  const flashType = existResponse.flash_type ?? codeResponse.flash_type ?? null;
  const qualityScore = computeQualityScore({
    isReady, isBanned, isCloneBlocked, isSecurityBlock, isCooldown,
    hasDevicePath, maskedEmail, hasPassword, highRereg, existNoRoutes
  });

  const confidence = isBanned || isUnregistered || isReady || isCooldown ? 0.94 : (existAnswered ? 0.5 : 0.3);

  const rawDigits = String(payloads.rawNumber || '').replace(/\D/g, '');
  const safeFmt = rawDigits ? ('+' + rawDigits) : String(payloads.rawNumber || '');
  let formatted = normalizeDisplayNumber(payloads.rawNumber, payloads.phoneInfo, parsed && parsed.phone);
  const shown = String(formatted || '').replace(/\D/g, '');
  if (!shown || (rawDigits.length >= 10 && shown.length < rawDigits.length - 1) || (rawDigits.length >= 10 && shown && !rawDigits.endsWith(shown.slice(-8)))) {
    formatted = safeFmt;
  }

  return {
    formattedNumber: formatted || safeFmt,
    region: (payloads.phoneInfo && (payloads.phoneInfo.region || payloads.phoneInfo.country || payloads.phoneInfo.iso)) || null,
    accountStatus,
    isBanned,
    isCloneBlocked,
    isSecurityBlock,
    isReady: isReady && !isCloneBlocked && !isSecurityBlock && !isBanned && !isUnregistered,
    smsAvailable: (isReady || isCooldown) && !isBanned && !isUnregistered,
    smsOptionMissing: existNoRoutes,
    anyCooldown: isCooldown && !isBanned && !isCloneBlocked && !isSecurityBlock && !isUnregistered,
    description,
    deviceName: timers.device_name || null,
    waOldEligible: hasDevicePath,
    channels,
    primaryTimer: { rawSeconds: channels.sms.rawSeconds, uiTimer: channels.sms.uiTimer, humanTime: channels.sms.humanTime },
    proxyInfo: String(proxyMode || '') + ' · ' + String(sessionTag || ''),
    proxyTag: sessionTag,
    proxyCountry: countryIso2,
    confidence,
    existClear: isReady || isCooldown || isBanned || isCloneBlocked || isSecurityBlock || isUnregistered,
    needsRecheck: accountStatus === 'UNKNOWN',
    decisionReasons: [],
    patternHints,
    softFallback: false,
    error: false,
    partialResponse: Boolean(meta && meta.partial),
    secondaryPath: isCooldown ? 'cooldown' : (hasDevicePath ? 'device' : (isReady ? 'ready' : null)),
    secondarySeconds: smsSeconds,
    engineState: (parsed && parsed.state) || null,
    maskedEmail,
    emailVerified,
    hasPassword,
    hasPasskey,
    recommendedMethods: Array.isArray(recommendedMethods) ? recommendedMethods : [],
    fallbackMethods: Array.isArray(fallbackMethods) ? fallbackMethods : [],
    highRereg,
    wipeType,
    wipeWait,
    flashType,
    qualityScore
  };
}

function mergeConsensus(results) {
  if (!results || !results.length) return softFallback('', {}, null, null);
  const score = { ready: 0, cooldown: 0, clone: 0, ban: 0, sms: 0 };
  for (const r of results) {
    const w = Number(r.confidence) || 0.5;
    if (r.isBanned) score.ban += w;
    else if (r.isCloneBlocked || r.isSecurityBlock) score.clone += w;
    else if (r.anyCooldown) score.cooldown += w;
    else if (r.smsOptionMissing) score.sms += w;
    else if (r.isReady) score.ready += w;
    else score.cooldown += w * 0.5;
  }
  let best = 'cooldown'; let bestVal = -1;
  for (const k of Object.keys(score)) {
    if (score[k] > bestVal) { bestVal = score[k]; best = k; }
  }
  const base = results.filter((r) => {
    if (best === 'ban') return r.isBanned;
    if (best === 'clone') return r.isCloneBlocked || r.isSecurityBlock;
    if (best === 'cooldown') return r.anyCooldown || r.softFallback;
    if (best === 'sms') return r.smsOptionMissing;
    if (best === 'ready') return r.isReady;
    return false;
  }).sort((a, b) => {
    const ta = (a.primaryTimer && a.primaryTimer.rawSeconds) || 0;
    const tb = (b.primaryTimer && b.primaryTimer.rawSeconds) || 0;
    const stableA = ta > 0 ? 1 : 0;
    const stableB = tb > 0 ? 1 : 0;
    if (stableB !== stableA) return stableB - stableA;
    return (b.confidence || 0) - (a.confidence || 0);
  })[0] || results[0];
  return { ...base, confidence: Math.min(0.99, (base.confidence || 0) + 0.05), consensusVotes: bestVal, consensusRounds: results.length, needsRecheck: false };
}

function softFallback(rawNumber, payloads, countryIso2, lastError) {
  const rawDigits = String(rawNumber || '').replace(/\D/g, '');
  const safeFmt = rawDigits ? ('+' + rawDigits) : String(rawNumber || '');
  let formatted = normalizeDisplayNumber(rawNumber, payloads && payloads.phoneInfo, null);
  const shown = String(formatted || '').replace(/\D/g, '');
  if (!shown || (rawDigits.length >= 10 && shown.length < rawDigits.length - 1) || (rawDigits.length >= 10 && shown && !rawDigits.endsWith(shown.slice(-8)))) {
    formatted = safeFmt;
  }
  return {
    formattedNumber: formatted || safeFmt,
    region: null,
    accountStatus: 'UNKNOWN',
    isBanned: false,
    isCloneBlocked: false,
    isSecurityBlock: false,
    isReady: false,
    smsAvailable: null,
    smsOptionMissing: false,
    anyCooldown: false,
    description: 'Respons tidak stabil — coba ulang sebentar.',
    deviceName: null,
    waOldEligible: false,
    channels: {
      sms: buildChannel(0), voice: buildChannel(0), flash: buildChannel(0),
      email: buildChannel(0), wa_old: buildChannel(0)
    },
    primaryTimer: { rawSeconds: 0, uiTimer: '0s', humanTime: 'Ready' },
    proxyInfo: 'FALLBACK', proxyTag: 'FALLBACK', proxyCountry: countryIso2,
    softFallback: true,
    confidence: 0.3,
    needsRecheck: true,
    decisionReasons: ['soft_fallback'],
    patternHints: ['SOFT_FALLBACK'],
    error: false,
    secondaryPath: null,
    secondarySeconds: 0,
    maskedEmail: null,
    emailVerified: false,
    hasPassword: false,
    hasPasskey: false,
    recommendedMethods: [],
    fallbackMethods: [],
    highRereg: false,
    wipeType: null,
    wipeWait: 0,
    flashType: null,
    qualityScore: 40,
    engineState: null
  };
}

async function checkWhatsAppCooldown(rawNumber, options) {
  const opts = options || {};
  if (!opts.skipSticky && !opts.forceRefresh && opts.wave !== 'exist') {
    const cached = stickyGet(rawNumber);
    if (cached) {
      return { ...cached, fromSticky: true, decisionReasons: (cached.decisionReasons || []).concat(['sticky_cache']) };
    }
  }
  const payloads = await WADetector.buildDualPayloads(String(rawNumber));
  if (!payloads.success) throw new Error(payloads.error || 'Nomor tidak valid untuk diperiksa.');
  payloads.rawNumber = String(rawNumber);
  const countryIso2 = resolveCountryIso2(payloads.phoneInfo);
  const headers = buildHeaders(payloads.userAgent, countryIso2);
  if (opts.wave === 'exist') {
    try {
      const probe = await runExistOnlyProbe(payloads, headers, countryIso2);
      return classifyFromResponses(payloads, probe.existText, null, probe.proxyMode, probe.sessionTag, countryIso2, { partial: true, existOnly: true });
    } catch (err) {
      return softFallback(rawNumber, payloads, countryIso2, err);
    }
  }
  if (!(opts.wave === 'full' || opts.wave === 'dual')) {
    try {
      const existProbe = await runExistOnlyProbe(payloads, headers, countryIso2);
      const existResult = classifyFromResponses(payloads, existProbe.existText, null, existProbe.proxyMode, existProbe.sessionTag, countryIso2, { partial: true, existOnly: true });
      if (existResult.existClear && !existResult.needsRecheck) {
        const outClear = { ...existResult, probeMode: 'exist_clear', consensusRounds: 1 };
        stickySet(rawNumber, outClear);
        return outClear;
      }
    } catch (_) {}
  }
  const rounds = [];
  let lastError = null;
  for (let attempt = 1; attempt <= INTERNAL_RETRIES; attempt++) {
    try {
      const dual = await runDualProbe(payloads, headers, countryIso2);
      const result = classifyFromResponses(payloads, dual.existText, dual.codeText, dual.proxyMode, dual.sessionTag, countryIso2, { partial: dual.partial, existOnly: false });
      rounds.push(result);
      if (!result.needsRecheck && result.accountStatus !== 'UNKNOWN') {
        if (!CONSENSUS_ENABLED || result.confidence >= LOW_CONFIDENCE_THRESHOLD) {
          if (result.isBanned && !(result.patternHints && result.patternHints.includes('HARD_BAN')) && attempt < INTERNAL_RETRIES) {
            await sleep(100);
            continue;
          }
          const out = { ...result, probeMode: 'dual', consensusRounds: rounds.length };
          stickySet(rawNumber, out);
          return out;
        }
      }
      if (CONSENSUS_ENABLED && attempt < INTERNAL_RETRIES) {
        await sleep(200 + Math.floor(Math.random() * 300));
        continue;
      }
      if (rounds.length >= 2) {
        const mc = { ...mergeConsensus(rounds), probeMode: 'consensus' };
        stickySet(rawNumber, mc);
        return mc;
      }
      return { ...result, probeMode: 'dual', consensusRounds: rounds.length };
    } catch (err) {
      lastError = err;
      if (attempt < INTERNAL_RETRIES) {
        const msg = String((err && err.message) || '');
        const wait = /too_many|rate|timeout|network|transport|PROXY/i.test(msg)
          ? (800 * attempt + Math.floor(Math.random() * 700))
          : (300 + Math.floor(Math.random() * 400));
        await sleep(wait);
        continue;
      }
    }
  }
  if (rounds.length >= 2) {
    const mc = { ...mergeConsensus(rounds), probeMode: 'consensus' };
    stickySet(rawNumber, mc);
    return mc;
  }
  if (rounds.length === 1 && rounds[0].accountStatus !== 'UNKNOWN') {
    return { ...rounds[0], consensusRounds: 1, probeMode: 'dual' };
  }
  return softFallback(rawNumber, payloads, countryIso2, lastError);
}

async function triggerEmailVerification(rawNumber) {
  const payloads = await WADetector.buildDualPayloads(String(rawNumber), { method: 'email' });
  if (!payloads.success) throw new Error(payloads.error || 'Nomor tidak valid.');

  const countryIso2 = resolveCountryIso2(payloads.phoneInfo);
  const headers = buildHeaders(payloads.userAgent, countryIso2);

  const probe = await runDualProbe(payloads, headers, countryIso2);
  const parsed = WADetector.parseDualResponse(payloads.phoneInfo, probe.existText, probe.codeText) || {};

  const maskedEmail = parsed.maskedEmail || null;
  const emailOtpEligible = Boolean(parsed.emailOtpEligible) || Boolean(maskedEmail);

  return {
    ...parsed,
    maskedEmail,
    emailOtpEligible,
    isBanned: Boolean(parsed.isBanned)
  };
}

module.exports = { checkWhatsAppCooldown, triggerEmailVerification, getHealth };