const WADetector = require('./waEngine');
const { executeWithProxyRotation } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 5500);

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
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      dispatcher,
      signal: controller.signal
    });
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

/** Resolve ISO-2 country for geo proxy from phoneInfo / parsed */
function resolveCountryIso2(phoneInfo, parsed) {
  const candidates = [
    phoneInfo && phoneInfo.iso,
    phoneInfo && phoneInfo.country_iso,
    phoneInfo && phoneInfo.country_code_iso,
    parsed && parsed.country_iso,
    parsed && parsed.iso
  ];
  for (const c of candidates) {
    const s = String(c || '').trim().toLowerCase();
    if (/^[a-z]{2}$/.test(s)) return s;
  }
  // Fallback from dialing code maps for common cases
  const cc = String(
    (phoneInfo && (phoneInfo.cc || phoneInfo.country_code || phoneInfo.phone_cc)) || ''
  ).replace(/\D/g, '');
  const DIAL_ISO = {
    '1': 'us', '7': 'ru', '20': 'eg', '27': 'za', '30': 'gr', '31': 'nl', '32': 'be',
    '33': 'fr', '34': 'es', '36': 'hu', '39': 'it', '40': 'ro', '41': 'ch', '43': 'at',
    '44': 'gb', '45': 'dk', '46': 'se', '47': 'no', '48': 'pl', '49': 'de', '51': 'pe',
    '52': 'mx', '53': 'cu', '54': 'ar', '55': 'br', '56': 'cl', '57': 'co', '58': 've',
    '60': 'my', '61': 'au', '62': 'id', '63': 'ph', '64': 'nz', '65': 'sg', '66': 'th',
    '81': 'jp', '82': 'kr', '84': 'vn', '86': 'cn', '90': 'tr', '91': 'in', '92': 'pk',
    '93': 'af', '94': 'lk', '95': 'mm', '98': 'ir', '212': 'ma', '213': 'dz', '216': 'tn',
    '218': 'ly', '220': 'gm', '221': 'sn', '233': 'gh', '234': 'ng', '254': 'ke',
    '255': 'tz', '256': 'ug', '260': 'zm', '263': 'zw', '880': 'bd', '966': 'sa',
    '971': 'ae', '972': 'il', '974': 'qa', '977': 'np', '880': 'bd'
  };
  if (cc && DIAL_ISO[cc]) return DIAL_ISO[cc];
  return null;
}

function extractChannelTimers(existRaw, codeRaw) {
  const exist = existRaw || {};
  const code = codeRaw || {};

  const existNoRoutes = exist.reason === 'no_routes' || exist.reason === 'no_route';
  const codeNoRoutes = code.reason === 'no_routes' || code.reason === 'no_route';

  const existSms = existNoRoutes ? 0 : Math.max(num(exist.sms_wait), num(exist.send_sms_wait), num(exist.sms_cooldown));
  const codeSms = codeNoRoutes ? 0 : Math.max(num(code.sms_wait), num(code.send_sms_wait), num(code.sms_cooldown));
  const waOldWait = Math.max(num(exist.wa_old_wait), num(code.wa_old_wait), num(exist.wa_old_cooldown), num(code.wa_old_cooldown));
  const voiceWait = Math.max(num(exist.voice_wait), num(code.voice_wait), num(exist.voice_cooldown), num(code.voice_cooldown));
  const flashWait = Math.max(num(exist.flash_wait), num(code.flash_wait), num(exist.flash_cooldown), num(code.flash_cooldown));
  const retryAfter = Math.max(
    existNoRoutes ? 0 : num(exist.retry_after),
    codeNoRoutes ? 0 : num(code.retry_after)
  );

  const isCodeSent = code.status === 'sent' || code.status === 'ok';
  const isWaOldEcho =
    existSms === 0 &&
    codeSms > 0 &&
    codeSms <= 180 &&
    (
      isCodeSent ||
      (waOldWait > 0 && Math.abs(codeSms - waOldWait) <= 12) ||
      (voiceWait > 0 && Math.abs(codeSms - voiceWait) <= 12 && num(code.send_sms_wait) === 0) ||
      (code.method === 'wa_old' || String(code.login_method || '').includes('wa_old'))
    );

  let smsSeconds = 0;
  if (isWaOldEcho) smsSeconds = 0;
  else if (existSms > 0) smsSeconds = existSms;
  else smsSeconds = codeSms;

  if (!isWaOldEcho && smsSeconds === 0 && retryAfter > 180) {
    smsSeconds = retryAfter;
  }

  const waOldEligible =
    Number(exist.wa_old_eligible ?? code.wa_old_eligible ?? 0) === 1 ||
    Boolean(exist.wa_old_device_name || code.wa_old_device_name);

  const deviceName =
    exist.wa_old_device_name ||
    code.wa_old_device_name ||
    exist.device_name ||
    code.device_name ||
    null;

  return {
    sms: smsSeconds,
    wa_old: waOldWait,
    voice: voiceWait,
    flash: flashWait,
    retry_after: retryAfter,
    wa_old_eligible: waOldEligible,
    device_name: deviceName,
    is_wa_old_echo: isWaOldEcho,
    exist_no_routes: existNoRoutes,
    code_no_routes: codeNoRoutes
  };
}

