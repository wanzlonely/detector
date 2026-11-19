const WADetector = require('./waEngine');
const { executeWithProxyRotation } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 10000);

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
  let existResponse = {};
  try { existResponse = JSON.parse(data.existText || '{}'); } catch (_) {}
  const rawSmsEligible = existResponse.send_sms_eligible;
  const smsAvailable = typeof rawSmsEligible === 'boolean'
    ? rawSmsEligible
    : rawSmsEligible === 0 || rawSmsEligible === '0'
      ? false
      : rawSmsEligible === 1 || rawSmsEligible === '1'
        ? true
        : null;

  return {
    formattedNumber: parsed.phone,
    region: parsed.country,
    accountStatus: parsed.state,
    isBanned: Boolean(parsed.isBanned),
    isCloneBlocked: Boolean(parsed.isCloneBlocked),
    isReady: Boolean(parsed.isReady),
    smsAvailable,
    anyCooldown: Boolean(parsed.isCooldown),
    description: parsed.description,
    channels: {
      sms: {
        isCooldown: Boolean(parsed.isCooldown),
        rawSeconds: Number(parsed.cooldownSeconds || 0),
        uiTimer: parsed.cooldownFormatted || '0.00',
        humanTime: parsed.cooldownLabel || 'Ready'
      }
    },
    proxyInfo: `${proxyMode} · ${sessionTag}`,
    proxyTag: sessionTag
  };
}

module.exports = {
  checkWhatsAppCooldown
};
