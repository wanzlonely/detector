const WADetector = require('./waEngine');
const { executeWithProxyRotation } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 8000);

function buildHeaders(userAgent) {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': userAgent,
    Accept: '*/*'
  };
}

async function postWithTimeout(url, body, headers, dispatcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, dispatcher, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error('WhatsApp HTTP ' + res.status + ': ' + text.slice(0, 180));
    if (!text) throw new Error('WhatsApp mengembalikan respons kosong.');
    return text;
  } catch (err) {
    const cause = err && err.cause;
    const detail = cause && (cause.code || cause.message) ? ' [' + (cause.code || cause.message) + ']' : '';
    throw new Error((err && err.message || 'Permintaan jaringan gagal') + detail);
  } finally {
    clearTimeout(timer);
  }
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

/** Format detik ke label UI WhatsApp: "Coba lagi dalam 2.00" */
function toWaUiTimer(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return 'Ready';
  if (sec >= 3600) {
    const h = Math.ceil(sec / 3600);
    return `Coba lagi dalam ${h} jam`;
  }
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `Coba lagi dalam ${m}.${s}`;
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

/**
 * Ambil timer multi-channel langsung dari response mentah WhatsApp.
 * Ini lebih akurat dibanding hanya mengandalkan field SMS di parseDualResponse.
 */
function extractChannelTimers(existRaw, codeRaw) {
  const exist = existRaw || {};
  const code = codeRaw || {};

  const existNoRoutes = exist.reason === 'no_routes';
  const codeNoRoutes = code.reason === 'no_routes';

  const existSms = existNoRoutes ? 0 : Math.max(num(exist.sms_wait), num(exist.send_sms_wait));
  const codeSms = codeNoRoutes ? 0 : Math.max(num(code.sms_wait), num(code.send_sms_wait));
  const waOldWait = Math.max(num(exist.wa_old_wait), num(code.wa_old_wait));
  const voiceWait = Math.max(num(exist.voice_wait), num(code.voice_wait));
  const flashWait = Math.max(num(exist.flash_wait), num(code.flash_wait));
  const retryAfter = Math.max(
    existNoRoutes ? 0 : num(exist.retry_after),
    codeNoRoutes ? 0 : num(code.retry_after)
  );

  // Deteksi echo timer wa_old di field sms (probe method=wa_old sering mengisi sms_wait ~125s)
  const isCodeSent = code.status === 'sent';
  const isWaOldEcho =
    existSms === 0 &&
    codeSms > 0 &&
    codeSms <= 180 &&
    (
      isCodeSent ||
      (waOldWait > 0 && Math.abs(codeSms - waOldWait) <= 5) ||
      (voiceWait > 0 && Math.abs(codeSms - voiceWait) <= 5 && num(code.send_sms_wait) === 0)
    );

  // SMS cooldown efektif: prioritaskan exist.sms_wait; abaikan echo wa_old
  let smsSeconds = isWaOldEcho ? 0 : Math.max(existSms, codeSms);
  // Jika retry_after lebih besar dan bukan echo, gunakan sebagai fallback
  if (!isWaOldEcho && retryAfter > smsSeconds && retryAfter > 0) {
    if (existSms > 0) {
      smsSeconds = existSms;
    } else if (smsSeconds === 0 && retryAfter > 180) {
      smsSeconds = retryAfter;
    }
  }

  const waOldEligible = Number(exist.wa_old_eligible ?? code.wa_old_eligible ?? 0) === 1;
  const deviceName =
    exist.wa_old_device_name ||
    code.wa_old_device_name ||
    exist.device_name ||
    null;

  return {
    sms: smsSeconds,
    wa_old: waOldWait,
    voice: voiceWait,
    flash: flashWait,
    retry_after: retryAfter,
    wa_old_eligible: waOldEligible,
    device_name: deviceName,
    is_wa_old_echo: isWaOldEcho
  };
}

function buildChannel(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  return {
    isCooldown: sec > 0,
    rawSeconds: sec,
    uiTimer: toShortTimer(sec),
    humanTime: toWaUiTimer(sec)
  };
}

async function checkWhatsAppCooldown(rawNumber) {
  const payloads = await WADetector.buildDualPayloads(String(rawNumber));
  if (!payloads.success) {
    throw new Error(payloads.error || 'Nomor tidak valid untuk diperiksa.');
  }

  const headers = buildHeaders(payloads.userAgent);

  const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
    const [existText, codeText] = await Promise.all([
      postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher),
      postWithTimeout(payloads.code.url, payloads.code.body, headers, proxyCtx.dispatcher)
    ]);
    return { existText, codeText };
  });

  const parsed = WADetector.parseDualResponse(payloads.phoneInfo, data.existText, data.codeText);
  const existResponse = safeJson(data.existText);
  const codeResponse = safeJson(data.codeText);
  const timers = extractChannelTimers(existResponse, codeResponse);

  const rawSmsEligible = existResponse.send_sms_eligible;
  const smsAvailable =
    typeof rawSmsEligible === 'boolean'
      ? rawSmsEligible
      : rawSmsEligible === 0 || rawSmsEligible === '0'
        ? false
        : rawSmsEligible === 1 || rawSmsEligible === '1'
          ? true
          : null;

  const channels = {
    sms: buildChannel(timers.sms),
    wa_old: buildChannel(timers.wa_old),
    voice: buildChannel(timers.voice),
    flash: buildChannel(timers.flash)
  };

  const anyChannelCooldown =
    channels.sms.isCooldown ||
    channels.wa_old.isCooldown ||
    channels.voice.isCooldown ||
    channels.flash.isCooldown;

  const primarySeconds =
    timers.sms ||
    timers.wa_old ||
    timers.voice ||
    timers.flash ||
    0;

  const isBanned = Boolean(parsed.isBanned);
  const isCloneBlocked = Boolean(parsed.isCloneBlocked);
  const isReady = !isBanned && !isCloneBlocked && !anyChannelCooldown && Boolean(parsed.isReady || primarySeconds === 0);

  let description = parsed.description || '';
  if (!isBanned && !isCloneBlocked) {
    if (timers.wa_old_eligible && timers.device_name) {
      description = `Nomor terdaftar di perangkat lain (${timers.device_name}).`;
    } else if (timers.wa_old_eligible) {
      description = 'Nomor terdaftar aktif di perangkat lain.';
    }
    if (anyChannelCooldown) {
      const bits = [];
      if (channels.sms.isCooldown) bits.push('SMS ' + channels.sms.humanTime);
      if (channels.wa_old.isCooldown) bits.push('Perangkat lain ' + channels.wa_old.humanTime);
      if (channels.voice.isCooldown) bits.push('Telepon ' + channels.voice.humanTime);
      if (channels.flash.isCooldown) bits.push('Flash ' + channels.flash.humanTime);
      if (bits.length) description = (description ? description + ' ' : '') + bits.join(' · ');
    }
  }

  return {
    formattedNumber: parsed.phone,
    region: parsed.country,
    accountStatus: parsed.state,
    isBanned,
    isCloneBlocked,
    isReady,
    smsAvailable,
    anyCooldown: anyChannelCooldown && !isBanned && !isCloneBlocked,
    description,
    deviceName: timers.device_name || null,
    waOldEligible: timers.wa_old_eligible,
    channels,
    primaryTimer: {
      rawSeconds: primarySeconds,
      uiTimer: toShortTimer(primarySeconds),
      humanTime: toWaUiTimer(primarySeconds)
    },
    proxyInfo: `${proxyMode} · ${sessionTag}`,
    proxyTag: sessionTag
  };
}

module.exports = {
  checkWhatsAppCooldown
};