function buildChannel(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  return {
    isCooldown: sec > 0,
    rawSeconds: sec,
    uiTimer: toShortTimer(sec),
    humanTime: toWaUiTimer(sec),
    formatted: toShortTimer(sec)
  };
}

function detectBanSignals(exist, code, parsed) {
  const statusBanned =
    exist.status === 'banned' ||
    code.status === 'banned' ||
    exist.reason === 'blocked' ||
    code.reason === 'blocked' ||
    exist.reason === 'banned' ||
    code.reason === 'banned';

  const hardViolation = Boolean(
    exist.violation_type ||
    code.violation_type ||
    exist.in_app_ban_appeal ||
    code.in_app_ban_appeal
  );

  const appealToken = Boolean(exist.appeal_token || code.appeal_token);
  const weakBanHint = appealToken && (statusBanned || hardViolation);
  const parsedBan = Boolean(parsed && parsed.isBanned);

  return Boolean(statusBanned || hardViolation || weakBanHint || parsedBan);
}

function detectCloneSignals(exist, code, parsed) {
  const blockScreen = String(
    exist.custom_block_screen || code.custom_block_screen ||
    exist.block_screen || code.block_screen || ''
  ).toLowerCase();

  const reason = String(exist.reason || code.reason || '').toLowerCase();
  const status = String(exist.status || code.status || '').toLowerCase();
  const textBlob = JSON.stringify({ exist, code }).toLowerCase();

  const unofficial =
    blockScreen.includes('unofficial') ||
    blockScreen.includes('clone') ||
    reason.includes('unofficial') ||
    (textBlob.includes('whatsapp business') && textBlob.includes('official app')) ||
    Boolean(parsed && parsed.isCloneBlocked);

  const security =
    blockScreen.includes('security') ||
    reason.includes('security') ||
    status.includes('security') ||
    textBlob.includes('demi keamanan') ||
    textBlob.includes('login not available right now') ||
    textBlob.includes('tidak dapat masuk saat ini') ||
    Boolean(parsed && parsed.isSecurityBlock);

  return {
    isCloneBlocked: Boolean(unofficial || (parsed && parsed.isCloneBlocked)),
    isSecurityBlock: Boolean(security)
  };
}

/**
 * Smarter SMS availability:
 * - Explicit true → available
 * - Explicit false ONLY if both probes agree AND no_routes / no other OTP path
 * - null / missing → treat as unknown (do NOT mark as "opsi SMS tidak ditemukan")
 * Screenshot case: wa_old device + SMS selectable in UI must count as verifiable.
 */
function resolveSmsAvailability(exist, code, timers) {
  const e = exist.send_sms_eligible;
  const c = code.send_sms_eligible;

  const toBool = (v) => {
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === '1') return true;
    if (v === 0 || v === '0') return false;
    return null;
  };

  const eB = toBool(e);
  const cB = toBool(c);

  // Strong positive
  if (eB === true || cB === true) return true;

  // Both explicitly false AND no_routes on exist → likely no SMS path
  if (eB === false && cB === false && timers.exist_no_routes) return false;
  if (eB === false && timers.exist_no_routes && cB === null) return false;

  // wa_old eligible usually still allows SMS / device confirm in real UI
  if (timers.wa_old_eligible) return true;

  // If we got a real (non-echo) sms_wait value, SMS channel exists (may be on cooldown)
  if (timers.sms > 0) return true;

  // Unknown — do not punish as "SMS not found"
  return null;
}

