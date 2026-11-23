const assert = require('node:assert/strict');
const { parseDetectionInput } = require('../detectInput');

const validAndDuplicate = parseDetectionInput(
  '+6281234567890\n+6281234567890\n081234567890',
  30
);
assert.equal(validAndDuplicate.ok, true);
assert.deepEqual(validAndDuplicate.valid, ['+6281234567890']);
assert.equal(validAndDuplicate.duplicates.length, 2);
assert.equal(validAndDuplicate.invalid.length, 0);

const mixed = parseDetectionInput('+6281234567890\nnot-a-number', 30);
assert.equal(mixed.ok, true);
assert.equal(mixed.valid.length, 1);
assert.deepEqual(mixed.invalid, ['not-a-number']);

const invalid = parseDetectionInput('abc\nnot-a-number', 30);
assert.equal(invalid.ok, false);
assert.equal(invalid.invalid.length, 2);

const tooMany = parseDetectionInput('+6281234567890\n+6281234567891', 1);
assert.equal(tooMany.ok, false);
assert.match(tooMany.error, /melebihi batas/);

const international = parseDetectionInput('+447911123456', 1);
assert.equal(international.ok, true);
assert.equal(international.valid[0], '+447911123456');

const empty = parseDetectionInput('  \n , ; ', 30);
assert.equal(empty.ok, false);

process.stdout.write('detectInput tests passed\n');
