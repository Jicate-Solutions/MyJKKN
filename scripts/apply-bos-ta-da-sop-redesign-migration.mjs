#!/usr/bin/env node
/**
 * Applies 20260521_bos_ta_da_sop_redesign.sql via the Supabase Management API.
 * Same shape as scripts/apply-bos-members-sync-from-expert-migration.mjs.
 *
 * What the migration does
 *   1. Adds bos_external_experts.distance_km (one-way km to institution).
 *   2. Adds bos_members.display_distance_km (snapshot column).
 *   3. Extends the sync trigger to mirror distance_km expert → member.
 *   4. Renames bos_ta_da_claims columns:
 *        da_days   → honorarium_units
 *        da_rate   → honorarium_rate
 *        da_amount → honorarium_amount
 *   5. Drops & re-adds the total_amount GENERATED column with the new expression.
 *   6. Drops NOT NULL on bos_ta_da_claims.expert_id (internal members now claim).
 *
 * Why this script exists
 *   The attendance route (/api/bos/meetings/[id]/attendance) was updated in the
 *   same PR to SELECT display_distance_km and to auto-generate honorarium_*
 *   claim rows. Until the migration is applied, every attendance GET/POST 500s
 *   with `column bos_members_1.display_distance_km does not exist`.
 *
 * Safety
 *   - All ALTERs are guarded with IF NOT EXISTS / IF EXISTS or are naturally
 *     idempotent (CREATE OR REPLACE for the function, DROP+CREATE for the
 *     trigger, ALTER COLUMN DROP NOT NULL is a no-op if already nullable).
 *   - The RENAME COLUMN steps are NOT idempotent — re-running after a partial
 *     apply may fail with "column X does not exist". Pre-flight checks below
 *     surface that state and skip the rename if already renamed.
 *
 * Usage
 *   node scripts/apply-bos-ta-da-sop-redesign-migration.mjs
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

function rows(res) {
  return Array.isArray(res) ? res : res?.result ?? [];
}

async function columnExists(table, column) {
  const res = await runSql(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${table}'
      AND column_name = '${column}';
  `);
  return rows(res).length > 0;
}

// ── Pre-flight ──────────────────────────────────────────────────────────────
console.log('▸ Pre-flight: inspecting current schema state...');

const hasDistanceKm        = await columnExists('bos_external_experts', 'distance_km');
const hasDisplayDistanceKm = await columnExists('bos_members', 'display_distance_km');
const hasDaAmount          = await columnExists('bos_ta_da_claims', 'da_amount');
const hasHonorariumAmount  = await columnExists('bos_ta_da_claims', 'honorarium_amount');
const hasTotalAmount       = await columnExists('bos_ta_da_claims', 'total_amount');

console.log(`   bos_external_experts.distance_km        : ${hasDistanceKm        ? '✓ present' : '✗ missing'}`);
console.log(`   bos_members.display_distance_km         : ${hasDisplayDistanceKm ? '✓ present' : '✗ missing'}`);
console.log(`   bos_ta_da_claims.da_amount (legacy)     : ${hasDaAmount          ? 'still present (needs rename)' : 'gone (already renamed)'}`);
console.log(`   bos_ta_da_claims.honorarium_amount      : ${hasHonorariumAmount  ? '✓ present' : '✗ missing'}`);
console.log(`   bos_ta_da_claims.total_amount           : ${hasTotalAmount       ? '✓ present' : '✗ missing'}`);

const existingClaimsRes = await runSql(`SELECT COUNT(*)::int AS n FROM bos_ta_da_claims;`);
const existingClaims = rows(existingClaimsRes)[0]?.n ?? 0;
console.log(`   existing bos_ta_da_claims rows          : ${existingClaims}\n`);

// Refuse to run a half-applied state — that's a manual investigation, not an
// auto-retry. If the rename already happened but the new column is missing,
// something interrupted the migration mid-way.
if (!hasDaAmount && !hasHonorariumAmount) {
  console.error('✗ Neither da_amount nor honorarium_amount exists. Schema is in an unexpected state — investigate before running.');
  process.exit(1);
}

// Fully migrated already — exit cleanly.
if (hasDistanceKm && hasDisplayDistanceKm && hasHonorariumAmount && hasTotalAmount && !hasDaAmount) {
  console.log('✓ Migration appears already applied. Nothing to do.');
  process.exit(0);
}

// ── Wipe pre-existing claims ───────────────────────────────────────────────
// Operator opted into a clean-slate cutover so legacy da_* values aren't
// carried forward into the renamed honorarium_* columns with shifted
// semantics. Done BEFORE the rename so we're deleting against the column
// names that still exist; doing it after the rename would also work but
// makes the log message confusing. Pre-existing claims for this codebase
// were test data, not production payouts.
if (existingClaims > 0) {
  console.log(`▸ Wiping ${existingClaims} pre-existing bos_ta_da_claims row(s)...`);
  await runSql(`DELETE FROM bos_ta_da_claims;`);
  const verify = await runSql(`SELECT COUNT(*)::int AS n FROM bos_ta_da_claims;`);
  const verifyN = rows(verify)[0]?.n ?? -1;
  console.log(`   ✓ rows after wipe: ${verifyN}\n`);
} else {
  console.log('▸ No pre-existing claims to wipe.\n');
}

// ── Apply ───────────────────────────────────────────────────────────────────
const migrationPath = resolve('supabase/migrations/20260521_bos_ta_da_sop_redesign.sql');
const sql = readFileSync(migrationPath, 'utf8');

console.log(`▸ Applying ${migrationPath}...`);
await runSql(sql);
console.log('   ✓ migration applied\n');

// ── Post-flight ─────────────────────────────────────────────────────────────
console.log('▸ Post-flight: verifying schema...');

const post = {
  distance_km:         await columnExists('bos_external_experts', 'distance_km'),
  display_distance_km: await columnExists('bos_members', 'display_distance_km'),
  honorarium_amount:   await columnExists('bos_ta_da_claims', 'honorarium_amount'),
  honorarium_rate:     await columnExists('bos_ta_da_claims', 'honorarium_rate'),
  honorarium_units:    await columnExists('bos_ta_da_claims', 'honorarium_units'),
  da_amount_gone:      !(await columnExists('bos_ta_da_claims', 'da_amount')),
  total_amount:        await columnExists('bos_ta_da_claims', 'total_amount'),
};

for (const [k, v] of Object.entries(post)) {
  console.log(`   ${v ? '✓' : '✗'} ${k}`);
}

// Sanity-check the GENERATED expression: total_amount should be a STORED
// generated column referencing honorarium_amount.
const genCheck = await runSql(`
  SELECT generation_expression
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'bos_ta_da_claims'
    AND column_name = 'total_amount';
`);
const genExpr = rows(genCheck)[0]?.generation_expression ?? '';
const genOk = /honorarium_amount/.test(genExpr) && /travel_amount/.test(genExpr);
console.log(`   ${genOk ? '✓' : '✗'} total_amount GENERATED references honorarium_amount + travel_amount`);
if (!genOk) console.log(`       (actual expression: ${genExpr || '<none>'})`);

// Confirm expert_id is now nullable.
const nullableCheck = await runSql(`
  SELECT is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'bos_ta_da_claims'
    AND column_name = 'expert_id';
`);
const isNullable = rows(nullableCheck)[0]?.is_nullable === 'YES';
console.log(`   ${isNullable ? '✓' : '✗'} bos_ta_da_claims.expert_id is nullable\n`);

// Confirm the sync trigger covers distance_km.
const trigDef = await runSql(`
  SELECT pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'bos_external_experts'
    AND t.tgname  = 'trg_sync_bos_members_from_expert'
    AND NOT t.tgisinternal;
`);
const trigSql = rows(trigDef)[0]?.def ?? '';
const trigOk = /distance_km/.test(trigSql);
console.log(`   ${trigOk ? '✓' : '✗'} sync trigger WHEN clause covers distance_km\n`);

const allOk = Object.values(post).every(Boolean) && genOk && isNullable && trigOk;
if (!allOk) {
  console.error('✗ Migration did not finish cleanly. Inspect the project before continuing.');
  process.exit(1);
}

console.log('✓ Done. Attendance route can now read display_distance_km without 500s.');
