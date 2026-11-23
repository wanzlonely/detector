function normalizeSignal(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function explicitTrue(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  return false;
}

function explicitBanEvidence(exist, code) {
  const banCodes = ['banned', 'account_banned', 'phone_number_banned', 'permanently_banned'];
  for (const source of [exist || {}, code || {}]) {
    if (['is_banned', 'banned'].some((key) => explicitTrue(source[key]))) return true;
    const status = normalizeSignal(source.status || source.account_status);
    const reason = normalizeSignal(source.reason || source.error_type);
    if (banCodes.includes(status) || banCodes.includes(reason)) return true;
  }
  return false;
}

function getCustomBlockText(exist, code) {
  const values = [];
  for (const source of [exist || {}, code || {}]) {
    for (const key of ['custom_block_screen', 'block_screen']) {
      const value = source[key];
      if (typeof value === 'string') values.push(value);
      else if (value && typeof value === 'object') {
        for (const field of ['title', 'header', 'message', 'body', 'description', 'code']) {
          if (typeof value[field] === 'string') values.push(value[field]);
        }
      }
    }
  }
  return values.join(' ').toLowerCase();
}

function applyPatternLibrary(exist, code, timers) {
  const sources = [exist || {}, code || {}];
  const reasons = sources.map((source) => normalizeSignal(source.reason));
  const statuses = sources.map((source) => normalizeSignal(source.status));
  const hints = [];
  if (timers.is_wa_old_echo) hints.push('WA_OLD_ECHO');
  if (reasons.includes('temporarily_unavailable') || statuses.includes('temporarily_unavailable')) hints.push('TEMP_LOCK');
  if (reasons.some((reason) => reason.includes('too_many') || reason === 'too_recent')) hints.push('RATE_LIMIT');
  if (sources.some((source) => explicitTrue(source.high_sms_rereg_user))) hints.push('HIGH_REREG');
  if (reasons.some((reason) => reason === 'no_routes' || reason === 'no_route')) hints.push('NO_ROUTES');
  if (normalizeSignal(code && code.reason) === 'method_not_allowed' && !timers.exist_no_routes && timers.sms === 0) hints.push('METHOD_NOT_ALLOWED_SOFT');
  if (timers.is_code_sent && timers.sms === 0) hints.push('CODE_SENT_READY');
  if (explicitBanEvidence(exist, code)) hints.push('HARD_BAN');
  return hints;
}

function detectBanSignals(exist, code) {
  // Appeal/violation metadata alone is not proof of a ban.
  return explicitBanEvidence(exist, code);
}

function detectCloneSignals(exist, code) {
  const sources = [exist || {}, code || {}];
  const reasons = sources.map((source) => normalizeSignal(source.reason));
  const statuses = sources.map((source) => normalizeSignal(source.status || source.account_status));
  const blockText = getCustomBlockText(exist, code);
  const explicitCloneFlag = sources.some((source) =>
    ['is_clone_blocked', 'clone_blocked', 'is_unofficial_app', 'unofficial_app_block']
      .some((key) => explicitTrue(source[key]))
  );
  const explicitSecurityFlag = sources.some((source) =>
    ['is_security_block', 'security_block', 'security_hold']
      .some((key) => explicitTrue(source[key]))
  );
  const cloneCodes = ['clone_blocked', 'unofficial_app', 'unofficial_app_block', 'unsupported_app', 'unsupported_client'];
  const securityCodes = ['security_block', 'security_hold', 'login_security_hold'];
  const unofficialText = [
    'use the official whatsapp', 'use official whatsapp', 'download the official whatsapp',
    'unofficial version of whatsapp', 'gunakan whatsapp resmi', 'unduh whatsapp resmi',
    'aplikasi whatsapp resmi'
  ];
  const securityText = [
    'for security reasons', 'demi keamanan', 'login not available right now',
    'login is not available right now', 'tidak dapat masuk saat ini',
    'login temporarily unavailable', 'unusual account activity', 'aktivitas akun yang tidak biasa'
  ];
  const isSecurityBlock = explicitSecurityFlag ||
    reasons.some((reason) => securityCodes.includes(reason)) ||
    statuses.some((status) => securityCodes.includes(status)) ||
    securityText.some((phrase) => blockText.includes(phrase));
  const isCloneBlocked = explicitCloneFlag ||
    reasons.some((reason) => cloneCodes.includes(reason)) ||
    statuses.some((status) => cloneCodes.includes(status)) ||
    unofficialText.some((phrase) => blockText.includes(phrase));
  return { isCloneBlocked: Boolean(isCloneBlocked && !isSecurityBlock), isSecurityBlock: Boolean(isSecurityBlock) };
}

module.exports = { normalizeSignal, explicitTrue, explicitBanEvidence, applyPatternLibrary, detectBanSignals, detectCloneSignals };
