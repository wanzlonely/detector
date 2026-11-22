const WADetector = require('./waEngine');
const { executeWithProxyRotation, getHealth } = require('./proxyManager');

const REQUEST_TIMEOUT_MS = Number(process.env.WA_CHECK_TIMEOUT_MS || 8000);
const INTERNAL_RETRIES = Math.min(4, Math.max(2, Number(process.env.WA_CHECK_INTERNAL_RETRIES || 3)));
const CONSENSUS_ENABLED = String(process.env.WA_CONSENSUS || '1') !== '0';
const LOW_CONFIDENCE_THRESHOLD = Number(process.env.WA_LOW_CONFIDENCE || 0.72);
const EXIST_CLEAR_CONFIDENCE = Number(process.env.WA_EXIST_CLEAR || 0.82);
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

// Simplified restore - full logic from good local version will be completed after bot is responsive
// This at least allows /start and menu to work without crashing
async function checkWhatsAppCooldown(rawNumber, opts = {}) {
  try {
    // Placeholder safe implementation so bot does not crash
    // Full dual-probe logic will be restored in next commit once bot is alive
    const digits = String(rawNumber || '').replace(/\D/g, '');
    const formatted = digits ? ('+' + digits) : String(rawNumber || '');
    return {
      formattedNumber: formatted,
      isBanned: false,
      isCloneBlocked: false,
      isReady: false,
      anyCooldown: false,
      accountStatus: 'UNKNOWN',
      error: false,
      softFallback: true,
      confidence: 0.3,
      needsRecheck: true,
      description: 'Sistem deteksi sedang dipulihkan · coba lagi sebentar',
      deviceName: null,
      waOldEligible: false
    };
  } catch (err) {
    const digits = String(rawNumber || '').replace(/\D/g, '');
    return {
      formattedNumber: digits ? ('+' + digits) : String(rawNumber || ''),
      isBanned: false,
      isCloneBlocked: false,
      isReady: false,
      anyCooldown: false,
      accountStatus: 'UNKNOWN',
      error: true,
      softFallback: true,
      confidence: 0,
      description: 'Error sementara'
    };
  }
}

module.exports = { checkWhatsAppCooldown, getHealth };
