// lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
// Run with: npx tsx lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
import assert from 'node:assert';
import { resolveRow, parseAmountCell, parseDateCell, normalizeGender, type BulkResolveLookups } from '../fee-structure-excel-mappings';

const lookups: BulkResolveLookups = {
  institutions: new Map([['jkkn cas', 'inst-1']]),
  degrees: new Map([['inst-1::undergraduate', 'deg-1']]),
  departments: new Map([['inst-1::deg-1::clinical lab', 'dept-1']]),
  programmes: new Map([['dept-1::b.sc clt', 'prog-1']]),
  admissionYears: new Map([['inst-1::2026 - 2027', 'yr-1']]),
  quotas: new Map([['management quota', 'q-1']]),
  communities: new Map([['bc', 'c-1'], ['mbc', 'c-2']]),
  categoriesByName: new Map([['application fee', 'cat-app'], ['1 year tuition fee', 'cat-tui']]),
  amountHeaders: ['Application Fee', '1 Year Tuition Fee'],
};

// Happy path
const ok = resolveRow({
  'Fee Structure ID': '', Institution: 'JKKN CAS', Degree: 'Undergraduate',
  Department: 'Clinical Lab', Programme: 'B.Sc CLT', 'Admission Year': '2026 - 2027',
  Quota: 'Management Quota', Gender: '', Communities: 'BC, MBC', Name: 'Test FS',
  Status: 'active', 'Effective From': '', 'Effective To': '', Notes: '',
  'Application Fee': '1000', '1 Year Tuition Fee': '50000',
}, 2, lookups);
assert.deepStrictEqual(ok.errors, [], 'happy path should have no errors');
assert.strictEqual(ok.payload!.community_category_ids.length, 2);
assert.strictEqual(ok.payload!.items.length, 2);
assert.strictEqual(ok.payload!.gender, null);

// Bad institution + negative amount + no communities
const bad = resolveRow({
  Institution: 'Nope', Degree: 'Undergraduate', Department: 'Clinical Lab',
  Programme: 'B.Sc CLT', 'Admission Year': '2026 - 2027', Quota: 'Management Quota',
  Communities: '', Name: 'X', Status: 'active', 'Application Fee': '-5',
}, 3, lookups);
assert.ok(bad.errors.some((e) => e.includes('Institution')), 'should flag institution');
assert.ok(bad.errors.some((e) => e.includes('community')), 'should flag missing community');
assert.ok(bad.errors.some((e) => e.includes('Application Fee')), 'should flag negative amount');
assert.strictEqual(bad.payload, undefined);

assert.strictEqual(parseAmountCell(''), null);
assert.ok(Number.isNaN(parseAmountCell('abc')));
assert.strictEqual(normalizeGender('male'), 'MALE');
assert.strictEqual(normalizeGender('x'), 'INVALID');

// ---- parseDateCell: must tolerate every shape a spreadsheet date arrives in ----
assert.strictEqual(parseDateCell(''), null, 'blank → null');
assert.strictEqual(parseDateCell('2026-06-11'), '2026-06-11', 'canonical yyyy-mm-dd');
assert.strictEqual(parseDateCell('2026/06/11'), '2026-06-11', 'yyyy/mm/dd');
// Excel serial 46184 = 2026-06-11 (the value the import used to choke on).
assert.strictEqual(parseDateCell(46184), '2026-06-11', 'Excel serial number');
// Real Date object (XLSX cellDates:true) — local components, no off-by-one.
assert.strictEqual(parseDateCell(new Date(2026, 5, 11)), '2026-06-11', 'Date object (local)');
assert.strictEqual(parseDateCell('2026-06-11T00:00:00.000Z'), '2026-06-11', 'ISO datetime');
assert.strictEqual(parseDateCell('11/06/2026'), '2026-06-11', 'dd/mm/yyyy (day-first)');
assert.strictEqual(parseDateCell('11-06-2026'), '2026-06-11', 'dd-mm-yyyy');
assert.strictEqual(parseDateCell('11.06.2026'), '2026-06-11', 'dd.mm.yyyy');
// Unambiguous month-first (day field > 12) is swapped.
assert.strictEqual(parseDateCell('06/25/2026'), '2026-06-25', 'mm/dd/yyyy when day>12');
// Impossible / unparseable dates are rejected.
assert.strictEqual(parseDateCell('2026-02-30'), 'INVALID', 'Feb 30 rejected');
assert.strictEqual(parseDateCell('not a date'), 'INVALID', 'garbage rejected');
assert.strictEqual(parseDateCell('2026-13-01'), 'INVALID', 'month 13 rejected');

console.log('✓ fee-structure-excel-mappings resolver tests passed');
