// scripts/verify-student-form-whitelist.ts
//
// Run via: npx tsx scripts/verify-student-form-whitelist.ts
// Exits 0 on pass, 1 on fail. CI-runnable.

import {
  STUDENT_WRITABLE_COLUMNS,
  filterToWhitelist,
  FORBIDDEN_COLUMNS,
  assertNoForbidden,
} from '../lib/services/admission/student-form-write-whitelist';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('OK:  ', msg); }
};

// 1. Each section has its expected canonical fields
assert(STUDENT_WRITABLE_COLUMNS.basic.includes('first_name'), 'basic includes first_name');
assert(STUDENT_WRITABLE_COLUMNS.basic.includes('father_mobile'), 'basic includes father_mobile');
assert(STUDENT_WRITABLE_COLUMNS.academic.includes('tenth_marks'), 'academic includes tenth_marks');
assert(STUDENT_WRITABLE_COLUMNS.contact.includes('student_mobile'), 'contact includes student_mobile');
assert(STUDENT_WRITABLE_COLUMNS.contact.includes('permanent_address_pin_code'), 'contact includes pin');

// 2. Forbidden columns are NEVER in any whitelist
for (const forbidden of FORBIDDEN_COLUMNS) {
  for (const section of ['basic', 'academic', 'contact'] as const) {
    assert(
      !(STUDENT_WRITABLE_COLUMNS[section] as readonly string[]).includes(forbidden),
      `${forbidden} NOT in ${section} whitelist`,
    );
  }
}

// 3. filterToWhitelist drops unknown keys
const filtered = filterToWhitelist('basic', {
  first_name: 'Boobalan',
  lifecycle_status: 'admitted',  // forbidden — must be dropped
  institution_id: 'evil-uuid',   // forbidden — must be dropped
  random_field: 'xyz',           // unknown — must be dropped
});
assert(filtered.first_name === 'Boobalan', 'first_name retained');
assert(!('lifecycle_status' in filtered), 'lifecycle_status dropped');
assert(!('institution_id' in filtered), 'institution_id dropped');
assert(!('random_field' in filtered), 'random_field dropped');
assert(Object.keys(filtered).length === 1, 'only first_name remains');

// 4. assertNoForbidden throws on forbidden keys
let threw = false;
try { assertNoForbidden({ lifecycle_status: 'admitted' }); }
catch { threw = true; }
assert(threw, 'assertNoForbidden throws on lifecycle_status');

threw = false;
try { assertNoForbidden({ first_name: 'Boobalan' }); }
catch { threw = true; }
assert(!threw, 'assertNoForbidden does NOT throw on first_name');

// 5. Schema existence check — every column in every section must exist on
//    learners_profiles. Without this, a typo in the whitelist becomes a
//    silent no-op (Postgres will accept the UPDATE but skip unknown cols).
async function verifySchemaExistence(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('SKIP: schema check (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)');
    return;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key);
  const allCols = [
    ...STUDENT_WRITABLE_COLUMNS.basic,
    ...STUDENT_WRITABLE_COLUMNS.academic,
    ...STUDENT_WRITABLE_COLUMNS.contact,
  ];
  const { data, error } = await sb
    .from('information_schema.columns' as any)
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'learners_profiles')
    .in('column_name', allCols);
  if (error) {
    console.error('FAIL: schema query error:', error.message);
    failures++;
    return;
  }
  const existing = new Set((data ?? []).map((r: any) => r.column_name));
  for (const col of allCols) {
    assert(existing.has(col), `column '${col}' exists on learners_profiles`);
  }
}

(async () => {
  await verifySchemaExistence();
  if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nAll whitelist checks passed.');
})();
