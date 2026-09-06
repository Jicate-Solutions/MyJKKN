#!/usr/bin/env node
/**
 * Diagnoses bos_members snapshot drift.
 *
 * bos_members.display_* / email / contact_no are denormalized snapshots taken
 * at add-member time. Expert-linked rows are auto-synced by
 * trg_sync_bos_members_from_expert (20260521). Staff-linked rows had no
 * equivalent until 20260729_sync_bos_members_from_staff.sql.
 *
 * Reports:
 *   1. Which sync triggers are actually installed live.
 *   2. Staff-linked member rows whose snapshot differs from the staff row.
 *   3. Expert-linked member rows whose snapshot differs (should be 0).
 *
 * Usage: node scripts/diagnose-bos-member-snapshot-drift.mjs
 */
import { readFileSync } from 'node:fs';

for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken || !supabaseUrl) {
  console.error('✗ SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}
const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
console.log(`Project: ${projectRef}\n`);

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

// ── 1. Installed triggers ────────────────────────────────────────────────────
const trg = await runSql(`
  SELECT c.relname AS table_name, t.tgname AS trigger_name, p.proname AS function_name
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND c.relname IN ('bos_external_experts', 'staff', 'profiles', 'departments', 'institutions')
  ORDER BY c.relname, t.tgname;
`);
console.log('── Triggers on source tables ─────────────────────────────');
for (const row of trg) console.log(`  ${row.table_name.padEnd(22)} ${row.trigger_name}  →  ${row.function_name}()`);
console.log('');

// ── 2. staff columns available for the snapshot ──────────────────────────────
const cols = await runSql(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'staff'
    AND column_name IN ('first_name','last_name','designation','department_id','institution_id',
                        'email','institution_email','phone','mobile','title','salutation','is_active')
  ORDER BY column_name;
`);
console.log('── staff columns present ─────────────────────────────────');
console.log('  ' + cols.map((c) => c.column_name).join(', ') + '\n');

// ── 3. Member row counts ─────────────────────────────────────────────────────
const counts = await runSql(`
  SELECT
    count(*) FILTER (WHERE staff_id IS NOT NULL)  AS staff_linked,
    count(*) FILTER (WHERE expert_id IS NOT NULL) AS expert_linked,
    count(*) FILTER (WHERE staff_id IS NULL AND expert_id IS NULL) AS unlinked,
    count(*) AS total
  FROM bos_members;
`);
console.log('── bos_members link counts ───────────────────────────────');
console.log('  ' + JSON.stringify(counts[0]) + '\n');

// ── 4. Staff-linked drift ────────────────────────────────────────────────────
const staffDrift = await runSql(`
  SELECT
    m.id,
    m.display_name        AS snap_name,
    btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')) AS live_name,
    m.display_designation AS snap_desig,
    s.designation         AS live_desig,
    m.display_department  AS snap_dept,
    d.department_name     AS live_dept,
    m.display_institution AS snap_inst,
    i.name                AS live_inst,
    m.email               AS snap_email,
    coalesce(s.institution_email, s.email) AS live_email,
    m.contact_no          AS snap_phone,
    s.phone               AS live_phone
  FROM bos_members m
  JOIN staff s ON s.id = m.staff_id
  LEFT JOIN departments d   ON d.id = s.department_id
  LEFT JOIN institutions i  ON i.id = s.institution_id
  WHERE m.staff_id IS NOT NULL
    AND (
      m.display_name IS DISTINCT FROM btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,''))
      OR m.display_designation IS DISTINCT FROM s.designation
      OR m.display_department  IS DISTINCT FROM d.department_name
      OR m.display_institution IS DISTINCT FROM i.name
      OR m.email      IS DISTINCT FROM coalesce(s.institution_email, s.email)
      OR m.contact_no IS DISTINCT FROM s.phone
    )
  ORDER BY m.display_name
  LIMIT 40;
`);
const staffDriftCount = await runSql(`
  SELECT count(*) AS n
  FROM bos_members m
  JOIN staff s ON s.id = m.staff_id
  LEFT JOIN departments d  ON d.id = s.department_id
  LEFT JOIN institutions i ON i.id = s.institution_id
  WHERE m.display_name IS DISTINCT FROM btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,''))
     OR m.display_designation IS DISTINCT FROM s.designation
     OR m.display_department  IS DISTINCT FROM d.department_name
     OR m.display_institution IS DISTINCT FROM i.name
     OR m.email      IS DISTINCT FROM coalesce(s.institution_email, s.email)
     OR m.contact_no IS DISTINCT FROM s.phone;
`);
console.log(`── Staff-linked snapshot drift: ${staffDriftCount[0].n} row(s) ─────────────`);
for (const r of staffDrift) {
  const diffs = [];
  if (r.snap_name !== r.live_name) diffs.push(`name "${r.snap_name}" → "${r.live_name}"`);
  if (r.snap_desig !== r.live_desig) diffs.push(`desig "${r.snap_desig}" → "${r.live_desig}"`);
  if (r.snap_dept !== r.live_dept) diffs.push(`dept "${r.snap_dept}" → "${r.live_dept}"`);
  if (r.snap_inst !== r.live_inst) diffs.push(`inst "${r.snap_inst}" → "${r.live_inst}"`);
  if (r.snap_email !== r.live_email) diffs.push(`email "${r.snap_email}" → "${r.live_email}"`);
  if (r.snap_phone !== r.live_phone) diffs.push(`phone "${r.snap_phone}" → "${r.live_phone}"`);
  console.log(`  • ${r.snap_name}: ${diffs.join(' | ')}`);
}
console.log('');

// ── 5. Expert-linked drift (should be 0 if the 20260521 trigger is live) ─────
const expertDrift = await runSql(`
  SELECT count(*) AS n
  FROM bos_members m
  JOIN bos_external_experts e ON e.id = m.expert_id
  WHERE m.display_name IS DISTINCT FROM (CASE WHEN e.title IS NOT NULL AND e.title <> ''
                                              THEN e.title || ' ' || e.name ELSE e.name END)
     OR m.display_designation IS DISTINCT FROM e.designation
     OR m.display_institution IS DISTINCT FROM e.institution_name
     OR m.display_department  IS DISTINCT FROM e.department_name
     OR m.address    IS DISTINCT FROM e.address
     OR m.contact_no IS DISTINCT FROM e.contact_no
     OR m.email      IS DISTINCT FROM e.email;
`);
console.log(`── Expert-linked snapshot drift: ${expertDrift[0].n} row(s) (expect 0)\n`);
