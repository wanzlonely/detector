const assert = require('node:assert/strict');
const {
  applyPatternLibrary,
  detectBanSignals,
  detectCloneSignals
} = require('../lib/statusSignals');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write('✓ ' + name + '\n');
}

test('appeal and violation metadata alone do not classify BANNED', () => {
  assert.equal(detectBanSignals({
    appeal_token: 'present',
    violation_type: 'some_type',
    in_app_ban_appeal: { enabled: true }
  }, {}), false);
});

test('explicit ban status in either response classifies BANNED', () => {
  assert.equal(detectBanSignals({ status: 'ok' }, { status: 'banned' }), true);
  assert.equal(detectBanSignals({}, { is_banned: true }), true);
});

test('generic blocked reason is not enough to classify BANNED', () => {
  assert.equal(detectBanSignals({}, { reason: 'blocked' }), false);
});

test('security hold is distinct from clone/unofficial', () => {
  const result = detectCloneSignals({}, { reason: 'security_block' });
  assert.equal(result.isSecurityBlock, true);
  assert.equal(result.isCloneBlocked, false);
});

test('explicit clone status classifies CLONE_BLOCKED only', () => {
  const result = detectCloneSignals({}, { reason: 'unofficial_app' });
  assert.equal(result.isCloneBlocked, true);
  assert.equal(result.isSecurityBlock, false);
});

test('generic custom block presence does not imply clone or security', () => {
  const result = detectCloneSignals({ custom_block_screen: { title: 'Notice' } }, {});
  assert.equal(result.isCloneBlocked, false);
  assert.equal(result.isSecurityBlock, false);
});

test('specific official-app instruction is recognized as clone/unofficial', () => {
  const result = detectCloneSignals({ custom_block_screen: { title: 'Use the official WhatsApp' } }, {});
  assert.equal(result.isCloneBlocked, true);
  assert.equal(result.isSecurityBlock, false);
});

test('security evidence takes precedence when both text families appear', () => {
  const result = detectCloneSignals({
    custom_block_screen: 'Use the official WhatsApp. For security reasons, login not available right now.'
  }, {});
  assert.equal(result.isSecurityBlock, true);
  assert.equal(result.isCloneBlocked, false);
});

test('hard-ban hint is emitted only for explicit ban evidence', () => {
  const timers = { is_wa_old_echo: false, exist_no_routes: false, sms: 0, is_code_sent: false };
  assert.equal(applyPatternLibrary({ violation_type: 'x' }, {}, timers).includes('HARD_BAN'), false);
  assert.equal(applyPatternLibrary({}, { status: 'banned' }, timers).includes('HARD_BAN'), true);
});

process.stdout.write('\n' + passed + ' status-classification tests passed.\n');
