#!/usr/bin/env node
/**
 * Applies the two SCHOOL BILLING migrations via the Supabase Management API.
 * Same pattern as scripts/apply-bos-governing-body.mjs.
 *
 *   20260909000000_school_receipt_payment_details.sql
 *     ADD COLUMN IF NOT EXISTS x4 (nullable, no default) + partial index
 *     + a NOT VALID check. Metadata-only; no table rewrite, no row touched.
 *
 *   20260909002000_school_fee_receipt_create.sql
 *     CREATE OR REPLACE FUNCTION fn_create_school_fee_receipt — a NEW name.
 *     Does not touch fn_create_billing_receipt (the college writer).
 *
 * Deliberately does NOT apply the other pending migrations in the repo
 * (fp_items_bloom_level, induction_*, meeting_booking_mode_switch) — those
 * belong to other work.
 *
 * Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE / guarded.
 *
 * Usage: node scripts/apply-school-billing-migrations.mjs
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
const projectRef = supabaseUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!accessToken || !projectRef) {
  console.error('✗ SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    { method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }) });
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

console.log(`Project: ${projectRef}\n`);

for (const file of [
  'supabase/migrations/20260909000000_school_receipt_payment_details.sql',
  'supabase/migrations/20260909002000_school_fee_receipt_create.sql',
]) {
  process.stdout.write(`Applying ${file.split('/').pop()} … `);
  await runSql(readFileSync(file, 'utf8'));
  console.log('✓');
}

console.log('\n── Verify ───────────────────────────────────');
const cols = await runSql(`
  SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='billing_receipts'
     AND column_name IN ('date_of_credit','dd_bank_name','dd_branch','remitter_name')
   ORDER BY column_name`);
const found = new Set(cols.map((c) => c.column_name));
for (const c of ['date_of_credit', 'dd_bank_name', 'dd_branch', 'remitter_name']) {
  console.log(`  ${found.has(c) ? '✓' : '✗'} billing_receipts.${c}`);
}

const fn = await runSql(`
  SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_create_school_fee_receipt'`);
console.log(`  ${fn.length ? '✓' : '✗'} fn_create_school_fee_receipt`);

const college = await runSql(`
  SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_create_billing_receipt'`);
console.log(`  ${college.length ? '✓' : '✗'} fn_create_billing_receipt still present (college path untouched)`);
