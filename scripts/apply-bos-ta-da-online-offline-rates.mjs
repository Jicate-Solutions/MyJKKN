#!/usr/bin/env node
/**
 * Applies 20260805120000_bos_ta_da_online_offline_rates.sql via the Supabase
 * Management API. Same pattern as scripts/apply-bos-letterhead-assets.mjs.
 *
 * Adds the two facts the SOP's offline/online rate table needs:
 *   • bos_meeting_attendees.attendance_mode  — how each member attended
 *   • bos_ta_da_rates.honorarium_amount_online / travel_basis /
 *     travel_flat_amount — the online sitting charge and how travel is computed
 *
 * MUST be applied BEFORE the code ships: the attendance route selects and
 * writes attendance_mode, and the rates PUT writes the three new rate columns.
 * Without the migration, saving attendance would 400 on an unknown column and
 * take the user's attendance edits down with it.
 *
 * Safe to re-run: ADD COLUMN IF NOT EXISTS + guarded constraint creation.
 * Every default reproduces current behaviour (attendees 'offline', rates
 * 'distance' basis), so existing claims are unaffected.
 *
 * Usage:
 *   node scripts/apply-bos-ta-da-online-offline-rates.mjs
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
if (!projectRef) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}
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
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

const sql = readFileSync(
  'supabase/migrations/20260805120000_bos_ta_da_online_offline_rates.sql',
  'utf8',
);

console.log('Applying 20260805120000_bos_ta_da_online_offline_rates.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const cols = await runSql(`
  SELECT table_name, column_name, column_default
  FROM information_schema.columns
  WHERE table_name IN ('bos_meeting_attendees', 'bos_ta_da_rates')
  ORDER BY table_name, column_name;
`);
const found = new Map(cols.map((c) => [`${c.table_name}.${c.column_name}`, c.column_default]));

const expected = [
  'bos_meeting_attendees.attendance_mode',
  'bos_ta_da_rates.honorarium_amount_online',
  'bos_ta_da_rates.travel_basis',
  'bos_ta_da_rates.travel_flat_amount',
];
for (const c of expected) {
  console.log(
    found.has(c)
      ? `✓ ${c} present (default: ${found.get(c) ?? 'NULL'})`
      : `✗ ${c} MISSING`,
  );
}

const checks = await runSql(`
  SELECT conname FROM pg_constraint
  WHERE conname IN (
    'bos_meeting_attendees_attendance_mode_check',
    'bos_ta_da_rates_travel_basis_check'
  )
  ORDER BY conname;
`);
console.log(`✓ check constraints: ${checks.map((c) => c.conname).join(', ') || '(none)'}`);

// Existing rows must still compute exactly what they computed before: every
// attendee offline, every configured rate on the distance basis.
const drift = await runSql(`
  SELECT
    (SELECT count(*) FROM bos_meeting_attendees WHERE attendance_mode <> 'offline') AS non_offline_attendees,
    (SELECT count(*) FROM bos_ta_da_rates WHERE travel_basis <> 'distance') AS non_distance_rates;
`);
console.log(
  `✓ backfill check — attendees not offline: ${drift[0].non_offline_attendees}, ` +
  `rates not on distance basis: ${drift[0].non_distance_rates} (both should be 0 on a fresh apply)`,
);
