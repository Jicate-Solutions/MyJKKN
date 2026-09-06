// lib/utils/__tests__/staff-name.test.ts
// Run with: npx tsx lib/utils/__tests__/staff-name.test.ts
//
// These cases mirror public.fn_canonical_staff_name(text) exactly — if the SQL
// function changes, change these too, or the UI preview will disagree with what
// the database actually stores.
import assert from 'node:assert';
import { normalizeStaffName, normalizeStaffNameFields } from '../staff-name';

// ---- the three real-data shapes this was built for ----
// 408 staff had mixed/sentence case.
assert.strictEqual(normalizeStaffName('Anil Kumar'), 'ANIL KUMAR', 'sentence case');
assert.strictEqual(normalizeStaffName('ANNA DURAi'), 'ANNA DURAI', 'mixed case');
// 59 first names carried trailing padding.
assert.strictEqual(normalizeStaffName('Anil Kumar '), 'ANIL KUMAR', 'trailing space');
assert.strictEqual(normalizeStaffName('  Baby'), 'BABY', 'leading space');
// 3 had internal runs of whitespace.
assert.strictEqual(normalizeStaffName('anil   kumar'), 'ANIL KUMAR', 'internal double space');
assert.strictEqual(normalizeStaffName('a\t\tb'), 'A B', 'tabs collapse to one space');

// ---- already-canonical input is a no-op (460 first names were already upper) ----
assert.strictEqual(normalizeStaffName('ANIL KUMAR'), 'ANIL KUMAR', 'idempotent');
assert.strictEqual(
  normalizeStaffName(normalizeStaffName('  anil   kumar ')),
  'ANIL KUMAR',
  'applying twice changes nothing',
);

// ---- null/undefined pass through: the column is nullable and the SQL
//      function has the same null-in/null-out contract ----
assert.strictEqual(normalizeStaffName(null), null, 'null passes through');
assert.strictEqual(normalizeStaffName(undefined), undefined, 'undefined passes through');
assert.strictEqual(normalizeStaffName(''), '', 'empty string stays empty');
assert.strictEqual(normalizeStaffName('   '), '', 'whitespace-only collapses to empty');

// ---- field helper: only touches keys that are actually present, so it is safe
//      to use on a PARTIAL update payload ----
assert.deepStrictEqual(
  normalizeStaffNameFields({ first_name: ' anil  kumar ', last_name: 'reddy' }),
  { first_name: 'ANIL KUMAR', last_name: 'REDDY' },
  'both fields normalised',
);
assert.deepStrictEqual(
  normalizeStaffNameFields({ first_name: 'anil', designation: 'Professor' } as {
    first_name?: string | null;
    designation?: string;
  }),
  { first_name: 'ANIL', designation: 'Professor' },
  'unrelated fields untouched',
);
// A partial update that omits last_name must NOT gain a last_name key —
// resurrecting it would send `undefined` and blank a stored surname.
const partial = normalizeStaffNameFields({ first_name: 'anil' } as { first_name?: string | null });
assert.ok(!('last_name' in partial), 'absent key is not resurrected');

console.log('✓ staff-name canonicalisation tests passed');
