const WADetector = require('./waEngine');
const { executeWithProxyRotation, getHealth } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 10000);
const INTERNAL_RETRIES = Math.min(4, Math.max(2, Number(process.env.WA_CHECK_INTERNAL_RETRIES || 3)));
const CONSENSUS_ENABLED = String(process.env.WA_CONSENSUS || '1') !== '0';
const LOW_CONFIDENCE_THRESHOLD = Number(process.env.WA_LOW_CONFIDENCE || 0.72);

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

function toWaUiTimer(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return 'Ready';
  if (sec >= 3600) return `Coba lagi dalam ${Math.ceil(sec / 3600)} jam`;
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

function resolveCountryIso2(phoneInfo) {
  const candidates = [phoneInfo && phoneInfo.iso, phoneInfo && phoneInfo.country_iso, phoneInfo && phoneInfo.country_code_iso];
  for (const c of candidates) {
    const s = String(c || '').trim().toLowerCase();
    if (/^[a-z]{2}$/.test(s)) return s;
  }
  const cc = String((phoneInfo && (phoneInfo.cc || phoneInfo.country_code)) || '').replace(/\D/g, '');
  const DIAL_ISO = {'1':'us','7':'ru','20':'eg','27':'za','30':'gr','31':'nl','32':'be','33':'fr','34':'es','36':'hu','39':'it','40':'ro','41':'ch','43':'at','44':'gb','45':'dk','46':'se','47':'no','48':'pl','49':'de','51':'pe','52':'mx','53':'cu','54':'ar','55':'br','56':'cl','57':'co','58':'ve','60':'my','61':'au','62':'id','63':'ph','64':'nz','65':'sg','66':'th','81':'jp','82':'kr','84':'vn','86':'cn','90':'tr','91':'in','92':'pk','93':'af','94':'lk','95':'mm','98':'ir','211':'ss','212':'ma','213':'dz','216':'tn','218':'ly','220':'gm','221':'sn','222':'mr','223':'ml','224':'gn','225':'ci','226':'bf','227':'ne','228':'tg','229':'bj','230':'mu','231':'lr','232':'sl','233':'gh','234':'ng','235':'td','236':'cf','237':'cm','238':'cv','240':'gq','241':'ga','242':'cg','243':'cd','244':'ao','245':'gw','248':'sc','249':'sd','250':'rw','251':'et','252':'so','253':'dj','254':'ke','255':'tz','256':'ug','257':'bi','258':'mz','260':'zm','261':'mg','262':'re','263':'zw','264':'na','265':'mw','266':'ls','267':'bw','268':'sz','269':'km','351':'pt','352':'lu','353':'ie','354':'is','355':'al','356':'mt','357':'cy','358':'fi','359':'bg','370':'lt','371':'lv','372':'ee','373':'md','374':'am','375':'by','376':'ad','377':'mc','380':'ua','381':'rs','382':'me','383':'xk','385':'hr','386':'si','387':'ba','389':'mk','420':'cz','421':'sk','423':'li','501':'bz','502':'gt','503':'sv','504':'hn','505':'ni','506':'cr','507':'pa','509':'ht','591':'bo','592':'gy','593':'ec','595':'py','597':'sr','598':'uy','599':'cw','670':'tl','673':'bn','675':'pg','676':'to','677':'sb','678':'vu','679':'fj','685':'ws','852':'hk','853':'mo','855':'kh','856':'la','880':'bd','886':'tw','960':'mv','961':'lb','962':'jo','963':'sy','964':'iq','965':'kw','966':'sa','967':'ye','968':'om','970':'ps','971':'ae','972':'il','973':'bh','974':'qa','975':'bt','976':'mn','977':'np','992':'tj','993':'tm','994':'az','995':'ge','996':'kg','998':'uz'};
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

  // Prefer EXIST timers — /v2/code often mutates state and invents inflated waits
  const existSms = existNoRoutes ? 0 : Math.max(num(exist.sms_wait), num(exist.send_sms_wait), num(exist.sms_cooldown));
  const codeSmsRaw = codeNoRoutes ? 0 : Math.max(num(code.sms_wait), num(code.send_sms_wait), num(code.sms_cooldown));
  const existVoice = Math.max(num(exist.voice_wait), num(exist.voice_cooldown));
  const codeVoice = Math.max(num(code.voice_wait), num(code.voice_cooldown));
  const existFlash = Math.max(num(exist.flash_wait), num(exist.flash_cooldown));
  const codeFlash = Math.max(num(code.flash_wait), num(code.flash_cooldown));
  const waOldWait = Math.max(num(exist.wa_old_wait), num(exist.wa_old_cooldown), num(code.wa_old_wait), num(code.wa_old_cooldown));
  const existRetry = existNoRoutes ? 0 : num(exist.retry_after);
  const codeRetry = codeNoRoutes ? 0 : num(code.retry_after);
  const retryAfter = Math.max(existRetry, codeRetry);

  const isCodeSent = code.status === 'sent' || code.status === 'ok';
  const codeMethod = String(code.method || code.login_method || '').toLowerCase();
  const isWaOldMethod = codeMethod.includes('wa_old');

  const isWaOldEcho =
    existSms === 0 && codeSmsRaw > 0 && codeSmsRaw <= 300 &&
    (isCodeSent || isWaOldMethod ||
      (waOldWait > 0 && Math.abs(codeSmsRaw - waOldWait) <= 8) ||
      (existVoice > 0 && Math.abs(codeSmsRaw - existVoice) <= 8 && num(code.send_sms_wait) === 0) ||
      (codeVoice > 0 && Math.abs(codeSmsRaw - codeVoice) <= 8 && num(code.send_sms_wait) === 0));

  let smsSeconds = 0;
  if (existSms > 0) {
    smsSeconds = existSms;
  } else if (!isWaOldEcho && codeSmsRaw > 0) {
    // Inflated code-only waits (common 300) without exist confirmation → ignore
    if (codeSmsRaw >= 240 && existSms === 0 && !num(code.send_sms_wait)) {
      smsSeconds = 0;
    } else {
      smsSeconds = codeSmsRaw;
    }
  }
  if (smsSeconds === 0 && !isWaOldEcho && existRetry > 30) {
    smsSeconds = existRetry;
  }

  let voiceWait = existVoice > 0 ? existVoice : (isWaOldEcho ? 0 : codeVoice);
  let flashWait = existFlash > 0 ? existFlash : (isWaOldEcho ? 0 : codeFlash);
  if (voiceWait >= 240 && existVoice === 0 && isWaOldMethod) voiceWait = 0;
  if (flashWait >= 240 && existFlash === 0 && isWaOldMethod) flashWait = 0;

  const waOldEligible =
    Number(exist.wa_old_eligible ?? code.wa_old_eligible ?? 0) === 1 ||
    Boolean(exist.wa_old_device_name || code.wa_old_device_name);
  const deviceName = exist.wa_old_device_name || code.wa_old_device_name || exist.device_name || code.device_name || null;

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
    code_no_routes: codeNoRoutes,
    is_code_sent: isCodeSent,
    exist_sms: existSms,
    code_sms: codeSmsRaw
  };
}

