#!/usr/bin/env node
/**
 * Applies 20260710150000_bos_member_type_catalog_names.sql via the Supabase
 * Management API. Same pattern as scripts/apply-bos-meetings-committee-migration.mjs.
 *
 * The migration:
 *   1. drops bos_members_member_type_check (member_type now stores the
 *      selected bos_member_types.name, so a static enum CHECK no longer fits)
 *   2. makes the three chairman helper functions catalog-aware
 *   3. backfills member_type = catalog name for rows linked via member_type_id
 *
 * Safe to re-run: DROP CONSTRAINT IF EXISTS / CREATE OR REPLACE / backfill
 * only touches rows whose member_type differs from the catalog name.
 *
 * Usage:
 *   node scripts/apply-bos-member-type-catalog-migration.mjs
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
  'supabase/migrations/20260710150000_bos_member_type_catalog_names.sql',
  'utf8',
);

console.log('Applying 20260710150000_bos_member_type_catalog_names.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const cons = await runSql(`
  SELECT conname FROM pg_constraint
  WHERE conrelid = 'public.bos_members'::regclass AND contype = 'c';
`);
console.log('Remaining CHECK constraints on bos_members:');
for (const c of cons) console.log(`  - ${c.conname}`);
const gone = !cons.some((c) => c.conname === 'bos_members_member_type_check');
console.log(gone ? '✓ member_type CHECK removed' : '✗ member_type CHECK STILL PRESENT');

const fns = await runSql(`
  SELECT p.proname,
         (prosrc ILIKE '%base_type%') AS catalog_aware
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('is_board_chairman_for_programme','is_bos_chairman_of','is_bos_chairman_of_board');
`);
for (const f of fns) {
  console.log(`${f.catalog_aware ? '✓' : '✗'} ${f.proname} catalog-aware`);
}

const backfilled = await runSql(`
  SELECT count(*)::int AS n
  FROM public.bos_members m JOIN public.bos_member_types t ON t.id = m.member_type_id
  WHERE m.member_type IS DISTINCT FROM t.name;
`);
console.log(
  backfilled[0].n === 0
    ? '✓ all linked rows carry the catalog name'
    : `✗ ${backfilled[0].n} linked rows still differ from catalog name`,
);
