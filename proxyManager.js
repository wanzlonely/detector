const DISABLED_MESSAGE = 'Proxy rotation is disabled; no proxy or direct fallback request will be started.';

function createRotatingDataImpulseAgent() {
  return {
    agent: undefined,
    dispatcher: undefined,
    sessionTag: 'DISABLED',
    mode: 'DISABLED',
    country: null
  };
}

async function executeWithProxyRotation() {
  throw new Error(DISABLED_MESSAGE);
}

function isDataImpulseConfigured() {
  return false;
}

function buildDataImpulseProxyUrl() {
  return null;
}

function recordProxyOutcome() {}
function markDirtySession() {}
function isDirtySession() { return false; }
function isDirtyProxyError() { return false; }
function getHealth() {
  return { enabled: false, status: 'DISABLED', success: 0, fail: 0, dirty: 0, score: 0 };
}

module.exports = {
  createRotatingDataImpulseAgent,
  executeWithProxyRotation,
  isDataImpulseConfigured,
  buildDataImpulseProxyUrl,
  recordProxyOutcome,
  getHealth,
  markDirtySession,
  isDirtySession,
  isDirtyProxyError
};
