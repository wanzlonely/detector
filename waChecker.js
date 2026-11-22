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

function safeJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch (_) {
    return {};
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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

async function postWithTimeout(url, body, headers, dispatcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      dispatcher,
      signal: controller.signal
    });
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

function resolveCountryIso2(phoneInfo) {
  if (!phoneInfo) return null;
  const iso = String(phoneInfo.iso || phoneInfo.country_iso || '').trim().toLowerCase();
  if (/^[a-z]{2}$/.test(iso)) return iso;
  return null;
}

async function checkWhatsAppCooldown(rawNumber, opts = {}) {
  const skipSticky = opts && opts.skipSticky;
  if (!skipSticky) {
    const cached = stickyGet(rawNumber);
    if (cached) return Object.assign({}, cached, { stickyHit: true });
  }

  const digits = String(rawNumber || '').replace(/\D/g, '');
  const fallbackNumber = digits ? ('+' + digits) : String(rawNumber || '');

  try {
    const payloads = await WADetector.buildDualPayloads(rawNumber);
    if (!payloads || !payloads.success || !payloads.exist || !payloads.code) {
      return {
        formattedNumber: fallbackNumber,
        isBanned: false,
        isCloneBlocked: false,
        isReady: false,
        anyCooldown: false,
        accountStatus: 'UNKNOWN',
        error: true,
        softFallback: true,
        confidence: 0.2,
        deviceName: null,
        description: (payloads && payloads.error) || 'Payload gagal dibangun'
      };
    }

    const phoneInfo = payloads.phoneInfo || {};
    const countryIso2 = resolveCountryIso2(phoneInfo);
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      'User-Agent': payloads.userAgent || 'WhatsApp/2.24.0'
    };

    const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
      let existText = null;
      let codeText = null;
      try {
        existText = await postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher);
      } catch (_) {}
      await sleep(80);
      try {
        codeText = await postWithTimeout(payloads.code.url, payloads.code.body, headers, proxyCtx.dispatcher);
      } catch (_) {}
      if (!existText && !codeText) throw new Error('Dual probe gagal: jaringan');
      return { existText, codeText };
    }, undefined, countryIso2);

    const existRaw = data.existText || null;
    const codeRaw = data.codeText || null;
    const parsed = WADetector.parseDualResponse(phoneInfo, existRaw || '{}', codeRaw || '{}');

    const exist = safeJson(existRaw);
    const code = safeJson(codeRaw);

    let finalDevice =
      exist.wa_old_device_name ||
      code.wa_old_device_name ||
      exist.device_name ||
      code.device_name ||
      null;

    const isBanned = Boolean(parsed && parsed.isBanned);
    const isCloneBlocked = Boolean(parsed && (parsed.isCloneBlocked || parsed.isUnofficialAppBlock || parsed.isSecurityBlock));
    const isReady = Boolean(parsed && parsed.isReady);
    const anyCooldown = Boolean(parsed && parsed.isCooldown);
    const cooldownSeconds = Number((parsed && parsed.cooldownSeconds) || 0);

    let accountStatus = 'UNKNOWN';
    if (isBanned) accountStatus = 'BANNED';
    else if (isCloneBlocked) accountStatus = 'CLONE_BLOCKED';
    else if (isReady) accountStatus = 'READY';
    else if (anyCooldown) accountStatus = 'IN_COOLDOWN';

    const state = String((parsed && parsed.state) || '').toUpperCase();
    if (state === 'REGISTERED_ON_DEVICE' || state === 'AVAILABLE_READY') {
      if (!isBanned && !isCloneBlocked && !anyCooldown) {
        accountStatus = 'READY';
      }
    }

    const formattedNumber =
      (parsed && parsed.phone) ||
      (phoneInfo && (phoneInfo.e164 || phoneInfo.full)) ||
      fallbackNumber;

    const result = {
      formattedNumber: String(formattedNumber).startsWith('+') ? String(formattedNumber) : ('+' + String(formattedNumber).replace(/\D/g, '')),
      isBanned,
      isCloneBlocked,
      isReady: accountStatus === 'READY',
      anyCooldown: accountStatus === 'IN_COOLDOWN',
      accountStatus,
      error: false,
      softFallback: false,
      confidence: 0.88,
      deviceName: finalDevice || null,
      waOldEligible: Boolean(finalDevice) || state === 'REGISTERED_ON_DEVICE',
      channels: {
        sms: {
          isCooldown: cooldownSeconds > 0,
          rawSeconds: cooldownSeconds,
          uiTimer: toShortTimer(cooldownSeconds),
          formatted: toShortTimer(cooldownSeconds)
        }
      },
      proxyTag: proxyMode || sessionTag || '-',
      description:
        (parsed && parsed.description) ||
        (isBanned
          ? 'Dibatasi'
          : isCloneBlocked
            ? 'Tidak support clone'
            : accountStatus === 'READY'
              ? 'Siap diverifikasi'
              : accountStatus === 'IN_COOLDOWN'
                ? 'Cooldown ' + toShortTimer(cooldownSeconds)
                : 'Unknown'),
      state,
      cooldownSeconds
    };

    stickySet(rawNumber, result);
    return result;
  } catch (err) {
    return {
      formattedNumber: fallbackNumber,
      isBanned: false,
      isCloneBlocked: false,
      isReady: false,
      anyCooldown: false,
      accountStatus: 'UNKNOWN',
      error: true,
      softFallback: true,
      confidence: 0.2,
      deviceName: null,
      description: 'Gagal · ' + String((err && err.message) || err).slice(0, 100)
    };
  }
}

module.exports = { checkWhatsAppCooldown, getHealth };
