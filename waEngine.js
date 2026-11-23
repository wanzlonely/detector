const DISABLED_MESSAGE = 'The legacy WhatsApp request engine has been retired.';

async function buildDualPayloads() {
  return { success: false, error: DISABLED_MESSAGE };
}

function parseDualResponse() {
  return {
    success: false,
    state: 'DISABLED',
    isReady: false,
    isCooldown: false,
    isBanned: false,
    isCloneBlocked: false,
    isSecurityBlock: false,
    description: DISABLED_MESSAGE
  };
}

module.exports = { buildDualPayloads, parseDualResponse };
