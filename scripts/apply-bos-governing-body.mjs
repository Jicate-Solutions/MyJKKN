#!/usr/bin/env node
/**
 * Applies 20260724120000_bos_governing_body.sql via the Supabase Management API.
 * Same pattern as scripts/apply-bos-experts-category-check-drop.mjs.
 *
 * Adds the Governing Body body to the BoS engine:
 *   - bos_compositions.is_governing_body flag
 *   - meeting_type 'governing_body' (CHECK) + partial unique meeting-number index
 *   - grants academic.bos-governing-body.manage to the principal role
 *
 * Safe to re-run: ADD COLUMN IF NOT EXISTS, DROP/ADD CONSTRAINT, CREATE INDEX
 * IF NOT EXISTS, and a `|| jsonb` merge grant are all idempotent.
 *
 * Usage:
 *   node scripts/apply-bos-governing-body.mjs
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
  'supabase/migrations/20260724120000_bos_governing_body.sql',
  'utf8',
);

console.log('Applying 20260724120000_bos_governing_body.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const col = await runSql(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'bos_compositions' AND column_name = 'is_governing_body';
`);
console.log(col.length ? '✓ bos_compositions.is_governing_body present' : '✗ column MISSING');

const check = await runSql(`
  SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conrelid = 'public.bos_meetings'::regclass
    AND conname = 'bos_meetings_meeting_type_check';
`);
const allowsGb = check[0]?.def?.includes('governing_body');
console.log(allowsGb ? '✓ meeting_type CHECK allows governing_body' : '✗ CHECK does NOT allow governing_body');

const grant = await runSql(`
  SELECT permissions ? 'academic.bos-governing-body.manage' AS granted
  FROM public.custom_roles WHERE role_key = 'principal';
`);
console.log(grant[0]?.granted ? '✓ principal role granted the manage key' : '✗ principal grant MISSING');
