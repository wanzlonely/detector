const { parsePhoneNumberFromString } = require('libphonenumber-js');

function parseDetectionInput(input, limit = 1) {
  const entries = String(input || '')
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!entries.length) {
    return { ok: false, error: 'Masukkan minimal satu nomor.', valid: [], invalid: [], duplicates: [] };
  }

  const maximum = Math.max(1, Math.min(30, Number(limit) || 1));
  if (entries.length > maximum) {
    return {
      ok: false,
      error: 'Jumlah input ' + entries.length + ' melebihi batas ' + maximum + ' nomor.',
      valid: [],
      invalid: [],
      duplicates: []
    };
  }

  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  for (const entry of entries) {
    const compact = entry.replace(/[\s().-]/g, '');
    const parsed = parsePhoneNumberFromString(compact, 'ID');
    if (!parsed || !parsed.isValid()) {
      invalid.push(entry);
      continue;
    }

    const normalized = parsed.number;
    if (seen.has(normalized)) {
      duplicates.push(entry);
      continue;
    }

    seen.add(normalized);
    valid.push(normalized);
  }

  if (!valid.length) {
    return {
      ok: false,
      error: 'Tidak ada nomor dengan format yang valid. Contoh: +6281234567890.',
      valid,
      invalid,
      duplicates
    };
  }

  return { ok: true, valid, invalid, duplicates };
}

module.exports = { parseDetectionInput };
