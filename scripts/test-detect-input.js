const assert = require('node:assert/strict');
const { parseDetectionInput } = require('../detectInput');

const valid = parseDetectionInput('+6281234567890\n+6281234567890\n081234567890', 30);
assert.equal(valid.ok, true);
assert.equal(valid.valid.length, 1);
assert.equal(valid.duplicates.length, 2);
assert.equal(valid.invalid.length, 0);

const invalid = parseDetectionInput('abc\nnot-a-number', 30);
assert.equal(invalid.ok, false);

const tooMany = parseDetectionInput('+6281234567890\n+6281234567891', 1);
assert.equal(tooMany.ok, false);

const international = parseDetectionInput('+447911123456', 1);
assert.equal(international.ok, true);
assert.equal(international.valid.length, 1);

process.stdout.write('detectInput tests passed\n');
