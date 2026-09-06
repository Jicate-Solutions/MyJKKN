// Apply d:/tmp/reg2021-convert/bos_course_syllabi_reg2021.sql to bos_course_syllabi
// via the service-role client (Supabase MCP cannot reach this project, and the
// SQL Editor rejects the 1 MB file). PostgREST inserts in batches, so there is
// no monolithic query to reject.
//
// course_id is inserted NULL on purpose — the (SELECT coe_course_id ...) subquery
// in the SQL cannot run over PostgREST. Backfill it afterwards with
// scripts/backfill-bos-syllabi-reg2021-course-id.mjs (or the SQL equivalent).
//
// Usage:
//   node scripts/apply-bos-syllabi-reg2021.mjs           # dry-run (default): parse + collision check, write nothing
//   node scripts/apply-bos-syllabi-reg2021.mjs --apply   # insert
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SQL_FILE = 'd:/tmp/reg2021-convert/bos_course_syllabi_reg2021.sql';
const APPLY = process.argv.includes('--apply');
const BATCH = 25;

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

// ── parse the generated SQL into row objects ─────────────────────────────────
// Structure of every statement (column order fixed by the generator):
//   institutions_id, board_id, regulation_id, composition_id, course_id(subquery),
//   course_code, course_name, course_credits, total_hours,
//   course_objectives, course_learning_outcomes, course_content,
//   textbooks, web_resources, pedagogy, po_mappings, created_by, notes
const UNQUOTE = (s) => s.replace(/''/g, "'");
const JSONB_ORDER = [
  'course_objectives', 'course_learning_outcomes', 'course_content',
  'textbooks', 'web_resources', 'pedagogy', 'po_mappings',
];
const U = "[0-9a-f-]{36}";
const HEAD = new RegExp(
  `'(${U})'::uuid,\\s*'(${U})'::uuid,\\s*'(${U})'::uuid,\\s*(NULL|'${U}'::uuid),` +
  `[\\s\\S]*?LIMIT 1\\),\\s*` +
  `'((?:[^']|'')*)',\\s*'((?:[^']|'')*)',\\s*(\\d+|NULL),\\s*(\\d+|NULL),`
);
const TAIL = new RegExp(`'(${U})'::uuid,\\s*'((?:[^']|'')*)'\\s*\\);\\s*$`);

const sql = readFileSync(SQL_FILE, 'utf8');
const blocks = sql.split(/INSERT INTO public\.bos_course_syllabi/).slice(1);
const rows = [];
const parseErrors = [];
for (const b of blocks) {
  // statement terminator is '\n);' on its own line — a bare ');' can appear
  // inside a jsonb payload ("First edition ( July 2017);", CO text "Low(1);").
  const stmt = 'INSERT INTO public.bos_course_syllabi' + b.slice(0, b.indexOf('\n);') + 3);
  const h = stmt.match(HEAD);
  const t = stmt.match(TAIL);
  const blobs = [...stmt.matchAll(/\$j\$([\s\S]*?)\$j\$::jsonb/g)].map((m) => m[1]);
  if (!h || !t || blobs.length !== 7) { parseErrors.push(stmt.slice(0, 120)); continue; }
  const row = {
    institutions_id: h[1], board_id: h[2], regulation_id: h[3],
    composition_id: h[4] === 'NULL' ? null : h[4].match(U)[0],
    course_id: null, // backfilled post-insert
    course_code: UNQUOTE(h[5]), course_name: UNQUOTE(h[6]),
    course_credits: h[7] === 'NULL' ? null : Number(h[7]),
    total_hours: h[8] === 'NULL' ? null : Number(h[8]),
    created_by: t[1], notes: UNQUOTE(t[2]),
    version_number: 1, is_latest: true, is_archived: false,
  };
  try {
    blobs.forEach((blob, i) => { row[JSONB_ORDER[i]] = JSON.parse(blob); });
  } catch (e) { parseErrors.push(`${row.course_code}: bad jsonb (${e.message})`); continue; }
  rows.push(row);
}
console.log(`parsed ${rows.length} rows from ${SQL_FILE}`);
if (parseErrors.length) { console.error('PARSE ERRORS:', parseErrors.length); parseErrors.slice(0, 5).forEach((e) => console.error('  ', e)); process.exit(1); }
if (!rows.length) process.exit(1);

// ── collision check against the unique key (regulation_id, course_code, version) ─
const regId = rows[0].regulation_id;
const codes = rows.map((r) => r.course_code);
const existing = new Set();
for (let i = 0; i < codes.length; i += 100) {
  const { data, error } = await db
    .from('bos_course_syllabi')
    .select('course_code')
    .eq('regulation_id', regId)
    .eq('version_number', 1)
    .in('course_code', codes.slice(i, i + 100));
  if (error) { console.error('collision-check error:', error.message); process.exit(1); }
  data.forEach((r) => existing.add(r.course_code));
}
const fresh = rows.filter((r) => !existing.has(r.course_code));
const collide = rows.filter((r) => existing.has(r.course_code));
console.log(`  already in DB (skip): ${collide.length}`);
console.log(`  to insert           : ${fresh.length}`);
if (collide.length) console.log('  skipped codes:', collide.map((r) => r.course_code).join(', '));

if (!APPLY) {
  console.log('\nDRY RUN — no rows written. Sample of first row to be inserted:');
  const s = fresh[0];
  if (s) console.log(JSON.stringify({
    course_code: s.course_code, course_name: s.course_name,
    credits: s.course_credits, total_hours: s.total_hours,
    objectives: s.course_objectives?.objectives?.length,
    units: s.course_content?.units?.length, practical: !!s.course_content?.is_practical,
    clos: s.course_learning_outcomes?.clos?.length,
    po_rows: s.po_mappings?.mappings?.length,
  }, null, 1));
  console.log('\nRe-run with --apply to insert.');
  process.exit(0);
}

// ── insert in batches ────────────────────────────────────────────────────────
let done = 0;
for (let i = 0; i < fresh.length; i += BATCH) {
  const chunk = fresh.slice(i, i + BATCH);
  const { error } = await db.from('bos_course_syllabi').insert(chunk);
  if (error) {
    console.error(`\nBATCH ${i / BATCH + 1} FAILED at row ${i}: ${error.message}`);
    console.error('First code in failed batch:', chunk[0].course_code);
    process.exit(1);
  }
  done += chunk.length;
  console.log(`inserted ${done}/${fresh.length}`);
}
console.log(`\nDONE — inserted ${done} rows. Next: backfill course_id.`);