function buildChannel(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  return { isCooldown: sec > 0, rawSeconds: sec, uiTimer: toShortTimer(sec), humanTime: toWaUiTimer(sec), formatted: toShortTimer(sec) };
}

function applyPatternLibrary(exist, code, timers, engineState) {
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
  if (parsed && parsed.isBanned === true) return true;
  const statusBanned = exist.status === 'banned' || code.status === 'banned' || exist.reason === 'blocked' || code.reason === 'blocked' || exist.reason === 'banned' || code.reason === 'banned';
  const hardViolation = Boolean(exist.violation_type || code.violation_type || exist.in_app_ban_appeal || code.in_app_ban_appeal);
  return Boolean(statusBanned || hardViolation);
}

function detectCloneSignals(exist, code, parsed) {
  if (parsed && (parsed.isCloneBlocked || parsed.isUnofficialAppBlock)) return { isCloneBlocked: true, isSecurityBlock: Boolean(parsed.isSecurityBlock) };
  const blockScreen = String(exist.custom_block_screen || code.custom_block_screen || exist.block_screen || code.block_screen || '').toLowerCase();
  const reason = String(exist.reason || code.reason || '').toLowerCase();
  const status = String(exist.status || code.status || '').toLowerCase();
  const textBlob = JSON.stringify({ exist, code }).toLowerCase();
  const unofficial = blockScreen.includes('unofficial') || blockScreen.includes('clone') || reason.includes('unofficial') || (textBlob.includes('whatsapp business') && textBlob.includes('official app'));
  const security = blockScreen.includes('security') || reason.includes('security') || status.includes('security') || textBlob.includes('demi keamanan') || textBlob.includes('login not available right now') || textBlob.includes('tidak dapat masuk saat ini') || Boolean(parsed && parsed.isSecurityBlock);
  return { isCloneBlocked: Boolean(unofficial), isSecurityBlock: Boolean(security) };
}

