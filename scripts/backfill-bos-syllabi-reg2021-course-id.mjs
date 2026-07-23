// Post-insert backfill of bos_course_syllabi.course_id for the Reg-2021 batch.
// course_id holds the COE course uuid; rows were inserted NULL because the
// PostgREST insert path can't run the (SELECT coe_course_id ...) subquery.
// Resolve it from the local public.courses mirror (coe_course_id), scoped to
// the institution, matching course_code case-insensitively.
//
// Idempotent: only touches rows still NULL where the mirror has a coe_course_id.
// Usage:
//   node scripts/backfill-bos-syllabi-reg2021-course-id.mjs           # dry-run
//   node scripts/backfill-bos-syllabi-reg2021-course-id.mjs --apply   # write
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const REG_ID = 'a4ddb3b0-4357-4a7f-9edf-4707ba3ba662'; // R-2021
const APPLY = process.argv.includes('--apply');

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing env'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

// rows needing a course_id
const { data: rows, error } = await db
  .from('bos_course_syllabi')
  .select('id, course_code, institutions_id, course_id')
  .eq('regulation_id', REG_ID)
  .is('course_id', null);
if (error) { console.error('fetch error:', error.message); process.exit(1); }
console.log(`rows with NULL course_id (R-2021): ${rows.length}`);
if (!rows.length) { console.log('nothing to backfill.'); process.exit(0); }

// resolve each against the courses mirror
let resolved = 0; const unresolved = [];
const updates = [];
for (const r of rows) {
  const { data: c, error: e2 } = await db
    .from('courses')
    .select('coe_course_id, course_code')
    .eq('institution_id', r.institutions_id)
    .ilike('course_code', r.course_code)
    .not('coe_course_id', 'is', null)
    .limit(1);
  if (e2) { console.error('courses lookup error:', e2.message); process.exit(1); }
  if (c && c.length && c[0].coe_course_id) {
    updates.push({ id: r.id, course_id: String(c[0].coe_course_id) });
    resolved++;
  } else {
    unresolved.push(r.course_code);
  }
}
console.log(`  resolvable from mirror: ${resolved}`);
console.log(`  unresolved            : ${unresolved.length}`);
if (unresolved.length) console.log('  unresolved codes:', unresolved.join(', '));

if (!APPLY) {
  console.log('\nDRY RUN — no rows written. Re-run with --apply.');
  console.log('Unresolved rows are non-blocking (syllabi render without course_id);');
  console.log('they need a COE->MyJKKN course sync, or POST /api/bos/syllabus/backfill-course-id.');
  process.exit(0);
}

let done = 0;
for (const u of updates) {
  const { error: e3 } = await db
    .from('bos_course_syllabi')
    .update({ course_id: u.course_id, last_modified_at: new Date().toISOString() })
    .eq('id', u.id);
  if (e3) { console.error(`update failed for ${u.id}: ${e3.message}`); process.exit(1); }
  done++;
  if (done % 25 === 0 || done === updates.length) console.log(`updated ${done}/${updates.length}`);
}
console.log(`\nDONE — backfilled ${done} course_id values.`);
if (unresolved.length) console.log(`${unresolved.length} still NULL — run after the COE course sync, or use the API route.`);
