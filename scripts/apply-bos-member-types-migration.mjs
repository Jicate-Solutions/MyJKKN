#!/usr/bin/env node
/**
 * Applies 20260611_bos_member_types.sql via the Supabase Management API.
 * Same pattern as scripts/apply-bos-committees-migration.mjs.
 *
 * The migration:
 *   1. creates bos_member_types (+ RLS, trigger, unique-per-institution name)
 *   2. adds bos_members.member_type_id
 *   3. seeds the 10 legacy member types per institution with compositions
 *   4. backfills member_type_id on existing members by base_type match
 *
 * Skips the whole run when bos_member_types already exists (CREATE POLICY /
 * CREATE TRIGGER are not idempotent).
 *
 * Usage:
 *   node scripts/apply-bos-member-types-migration.mjs
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

// ── Pre-flight: skip if already applied ───────────────────────────────────────
console.log('▸ Checking whether bos_member_types already exists...');
const existing = await runSql(`
  SELECT to_regclass('public.bos_member_types') AS tbl;
`);
const existingRows = Array.isArray(existing) ? existing : (existing?.result ?? []);
if (existingRows[0]?.tbl) {
  console.log('  ✓ bos_member_types already exists — nothing to do.');
  process.exit(0);
}
console.log('  Table missing — applying migration.\n');

// ── Apply the migration ──────────────────────────────────────────────────────
const file = '20260611_bos_member_types.sql';
const path = resolve('supabase/migrations', file);
const sql = readFileSync(path, 'utf8');

console.log(`▸ Applying ${file} (${sql.length} bytes)`);
try {
  await runSql(sql);
  console.log('  ✓ Migration applied successfully.');
} catch (err) {
  console.log(`  ✗ FAILED: ${err.message}`);
  process.exit(1);
}

// ── Verify ────────────────────────────────────────────────────────────────────
const check = await runSql(`
  SELECT
    (SELECT COUNT(*) FROM bos_member_types) AS member_types,
    (SELECT COUNT(*) FROM bos_members WHERE member_type_id IS NOT NULL) AS members_linked,
    (SELECT COUNT(*) FROM bos_members WHERE member_type_id IS NULL) AS members_unlinked;
`);
const checkRows = Array.isArray(check) ? check : (check?.result ?? []);
console.log('\n  Verification:');
console.log(`    member types created: ${checkRows[0]?.member_types}`);
console.log(`    members linked:       ${checkRows[0]?.members_linked}`);
console.log(`    members unlinked:     ${checkRows[0]?.members_unlinked}`);