function resolveSmsAvailability(exist, code, timers, patternHints) {
  const toBool = (v) => { if (typeof v === 'boolean') return v; if (v === 1 || v === '1') return true; if (v === 0 || v === '0') return false; return null; };
  const eB = toBool(exist.send_sms_eligible);
  const cB = toBool(code.send_sms_eligible);
  if (eB === true || cB === true) return true;
  if (timers.wa_old_eligible) return true;
  if (timers.sms > 0) return true;
  if (timers.is_code_sent) return true;
  if (patternHints.includes('CODE_SENT_READY') || patternHints.includes('HIGH_REREG')) return true;
  if (patternHints.includes('NO_ROUTES') && eB === false) return false;
  if (eB === false && cB === false && timers.exist_no_routes) return false;
  if (eB === false && timers.exist_no_routes && cB === null) return false;
  return null;
}

async function runDualProbe(payloads, headers, countryIso2) {
  const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
    const [existSettled, codeSettled] = await Promise.allSettled([
      postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher),
      postWithTimeout(payloads.code.url, payloads.code.body, headers, proxyCtx.dispatcher)
    ]);
    const existText = existSettled.status === 'fulfilled' ? existSettled.value : null;
    const codeText = codeSettled.status === 'fulfilled' ? codeSettled.value : null;
    if (!existText && !codeText) {
      const e1 = existSettled.reason && existSettled.reason.message;
      const e2 = codeSettled.reason && codeSettled.reason.message;
      throw new Error('Dual probe gagal: ' + (e1 || e2 || 'jaringan'));
    }
    return { existText, codeText, partial: !existText || !codeText };
  }, undefined, countryIso2);
  return { existText: data.existText || null, codeText: data.codeText || null, partial: Boolean(data.partial), proxyMode, sessionTag };
}

async function runExistOnlyProbe(payloads, headers, countryIso2) {
  const { data, proxyMode, sessionTag } = await executeWithProxyRotation(async (proxyCtx) => {
    const existText = await postWithTimeout(payloads.exist.url, payloads.exist.body, headers, proxyCtx.dispatcher);
    return { existText, codeText: null, partial: true };
  }, 2, countryIso2);
  return { existText: data.existText || null, codeText: null, partial: true, proxyMode, sessionTag, existOnly: true };
}

