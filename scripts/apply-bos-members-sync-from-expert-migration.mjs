#!/usr/bin/env node
/**
 * Applies 20260521_sync_bos_members_from_expert.sql via the Supabase
 * Management API. Same pattern as scripts/apply-bos-members-dedup-migration.mjs
 * and scripts/apply-pending-bos-migrations.mjs.
 *
 * What the migration does
 *   - Creates SECURITY DEFINER function sync_bos_members_from_expert()
 *   - Creates AFTER UPDATE trigger on bos_external_experts (skips no-op edits)
 *   - One-time idempotent backfill of bos_members snapshots from current
 *     bos_external_experts state (only updates drifted rows)
 *
 * Pre-flight: report how many member snapshots currently disagree with the
 * parent expert row (the universe the backfill will touch).
 *
 * Post-flight: confirm the trigger + function are installed and re-check
 * drift (should be zero).
 *
 * Safe to re-run: CREATE OR REPLACE for function, DROP IF EXISTS / CREATE
 * for trigger, and the backfill is gated on IS DISTINCT FROM comparisons.
 *
 * Usage:
 *   node scripts/apply-bos-members-sync-from-expert-migration.mjs
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

// Reusable drift detector — shared shape with the backfill's WHERE clause.
const DRIFT_QUERY = `
  SELECT COUNT(*)::int AS n
  FROM bos_members m
  JOIN bos_external_experts e ON e.id = m.expert_id
  WHERE m.expert_id IS NOT NULL
    AND (
      m.display_name IS DISTINCT FROM (
        CASE
          WHEN e.title IS NOT NULL AND e.title <> ''
            THEN e.title || ' ' || e.name
          ELSE e.name
        END
      )
      OR m.display_designation IS DISTINCT FROM e.designation
      OR m.display_institution IS DISTINCT FROM e.institution_name
      OR m.display_department  IS DISTINCT FROM e.department_name
      OR m.address       IS DISTINCT FROM e.address
      OR m.contact_no    IS DISTINCT FROM e.contact_no
      OR m.email         IS DISTINCT FROM e.email
    );
`;

// ── Pre-flight ──────────────────────────────────────────────────────────────
console.log('▸ Pre-flight: counting members that will be reconciled by backfill...');
const driftBefore = await runSql(DRIFT_QUERY);
const driftBeforeN = Array.isArray(driftBefore) ? driftBefore[0]?.n ?? 0 : driftBefore?.result?.[0]?.n ?? 0;

const totalMappedRes = await runSql(`
  SELECT COUNT(*)::int AS n
  FROM bos_members
  WHERE expert_id IS NOT NULL;
`);
const totalMapped = Array.isArray(totalMappedRes) ? totalMappedRes[0]?.n ?? 0 : totalMappedRes?.result?.[0]?.n ?? 0;

console.log(`   ${totalMapped} bos_members rows are mapped to an expert`);
console.log(`   ${driftBeforeN} of them have a snapshot that disagrees with the parent expert\n`);

// ── Apply ───────────────────────────────────────────────────────────────────
const migrationPath = resolve('supabase/migrations/20260521_sync_bos_members_from_expert.sql');
const sql = readFileSync(migrationPath, 'utf8');

console.log(`▸ Applying ${migrationPath}...`);
await runSql(sql);
console.log('   ✓ migration applied\n');

// ── Post-flight ─────────────────────────────────────────────────────────────
console.log('▸ Post-flight: verifying trigger + function are installed...');
const fnExists = await runSql(`
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_bos_members_from_expert';
`);
const fnRows = Array.isArray(fnExists) ? fnExists : fnExists?.result ?? [];

const trigExists = await runSql(`
  SELECT 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'bos_external_experts'
    AND t.tgname = 'trg_sync_bos_members_from_expert'
    AND NOT t.tgisinternal;
`);
const trigRows = Array.isArray(trigExists) ? trigExists : trigExists?.result ?? [];

console.log(`   function present: ${fnRows.length > 0 ? '✓' : '✗'}`);
console.log(`   trigger present:  ${trigRows.length > 0 ? '✓' : '✗'}\n`);

console.log('▸ Post-flight: re-checking drift after backfill (expected: 0)...');
const driftAfter = await runSql(DRIFT_QUERY);
const driftAfterN = Array.isArray(driftAfter) ? driftAfter[0]?.n ?? 0 : driftAfter?.result?.[0]?.n ?? 0;
console.log(`   remaining drifted rows: ${driftAfterN}\n`);

if (fnRows.length === 0 || trigRows.length === 0 || driftAfterN > 0) {
  console.error('✗ Migration did not finish cleanly. Inspect the project before re-running.');
  process.exit(1);
}

console.log(`✓ Done. Reconciled ${driftBeforeN} member snapshot(s); trigger is active.`);
