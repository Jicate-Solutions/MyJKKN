#!/usr/bin/env node
/**
 * Applies 20260710170000_bos_po_pso_master.sql via the Supabase Management API.
 * Same shape as scripts/apply-bos-ta-da-sop-redesign-migration.mjs.
 *
 * Creates:
 *   bos_master_pos   — institution-level master POs (common to all boards)
 *   bos_master_psos  — institution-level default PSOs
 *   bos_board_psos   — per-board PSO overrides (COE board_id, no local FK)
 *
 * The whole migration is idempotent (CREATE TABLE/INDEX IF NOT EXISTS; the
 * CREATE POLICY statements are guarded by dropping nothing — re-running after
 * a full apply fails on duplicate policies, so a pre-flight check skips the
 * apply when bos_master_pos already exists).
 *
 * Usage
 *   node scripts/apply-bos-po-pso-master-migration.mjs
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
    throw new Error(`SQL failed (${r.status}): ${text}`);
  }
  return r.json();
}

// Pre-flight: skip if already applied (policies are not IF NOT EXISTS).
const existing = await runSql(`
  SELECT to_regclass('public.bos_master_pos')   AS master_pos,
         to_regclass('public.bos_master_psos')  AS master_psos,
         to_regclass('public.bos_board_psos')   AS board_psos;
`);
const row = Array.isArray(existing) ? existing[0] : existing?.[0];
if (row?.master_pos && row?.master_psos && row?.board_psos) {
  console.log('✓ All three tables already exist — nothing to do.');
  process.exit(0);
}

const sql = readFileSync(
  resolve('supabase/migrations/20260710170000_bos_po_pso_master.sql'),
  'utf8',
);

console.log('Applying 20260710170000_bos_po_pso_master.sql …');
await runSql(sql);
console.log('✓ Migration applied.');

// Verify
const verify = await runSql(`
  SELECT relname, relrowsecurity
  FROM pg_class
  WHERE relname IN ('bos_master_pos', 'bos_master_psos', 'bos_board_psos')
  ORDER BY relname;
`);
console.log('Verification:', JSON.stringify(verify, null, 2));