function classifyFromResponses(payloads, existText, codeText, proxyMode, sessionTag, countryIso2, meta) {
  const existResponse = safeJson(existText);
  const codeResponse = safeJson(codeText);
  const parsed = WADetector.parseDualResponse(payloads.phoneInfo, existText || '{}', codeText || '{}');
  const timers = extractChannelTimers(existResponse, codeResponse);
  const engineState = String((parsed && parsed.state) || '').toUpperCase();
  const patternHints = applyPatternLibrary(existResponse, codeResponse, timers, engineState);
  const smsAvailable = resolveSmsAvailability(existResponse, codeResponse, timers, patternHints);
  const channels = { sms: buildChannel(timers.sms), wa_old: buildChannel(timers.wa_old), voice: buildChannel(timers.voice), flash: buildChannel(timers.flash) };
  const engineReady = Boolean(parsed && parsed.isReady);
  const engineCooldown = Boolean(parsed && parsed.isCooldown);
  const engineClone = Boolean(parsed && (parsed.isCloneBlocked || parsed.isUnofficialAppBlock));
  const engineSecurity = Boolean(parsed && parsed.isSecurityBlock);

  const smsCooldownActive = channels.sms.rawSeconds > 15;
  const otherOtpCooldown = !smsCooldownActive && (channels.voice.rawSeconds > 30 || channels.flash.rawSeconds > 30);
  const timerCooldown = smsCooldownActive || otherOtpCooldown;

  let isBanned = detectBanSignals(existResponse, codeResponse, parsed, patternHints);
  if (isBanned && (timerCooldown || engineCooldown || patternHints.includes('TEMP_LOCK') || patternHints.includes('RATE_LIMIT'))) {
    if (!patternHints.includes('HARD_BAN')) {
      const hard = existResponse.status === 'banned' || codeResponse.status === 'banned' || existResponse.reason === 'banned' || codeResponse.reason === 'banned' || existResponse.reason === 'blocked' || codeResponse.reason === 'blocked';
      if (!hard) isBanned = false;
    }
  }
  if (engineState === 'TEMP_LOCKED_COOLDOWN' || engineState === 'RATE_LIMITED_COOLDOWN' || engineState === 'IN_COOLDOWN') isBanned = false;

  const cloneSig = detectCloneSignals(existResponse, codeResponse, parsed);
  const isCloneBlocked = (cloneSig.isCloneBlocked || engineClone) && !isBanned;
  const isSecurityBlock = (cloneSig.isSecurityBlock || engineSecurity) && !isBanned && !isCloneBlocked;

  const meaningfulCooldown =
    !isBanned && !isCloneBlocked && !isSecurityBlock &&
    (engineCooldown || timerCooldown || patternHints.includes('TEMP_LOCK') || patternHints.includes('RATE_LIMIT') ||
      engineState === 'TEMP_LOCKED_COOLDOWN' || engineState === 'RATE_LIMITED_COOLDOWN' || engineState === 'IN_COOLDOWN');

  const existSmsOpen = timers.exist_sms === 0 && !timers.exist_no_routes;
  const hasOpenPath =
    engineReady || smsAvailable === true || timers.wa_old_eligible || timers.is_code_sent ||
    patternHints.includes('CODE_SENT_READY') || patternHints.includes('HIGH_REREG') ||
    patternHints.includes('METHOD_NOT_ALLOWED_SOFT') ||
    (smsAvailable !== false && !timers.exist_no_routes) ||
    (existSmsOpen && smsAvailable !== false);

  let isReady =
    !isBanned && !isCloneBlocked && !isSecurityBlock && !meaningfulCooldown &&
    (engineReady || hasOpenPath || engineState === 'AVAILABLE_READY' || engineState === 'REGISTERED_ON_DEVICE');
  if (!isBanned && !isCloneBlocked && !isSecurityBlock && existSmsOpen && !smsCooldownActive && (engineReady || smsAvailable !== false)) {
    isReady = true;
  }
  if (engineReady && !isBanned && !isCloneBlocked && !isSecurityBlock) isReady = true;

  const effectiveCooldown = isReady ? false : meaningfulCooldown;

  const smsOptionMissing =
    !isBanned && !isCloneBlocked && !isSecurityBlock && !meaningfulCooldown && !isReady &&
    (smsAvailable === false || engineState === 'NO_ROUTES' || patternHints.includes('NO_ROUTES')) &&
    !timers.wa_old_eligible && !patternHints.includes('HIGH_REREG');

  let description = (parsed && parsed.description) || '';
  if (isBanned) description = 'Nomor dibatasi / diblokir oleh WhatsApp.';
  else if (isCloneBlocked) description = 'Membutuhkan aplikasi WhatsApp resmi (tidak support clone/unofficial).';
  else if (isSecurityBlock) description = 'Demi keamanan: login sementara tidak tersedia.';
  else if (effectiveCooldown) {
    description = 'Cooldown aktif · ' + (
      channels.sms.rawSeconds > 0 ? channels.sms.humanTime : (channels.voice.humanTime || channels.flash.humanTime || 'aktif')
    );
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
  else if (effectiveCooldown) accountStatus = 'IN_COOLDOWN';
  else if (isReady) accountStatus = timers.wa_old_eligible ? 'REGISTERED_ON_DEVICE' : 'AVAILABLE_READY';
  else if (smsOptionMissing) accountStatus = 'SMS_UNAVAILABLE';

  let confidence = 0.55;
  if (isBanned && patternHints.includes('HARD_BAN')) confidence = 0.96;
  else if (isBanned) confidence = 0.9;
  else if (isCloneBlocked || isSecurityBlock) confidence = 0.88;
  else if (effectiveCooldown && channels.sms.rawSeconds > 0) confidence = 0.92;
  else if (effectiveCooldown) confidence = 0.8;
  else if (isReady && (timers.wa_old_eligible || timers.is_code_sent || engineReady)) confidence = 0.9;
  else if (isReady) confidence = 0.78;
  else if (smsOptionMissing) confidence = 0.7;
  if (meta && meta.partial) confidence -= 0.12;
  if (meta && meta.existOnly) confidence -= 0.18;
  if (patternHints.includes('WA_OLD_ECHO') && isReady) confidence = Math.max(confidence, 0.88);
  confidence = Math.max(0.2, Math.min(0.99, confidence));

  const positiveTimers = [channels.sms.rawSeconds, channels.voice.rawSeconds, channels.flash.rawSeconds]
    .filter((s) => Number(s) > 0)
    .sort((a, b) => a - b);
  const primarySeconds = positiveTimers.length ? positiveTimers[0] : 0;

  return {
    formattedNumber: normalizeDisplayNumber(payloads.rawNumber, payloads.phoneInfo, parsed && parsed.phone),
    region: (parsed && parsed.country) || payloads.phoneInfo?.country_name || '-',
    accountStatus, isBanned, isCloneBlocked, isSecurityBlock, isReady, smsAvailable, smsOptionMissing,
    anyCooldown: effectiveCooldown, description, deviceName: timers.device_name || null, waOldEligible: timers.wa_old_eligible,
    channels, primaryTimer: { rawSeconds: primarySeconds, uiTimer: toShortTimer(primarySeconds), humanTime: toWaUiTimer(primarySeconds) },
    proxyInfo: proxyMode + ' · ' + sessionTag, proxyTag: sessionTag, proxyCountry: countryIso2,
    rawStatus: (parsed && parsed.rawStatus) || existResponse.status || codeResponse.status || null,
    rawReason: (parsed && parsed.rawReason) || existResponse.reason || codeResponse.reason || null,
    isWaOldEcho: timers.is_wa_old_echo, partialResponse: !existText || !codeText, engineState, patternHints,
    confidence, needsRecheck: confidence < LOW_CONFIDENCE_THRESHOLD || accountStatus === 'UNKNOWN', error: false
  };
}

function mergeConsensus(results) {
  if (!results.length) return null;
  if (results.length === 1) return results[0];
  const score = { ready: 0, cooldown: 0, banned: 0, clone: 0, sms: 0 };
  for (const r of results) {
    const w = Number(r.confidence) || 0.5;
    if (r.isBanned) score.banned += w;
    else if (r.isCloneBlocked || r.isSecurityBlock) score.clone += w;
    else if (r.anyCooldown) score.cooldown += w;
    else if (r.smsOptionMissing) score.sms += w;
    else if (r.isReady) score.ready += w;
    else score.cooldown += w * 0.5;
  }
  let best = 'cooldown', bestVal = -1;
  for (const [k, v] of Object.entries(score)) { if (v > bestVal) { bestVal = v; best = k; } }
  const match = results.filter((r) => {
    if (best === 'banned') return r.isBanned;
    if (best === 'clone') return r.isCloneBlocked || r.isSecurityBlock;
    if (best === 'cooldown') return r.anyCooldown || r.softFallback;
    if (best === 'sms') return r.smsOptionMissing;
    if (best === 'ready') return r.isReady;
    return false;
  }).sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  const base = match || results.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  const avgConf = results.reduce((s, r) => s + (r.confidence || 0), 0) / results.length;
  return { ...base, confidence: Math.min(0.99, Math.max(avgConf, base.confidence || 0)), consensusVotes: score, consensusRounds: results.length, needsRecheck: false };
}

async function probeOnce(payloads, headers, countryIso2, mode) {
  const probe = mode === 'exist'
    ? await runExistOnlyProbe(payloads, headers, countryIso2)
    : await runDualProbe(payloads, headers, countryIso2);
  return classifyFromResponses(payloads, probe.existText, probe.codeText, probe.proxyMode, probe.sessionTag, countryIso2, { partial: probe.partial, existOnly: Boolean(probe.existOnly) });
}

function softFallback(rawNumber, payloads, countryIso2, lastError) {
  return {
    formattedNumber: normalizeDisplayNumber(rawNumber, payloads.phoneInfo, null),
    region: payloads.phoneInfo?.country_name || '-',
    accountStatus: 'IN_COOLDOWN', isBanned: false, isCloneBlocked: false, isSecurityBlock: false, isReady: false,
    smsAvailable: null, smsOptionMissing: false, anyCooldown: true,
    description: 'Cooldown aktif (respons tidak stabil).',
    deviceName: null, waOldEligible: false,
    channels: { sms: buildChannel(0), wa_old: buildChannel(0), voice: buildChannel(0), flash: buildChannel(0) },
    primaryTimer: { rawSeconds: 0, uiTimer: '0s', humanTime: 'Ready' },
    proxyInfo: 'FALLBACK', proxyTag: 'FALLBACK', proxyCountry: countryIso2,
    rawStatus: null, rawReason: lastError ? String(lastError.message || lastError).slice(0, 120) : null,
    isWaOldEcho: false, partialResponse: true, softFallback: true, confidence: 0.4, needsRecheck: false,
    patternHints: ['SOFT_FALLBACK'], error: false
  };
}

async function checkWhatsAppCooldown(rawNumber, options) {
  const opts = options || {};
  const payloads = await WADetector.buildDualPayloads(String(rawNumber));
  if (!payloads.success) throw new Error(payloads.error || 'Nomor tidak valid untuk diperiksa.');
  payloads.rawNumber = String(rawNumber);
  const countryIso2 = resolveCountryIso2(payloads.phoneInfo);
  const headers = buildHeaders(payloads.userAgent, countryIso2);

  if (opts.wave === 'exist') {
    try { return await probeOnce(payloads, headers, countryIso2, 'exist'); }
    catch (err) { return softFallback(rawNumber, payloads, countryIso2, err); }
  }

  const rounds = [];
  let lastError = null;
  for (let attempt = 1; attempt <= INTERNAL_RETRIES; attempt++) {
    try {
      const result = await probeOnce(payloads, headers, countryIso2, 'dual');
      rounds.push(result);
      if (!result.needsRecheck && result.accountStatus !== 'UNKNOWN') {
        if (!CONSENSUS_ENABLED || result.confidence >= LOW_CONFIDENCE_THRESHOLD) {
          return { ...result, consensusRounds: rounds.length };
        }
      }
      if (CONSENSUS_ENABLED && attempt < INTERNAL_RETRIES) {
        await sleep(300 + Math.floor(Math.random() * 400));
        continue;
      }
      if (rounds.length >= 2) return mergeConsensus(rounds);
      return { ...result, consensusRounds: rounds.length };
    } catch (err) {
      lastError = err;
      if (attempt < INTERNAL_RETRIES) { await sleep(350 + Math.floor(Math.random() * 550)); continue; }
    }
  }
  if (rounds.length >= 2) return mergeConsensus(rounds);
  if (rounds.length === 1 && rounds[0].accountStatus !== 'UNKNOWN') return { ...rounds[0], consensusRounds: 1 };
  return softFallback(rawNumber, payloads, countryIso2, lastError);
}

module.exports = { checkWhatsAppCooldown, getHealth };
