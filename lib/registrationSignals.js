function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseExplicitBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
}

function valuesFrom(sources, keys) {
  return sources.flatMap((source) => keys
    .filter((key) => source[key] !== undefined && source[key] !== null && source[key] !== '')
    .map((key) => source[key]));
}

function detectRegistrationStatus(exist, code) {
  const sources = [exist || {}, code || {}];
  const explicit = valuesFrom(sources, ['is_registered', 'registered'])
    .map(parseExplicitBoolean).filter((value) => value !== null);
  const notRegisteredCodes = ['not_registered', 'unregistered', 'phone_number_not_registered', 'number_not_registered'];
  const registeredCodes = ['registered', 'account_registered', 'phone_number_registered'];
  const states = sources.flatMap((source) => [
    normalize(source.account_status),
    normalize(source.registration_status),
    normalize(source.status),
    normalize(source.reason)
  ]);
  const hasNotRegistered = states.some((state) => notRegisteredCodes.includes(state));
  const hasRegistered = states.some((state) => registeredCodes.includes(state));
  const explicitNotRegistered = explicit.includes(false);
  const explicitRegistered = explicit.includes(true);
  if ((explicitNotRegistered && (explicitRegistered || hasRegistered)) ||
      (explicitRegistered && hasNotRegistered) || (hasNotRegistered && hasRegistered)) return 'UNKNOWN';
  if (explicitNotRegistered || hasNotRegistered) return 'NOT_REGISTERED';
  if (explicitRegistered || hasRegistered) return 'REGISTERED';
  return 'UNKNOWN';
}

function detectRouteStatus(exist, code) {
  const sources = [exist || {}, code || {}];
  const noRouteCodes = ['no_routes', 'no_route', 'no_sms_route', 'sms_no_routes'];
  const hasNoRoutes = sources.some((source) =>
    [source.reason, source.status, source.route_status, source.sms_route_status]
      .some((value) => noRouteCodes.includes(normalize(value)))
  );
  const hasSmsEligible = valuesFrom(sources, ['send_sms_eligible'])
    .map(parseExplicitBoolean).includes(true);
  if (hasNoRoutes && hasSmsEligible) return 'CONFLICT';
  return hasNoRoutes ? 'NO_ROUTES' : 'UNKNOWN';
}

function detectDeviceStatus(exist, code) {
  const sources = [exist || {}, code || {}];
  const eligibleValues = valuesFrom(sources, ['wa_old_eligible'])
    .map(parseExplicitBoolean).filter((value) => value !== null);
  const deviceNames = valuesFrom(sources, ['wa_old_device_name'])
    .map((value) => String(value).trim()).filter(Boolean);
  const deviceName = deviceNames[0] || null;
  if (eligibleValues.includes(true) && eligibleValues.includes(false)) return { status: 'UNKNOWN', deviceName };
  if (eligibleValues.includes(true) && deviceName) return { status: 'ON_DEVICE', deviceName };
  if (eligibleValues.includes(true)) return { status: 'DEVICE_PATH', deviceName: null };
  if (eligibleValues.includes(false) && !deviceName) return { status: 'OFF_DEVICE', deviceName: null };
  return { status: 'UNKNOWN', deviceName };
}

module.exports = {
  normalize,
  parseExplicitBoolean,
  detectRegistrationStatus,
  detectRouteStatus,
  detectDeviceStatus
};
