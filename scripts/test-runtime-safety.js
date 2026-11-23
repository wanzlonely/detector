const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
  assert.doesNotMatch(botSource, /require\(['"]\.\/waChecker['"]\)/);
  assert.doesNotMatch(botSource, /processDetection|checkWhatsAppCooldown|triggerEmailVerification/);

  const checker = require('../waChecker');
  const result = await checker.checkWhatsAppCooldown('+6281234567890');
  assert.equal(result.accountStatus, 'UNAVAILABLE');
  assert.equal(result.error, 'LIVE_CHECK_DISABLED');
  await assert.rejects(() => checker.triggerEmailVerification('+6281234567890'), /disabled/i);

  const proxy = require('../proxyManager');
  assert.equal(proxy.isDataImpulseConfigured(), false);
  assert.equal(proxy.buildDataImpulseProxyUrl(), null);
  await assert.rejects(() => proxy.executeWithProxyRotation(() => true), /disabled/i);

  const engine = require('../waEngine');
  const payload = await engine.buildDualPayloads('+6281234567890');
  assert.equal(payload.success, false);

  process.stdout.write('runtime safety tests passed\n');
}

main().catch((error) => {
  process.stderr.write(error.stack || String(error));
  process.exitCode = 1;
});
