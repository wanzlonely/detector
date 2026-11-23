const assert = require('node:assert/strict');
const {
  detectRegistrationStatus,
  detectRouteStatus,
  detectDeviceStatus
} = require('../lib/registrationSignals');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write('✓ ' + name + '\n');
}

test('explicit not-registered flag is classified separately', () => {
  assert.equal(detectRegistrationStatus({ is_registered: false }, {}), 'NOT_REGISTERED');
  assert.equal(detectRegistrationStatus({}, { status: 'not_registered' }), 'NOT_REGISTERED');
});

test('unrelated or missing registration fields remain UNKNOWN', () => {
  assert.equal(detectRegistrationStatus({ status: 'ok' }, {}), 'UNKNOWN');
  assert.equal(detectRegistrationStatus({}, {}), 'UNKNOWN');
});

test('conflicting registration evidence remains UNKNOWN', () => {
  assert.equal(detectRegistrationStatus({ is_registered: false }, { status: 'registered' }), 'UNKNOWN');
  assert.equal(detectRegistrationStatus({ registered: true }, { is_registered: false }), 'UNKNOWN');
});

test('no-routes aliases are normalized across both responses', () => {
  assert.equal(detectRouteStatus({ reason: 'NO-ROUTES' }, {}), 'NO_ROUTES');
  assert.equal(detectRouteStatus({}, { route_status: 'no_sms_route' }), 'NO_ROUTES');
});

test('no-routes conflicting with explicit SMS eligibility remains CONFLICT', () => {
  assert.equal(detectRouteStatus({ reason: 'no_routes' }, { send_sms_eligible: true }), 'CONFLICT');
});

test('on-device requires both explicit wa_old eligibility and a named device', () => {
  assert.deepEqual(detectDeviceStatus({ wa_old_eligible: true, wa_old_device_name: 'Android' }, {}), {
    status: 'ON_DEVICE', deviceName: 'Android'
  });
});

test('device eligibility without a name is not mislabeled ON_DEVICE', () => {
  assert.deepEqual(detectDeviceStatus({ wa_old_eligible: true }, {}), {
    status: 'DEVICE_PATH', deviceName: null
  });
});

test('explicit ineligible with no device is OFF_DEVICE', () => {
  assert.deepEqual(detectDeviceStatus({}, { wa_old_eligible: false }), {
    status: 'OFF_DEVICE', deviceName: null
  });
});

test('device-name-only and conflicting device flags remain UNKNOWN', () => {
  assert.equal(detectDeviceStatus({ wa_old_device_name: 'Android' }, {}).status, 'UNKNOWN');
  assert.equal(detectDeviceStatus({ wa_old_eligible: true }, { wa_old_eligible: false }).status, 'UNKNOWN');
});

process.stdout.write('\n' + passed + ' registration/route/device tests passed.\n');
