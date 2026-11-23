const DISABLED_MESSAGE = 'Live WhatsApp account probing has been retired from this project.';

async function checkWhatsAppCooldown(rawNumber) {
  return {
    formattedNumber: String(rawNumber || ''),
    accountStatus: 'UNAVAILABLE',
    isReady: false,
    isBanned: false,
    isCloneBlocked: false,
    isSecurityBlock: false,
    anyCooldown: false,
    softFallback: true,
    needsRecheck: true,
    confidence: 0,
    description: DISABLED_MESSAGE,
    error: 'LIVE_CHECK_DISABLED'
  };
}

async function triggerEmailVerification() {
  throw new Error('Email/OTP triggering is disabled. Use the official WhatsApp application.');
}

function getHealth() {
  return { enabled: false, status: 'DISABLED' };
}

module.exports = { checkWhatsAppCooldown, triggerEmailVerification, getHealth };
