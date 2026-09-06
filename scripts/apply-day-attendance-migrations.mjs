#!/usr/bin/env node
/**
 * Applies the Day-wise (FN/AN) attendance migrations via the Supabase
 * Management API. Same pattern as scripts/apply-bos-committees-migration.mjs.
 *
 * Files (idempotent — safe to re-run):
 *   1. 20260610_add_attendance_mode_and_class_incharge.sql
 *      (timetables.attendance_mode + class_incharge_id, periods.session)
 *   2. 20260610_create_daily_session_attendance.sql
 *      (daily_session_attendance table + RLS policies)
 *
 * Usage:
 *   node scripts/apply-day-attendance-migrations.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
if (!accessToken) {
  console.error('✗ SUPABASE_ACCESS_TOKEN missing from .env');
  process.exit(2);
}
if (!supabaseUrl) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}

const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!match) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}
const projectRef = match[1];
console.log(`Project: ${projectRef}\n`);

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

const files = [
  '20260610_add_attendance_mode_and_class_incharge.sql',
  '20260610_create_daily_session_attendance.sql',
];

for (const file of files) {
  const path = resolve('supabase/migrations', file);
  const sql = readFileSync(path, 'utf8');
  console.log(`▸ Applying ${file} (${sql.length} bytes)`);
  try {
    await runSql(sql);
    console.log('  ✓ applied');
  } catch (err) {
    console.log(`  ✗ FAILED: ${err.message}`);
    process.exit(1);
  }
}

// ── Verify ────────────────────────────────────────────────────────────────────
const check = await runSql(`
  SELECT
    to_regclass('public.daily_session_attendance') AS tbl,
    (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_name='timetables' AND column_name IN ('attendance_mode','class_incharge_id')) AS tt_cols,
    (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_name='periods' AND column_name='session') AS period_session_col;
`);
const rows = Array.isArray(check) ? check : (check?.result ?? []);
console.log('\n  Verification:');
console.log(`    daily_session_attendance:     ${rows[0]?.tbl ?? 'MISSING'}`);
console.log(`    timetables new columns (of 2): ${rows[0]?.tt_cols}`);
console.log(`    periods.session column:        ${rows[0]?.period_session_col}`);
console.log('\n✓ Done.');
