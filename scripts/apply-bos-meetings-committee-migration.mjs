#!/usr/bin/env node
/**
 * Applies 20260710120000_bos_meetings_committee.sql via the Supabase Management API.
 * Same pattern as scripts/apply-bos-committees-migration.mjs.
 *
 * The migration:
 *   1. adds bos_meetings.committee_id (uuid FK → bos_committees, ON DELETE SET NULL)
 *   2. backfills meetings whose composition has exactly one active committee
 *   3. drops the short-lived bos_meetings.council text column it supersedes
 *
 * Safe to re-run: ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS; backfill
 * only touches NULL rows.
 *
 * Usage:
 *   node scripts/apply-bos-meetings-committee-migration.mjs
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

console.log('▸ Applying 20260710120000_bos_meetings_committee.sql ...');
const sql = readFileSync('supabase/migrations/20260710120000_bos_meetings_committee.sql', 'utf8');
await runSql(sql);
console.log('  ✓ applied');

console.log('▸ Verifying column + backfill ...');
const verify = await runSql(`
  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bos_meetings' AND column_name = 'committee_id') AS col_exists,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bos_meetings' AND column_name = 'council') AS council_still_there,
    (SELECT count(*) FROM public.bos_meetings WHERE committee_id IS NOT NULL) AS backfilled,
    (SELECT count(*) FROM public.bos_meetings WHERE committee_id IS NULL AND meeting_type <> 'academic_council') AS unattributed_bos,
    (SELECT count(*) FROM public.bos_meetings) AS total_rows;
`);
const rows = Array.isArray(verify) ? verify : (verify?.result ?? []);
console.log('  ', rows[0]);
if (!rows[0] || Number(rows[0].col_exists) !== 1) {
  console.error('✗ Column bos_meetings.committee_id not found after apply');
  process.exit(1);
}
if (Number(rows[0].council_still_there) !== 0) {
  console.error('✗ bos_meetings.council was not dropped');
  process.exit(1);
}
console.log('\n✓ Done — bos_meetings.committee_id is live.');