async function checkWhatsAppCooldown(rawNumber) {
  const payloads = await WADetector.buildDualPayloads(String(rawNumber));
  if (!payloads.success) {
    throw new Error(payloads.error || 'Nomor tidak valid untuk diperiksa.');
  }

  const headers = buildHeaders(payloads.userAgent);
  const countryIso2 = resolveCountryIso2(payloads.phoneInfo, null);

  const { data, proxyMode, sessionTag } = await executeWithProxyRotation(
    async (proxyCtx) => {
      const [existText, codeText] = await Promise.all([
        postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher),
        postWithTimeout(payloads.code.url, payloads.code.body, headers, proxyCtx.dispatcher)
      ]);
      return { existText, codeText };
    },
    undefined,
    countryIso2
  );

  const parsed = WADetector.parseDualResponse(payloads.phoneInfo, data.existText, data.codeText);
  const existResponse = safeJson(data.existText);
  const codeResponse = safeJson(data.codeText);
  const timers = extractChannelTimers(existResponse, codeResponse);

  const smsAvailable = resolveSmsAvailability(existResponse, codeResponse, timers);

  const channels = {
    sms: buildChannel(timers.sms),
    wa_old: buildChannel(timers.wa_old),
    voice: buildChannel(timers.voice),
    flash: buildChannel(timers.flash)
  };

  const smsCooldownActive = channels.sms.rawSeconds > 0;
  const otherOtpCooldown =
    !smsCooldownActive &&
    (channels.voice.rawSeconds > 120 || channels.flash.rawSeconds > 120);
  const meaningfulCooldown = smsCooldownActive || otherOtpCooldown;

  const isBanned = detectBanSignals(existResponse, codeResponse, parsed);
  const cloneSig = detectCloneSignals(existResponse, codeResponse, parsed);
  const isCloneBlocked = cloneSig.isCloneBlocked && !isBanned;
  const isSecurityBlock = cloneSig.isSecurityBlock && !isBanned && !isCloneBlocked;

  // Can verify if any OTP path is open (SMS / wa_old device / short voice)
  const hasOpenPath =
    smsAvailable === true ||
    timers.wa_old_eligible ||
    (smsAvailable !== false && !timers.exist_no_routes) ||
    (channels.voice.rawSeconds === 0 && !timers.exist_no_routes);

  const isReady =
    !isBanned &&
    !isCloneBlocked &&
    !isSecurityBlock &&
    !meaningfulCooldown &&
    hasOpenPath;

  // True "SMS option not found" only when hard-negative and no alternative path
  const smsOptionMissing =
    !isBanned &&
    !isCloneBlocked &&
    !isSecurityBlock &&
    !meaningfulCooldown &&
    !isReady &&
    smsAvailable === false &&
    !timers.wa_old_eligible;

  let description = parsed.description || '';
  if (isBanned) {
    description = 'Nomor dibatasi / diblokir oleh WhatsApp.';
  } else if (isCloneBlocked) {
    description = 'Membutuhkan aplikasi WhatsApp resmi (tidak support clone/unofficial).';
  } else if (isSecurityBlock) {
    description = 'Demi keamanan: login sementara tidak tersedia.';
  } else if (meaningfulCooldown) {
    const t = channels.sms.rawSeconds > 0
      ? channels.sms.humanTime
      : (channels.voice.humanTime || channels.flash.humanTime);
    description = 'Cooldown aktif · ' + t;
  } else if (isReady) {
    description = timers.wa_old_eligible && timers.device_name
      ? 'Siap diverifikasi · terdaftar di ' + timers.device_name
      : 'Nomor siap menerima verifikasi.';
  } else if (smsOptionMissing) {
    description = 'Opsi SMS tidak tersedia untuk nomor ini.';
  }

  let accountStatus = 'UNKNOWN';
  if (isBanned) accountStatus = 'BANNED';
  else if (isCloneBlocked) accountStatus = 'CLONE_OR_UNOFFICIAL_APP_BLOCK';
  else if (isSecurityBlock) accountStatus = 'SECURITY_BLOCK';
  else if (meaningfulCooldown) accountStatus = 'IN_COOLDOWN';
  else if (isReady) accountStatus = timers.wa_old_eligible ? 'REGISTERED_ON_DEVICE' : 'AVAILABLE_READY';
  else if (smsOptionMissing) accountStatus = 'SMS_UNAVAILABLE';

  const primarySeconds = channels.sms.rawSeconds > 0
    ? channels.sms.rawSeconds
    : (otherOtpCooldown ? Math.max(channels.voice.rawSeconds, channels.flash.rawSeconds) : 0);

  return {
    formattedNumber: parsed.phone || payloads.phoneInfo?.full || String(rawNumber),
    region: parsed.country || payloads.phoneInfo?.country_name || '-',
    accountStatus,
    isBanned,
    isCloneBlocked,
    isSecurityBlock,
    isReady,
    smsAvailable,
    smsOptionMissing,
    anyCooldown: meaningfulCooldown && !isBanned && !isCloneBlocked && !isSecurityBlock,
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
    proxyTag: sessionTag,
    proxyCountry: countryIso2,
    rawStatus: parsed.rawStatus || existResponse.status || codeResponse.status || null,
    rawReason: parsed.rawReason || existResponse.reason || codeResponse.reason || null,
    isWaOldEcho: timers.is_wa_old_echo
  };
}

module.exports = {
  checkWhatsAppCooldown
};
