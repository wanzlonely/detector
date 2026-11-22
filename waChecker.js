const WADetector = require('./waEngine');
const { executeWithProxyRotation, getHealth } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 8000);
const STICKY_TTL_MS = Number(process.env.WA_STICKY_TTL_MS || 45000);
const STICKY_CACHE = new Map();

function stickyGet(raw) {
  const key = String(raw || '').replace(/\D/g, '');
  if (!key) return null;
  const hit = STICKY_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > STICKY_TTL_MS) { STICKY_CACHE.delete(key); return null; }
  return hit.result;
}
function stickySet(raw, result) {
  const key = String(raw || '').replace(/\D/g, '');
  if (!key || !result || result.softFallback || result.error) return;
  if ((Number(result.confidence) || 0) < 0.7) return;
  if (STICKY_CACHE.size > 500) { const first = STICKY_CACHE.keys().next().value; STICKY_CACHE.delete(first); }
  STICKY_CACHE.set(key, { ts: Date.now(), result: { ...result, stickyHit: true } });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function safeJson(text) { try { return JSON.parse(text || '{}'); } catch (_) { return {}; } }
function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }

function toShortTimer(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return '0s';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (s || !parts.length) parts.push(s + 's');
  return parts.join(' ');
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
  } finally { clearTimeout(timer); }
}

function extractDeviceName(exist, code) {
  return exist.wa_old_device_name || code.wa_old_device_name || exist.device_name || code.device_name || null;
}

async function checkWhatsAppCooldown(rawNumber, opts = {}) {
  const skipSticky = opts && opts.skipSticky;
  if (!skipSticky) {
    const cached = stickyGet(rawNumber);
    if (cached) return { ...cached, stickyHit: true };
  }
  try {
    const phoneInfo = WADetector.parsePhone ? WADetector.parsePhone(rawNumber) : { phone: String(rawNumber).replace(/\D/g, ''), e164: String(rawNumber) };
    const payloads = WADetector.buildPayloads ? WADetector.buildPayloads(phoneInfo) : null;
    if (!payloads || !payloads.exist || !payloads.code) {
      const digits = String(rawNumber || '').replace(/\D/g, '');
      return { formattedNumber: digits ? ('+' + digits) : String(rawNumber || ''), isBanned: false, isCloneBlocked: false, isReady: false, anyCooldown: false, accountStatus: 'UNKNOWN', error: true, softFallback: true, confidence: 0, deviceName: null, description: 'Payload gagal' };
    }
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*', 'User-Agent': 'WhatsApp/2.24.0' };
    const countryIso2 = (phoneInfo && (phoneInfo.iso || phoneInfo.country_iso)) || null;

    const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
      let existText = null, codeText = null;
      try { existText = await postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher); } catch (_) {}
      await sleep(80);
      try { codeText = await postWithTimeout(payloads.code.url, payloads.code.body, headers, proxyCtx.dispatcher); } catch (_) {}
      if (!existText && !codeText) throw new Error('Dual probe gagal');
      return { existText, codeText };
    }, undefined, countryIso2);

    const exist = safeJson(data.existText);
    const code = safeJson(data.codeText);
    const parsed = WADetector.parseDualResponse ? WADetector.parseDualResponse(phoneInfo, data.existText || '{}', data.codeText || '{}') : {};
    const deviceName = extractDeviceName(exist, code);
    const existSms = num(exist.sms_wait) || num(exist.send_sms_wait) || num(exist.sms_cooldown) || 0;
    const codeSms = num(code.sms_wait) || num(code.send_sms_wait) || 0;
    const smsWait = existSms || codeSms;
    const isBanned = Boolean(exist.status === 'banned' || code.status === 'banned' || exist.violation_type || code.violation_type);
    const isClone = Boolean(parsed.isCloneBlocked || parsed.isUnofficialAppBlock || String(exist.custom_block_screen || code.custom_block_screen || '').toLowerCase().includes('unofficial'));
    const waOldEligible = Number(exist.wa_old_eligible || code.wa_old_eligible || 0) === 1 || Boolean(deviceName);
    const isReady = !isBanned && !isClone && smsWait === 0 && (waOldEligible || (parsed && parsed.isReady));
    const anyCooldown = !isBanned && !isClone && smsWait > 0;

    let accountStatus = 'UNKNOWN';
    if (isBanned) accountStatus = 'BANNED';
    else if (isClone) accountStatus = 'CLONE_BLOCKED';
    else if (isReady) accountStatus = 'READY';
    else if (anyCooldown) accountStatus = 'IN_COOLDOWN';

    const result = {
      formattedNumber: (phoneInfo && (phoneInfo.e164 || phoneInfo.full)) || ('+' + String(rawNumber).replace(/\D/g, '')),
      isBanned,
      isCloneBlocked: isClone,
      isReady,
      anyCooldown,
      accountStatus,
      error: false,
      softFallback: false,
      confidence: 0.85,
      deviceName: deviceName || null,
      waOldEligible,
      channels: { sms: { isCooldown: smsWait > 0, rawSeconds: smsWait, uiTimer: toShortTimer(smsWait), formatted: toShortTimer(smsWait) } },
      proxyTag: proxyMode || sessionTag || '-',
      description: isBanned ? 'Dibatasi' : isClone ? 'Tidak support clone' : isReady ? 'Siap diverifikasi' : anyCooldown ? ('Cooldown ' + toShortTimer(smsWait)) : 'Unknown'
    };
    stickySet(rawNumber, result);
    return result;
  } catch (err) {
    const digits = String(rawNumber || '').replace(/\D/g, '');
    return {
      formattedNumber: digits ? ('+' + digits) : String(rawNumber || ''),
      isBanned: false, isCloneBlocked: false, isReady: false, anyCooldown: false,
      accountStatus: 'UNKNOWN', error: true, softFallback: true, confidence: 0.2,
      deviceName: null, description: 'Gagal · ' + String(err && err.message || err).slice(0, 80)
    };
  }
}

module.exports = { checkWhatsAppCooldown, getHealth };
