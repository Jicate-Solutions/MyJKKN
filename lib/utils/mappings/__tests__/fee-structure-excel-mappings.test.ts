// lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
// Run with: npx tsx lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
import assert from 'node:assert';
import { resolveRow, parseAmountCell, normalizeGender, type BulkResolveLookups } from '../fee-structure-excel-mappings';

const lookups: BulkResolveLookups = {
  institutions: new Map([['jkkn cas', 'inst-1']]),
  degrees: new Map([['inst-1::undergraduate', 'deg-1']]),
  departments: new Map([['inst-1::deg-1::clinical lab', 'dept-1']]),
  programmes: new Map([['dept-1::b.sc clt', 'prog-1']]),
  admissionYears: new Map([['prog-1::2026 - 2027', 'yr-1']]),
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

console.log('✓ fee-structure-excel-mappings resolver tests passed');
