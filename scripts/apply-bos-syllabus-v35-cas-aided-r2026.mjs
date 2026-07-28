// Apply scripts/update-bos-syllabus-v35-cas-aided-r2026.sql to bos_course_syllabi
// via service-role client (Supabase MCP cannot reach this project).
// Usage: node scripts/apply-bos-syllabus-v35-cas-aided-r2026.mjs [--apply]
// Default is dry-run: sanity-checks every target row, writes nothing.
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SQL_FILE = 'scripts/update-bos-syllabus-v35-cas-aided-r2026.sql';
const APPLY = process.argv.includes('--apply');

// ── env ──────────────────────────────────────────────────────────────────────
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

// ── parse the SQL file ───────────────────────────────────────────────────────
const sql = readFileSync(SQL_FILE, 'utf8');
const commonM = sql.match(
  /assessment_pattern = \$j\$([\s\S]*?)\$j\$::jsonb,\s*capstone_rubric = \$j\$([\s\S]*?)\$j\$::jsonb,\s*llc_conference = \$j\$([\s\S]*?)\$j\$::jsonb/
);
if (!commonM) { console.error('common-block parse failure'); process.exit(1); }
const common = {
  assessment_pattern: JSON.parse(commonM[1]),
  capstone_rubric: JSON.parse(commonM[2]),
  llc_conference: JSON.parse(commonM[3]),
};

const perCourse = [];
const pcRe = /-- ── (\S+) · ([^─\n]+?) ──\s*update public\.bos_course_syllabi\s*set\s*concept_applications = \$j\$([\s\S]*?)\$j\$::jsonb,\s*capstone_project = \$j\$([\s\S]*?)\$j\$::jsonb/g;
let m;
while ((m = pcRe.exec(sql))) {
  perCourse.push({
    code: m[1],
    program: m[2],
    concept_applications: JSON.parse(m[3]),
    capstone_project: JSON.parse(m[4]),
  });
}
console.log(`parsed ${perCourse.length} per-course blocks + 3 common blocks from ${SQL_FILE}`);
if (perCourse.length === 0) process.exit(1);

// ── sanity: fetch all target rows ────────────────────────────────────────────
const codes = perCourse.map((c) => c.code);
const rows = [];
for (let i = 0; i < codes.length; i += 50) {
  const { data, error } = await db
    .from('bos_course_syllabi')
    .select('id, course_code, institutions_id, concept_applications, assessment_pattern, capstone_project, capstone_rubric, llc_conference')
    .in('course_code', codes.slice(i, i + 50))
    .eq('is_latest', true)
    .eq('is_archived', false);
  if (error) { console.error('fetch error:', error.message); process.exit(1); }
  rows.push(...data);
}
const byCode = new Map();
for (const r of rows) {
  if (!byCode.has(r.course_code)) byCode.set(r.course_code, []);
  byCode.get(r.course_code).push(r);
}
const missing = codes.filter((c) => !byCode.has(c));
const dupes = codes.filter((c) => (byCode.get(c) || []).length > 1);
const populated = codes.filter((c) => (byCode.get(c) || []).some((r) => r.concept_applications !== null));
console.log(`latest rows found: ${rows.length} across ${byCode.size}/${codes.length} codes`);
if (missing.length) console.log(`MISSING (${missing.length}): ${missing.join(', ')}`);
if (dupes.length) {
  console.log(`MULTIPLE LATEST ROWS (${dupes.length}):`);
  for (const c of dupes) console.log(`  ${c}: ${byCode.get(c).map((r) => `${r.id} inst=${r.institutions_id}`).join(' | ')}`);
}
if (populated.length) console.log(`ALREADY POPULATED — will skip (${populated.length}): ${populated.join(', ')}`);
if (!APPLY) {
  console.log('\nDRY RUN complete — rerun with --apply to write.');
  process.exit(missing.length || dupes.length ? 2 : 0);
}
if (missing.length || dupes.length) {
  console.error('\nAborting --apply: resolve MISSING/MULTIPLE rows first.');
  process.exit(2);
}

// ── apply: one guarded update per course ─────────────────────────────────────
let ok = 0, skipped = 0, failed = 0;
for (const c of perCourse) {
  const { data, error } = await db
    .from('bos_course_syllabi')
    .update({
      concept_applications: c.concept_applications,
      capstone_project: c.capstone_project,
      assessment_pattern: common.assessment_pattern,
      capstone_rubric: common.capstone_rubric,
      llc_conference: common.llc_conference,
      last_modified_at: new Date().toISOString(),
    })
    .eq('course_code', c.code)
    .eq('is_latest', true)
    .eq('is_archived', false)
    .is('concept_applications', null) // never overwrite
    .select('id');
  if (error) { console.log(`FAIL ${c.code}: ${error.message}`); failed++; }
  else if (!data.length) { console.log(`skip ${c.code}: already populated`); skipped++; }
  else ok++;
}
console.log(`\napplied: ${ok}, skipped: ${skipped}, failed: ${failed}`);

// ── verify ───────────────────────────────────────────────────────────────────
const bad = [];
for (let i = 0; i < codes.length; i += 50) {
  const { data, error } = await db
    .from('bos_course_syllabi')
    .select('course_code, concept_applications, assessment_pattern, capstone_project, capstone_rubric, llc_conference')
    .in('course_code', codes.slice(i, i + 50))
    .eq('is_latest', true)
    .eq('is_archived', false);
  if (error) { console.error('verify fetch error:', error.message); process.exit(1); }
  for (const r of data) {
    const five = [r.concept_applications, r.assessment_pattern, r.capstone_project, r.capstone_rubric, r.llc_conference];
    const nAct = r.concept_applications?.activities?.length;
    const nOpt = r.capstone_project?.options?.length;
    if (five.some((v) => v === null) || nAct !== 5 || nOpt !== 5)
      bad.push(`${r.course_code}: nulls=${five.map((v) => (v === null ? 1 : 0)).join('')} activities=${nAct} options=${nOpt}`);
  }
}
if (bad.length) { console.log(`\nVERIFY FAILURES (${bad.length}):`); bad.forEach((b) => console.log('  ' + b)); process.exit(3); }
console.log(`verify OK: all ${codes.length} codes carry five non-null columns, 5 activities + 5 options`);
