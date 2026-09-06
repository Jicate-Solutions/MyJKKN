#!/usr/bin/env node
/**
 * READ-ONLY. Reports which recent migrations look applied in the live database.
 *
 * There is no migrations ledger to diff against here (see the notes on
 * `supabase db push` not working in this project — the CLI sees 0 local
 * migrations), so "applied?" is inferred by probing for the OBJECT each
 * migration creates: a column, a function, a permission key.
 *
 * Writes nothing. Every statement is a SELECT against the catalog.
 *
 * Usage: node scripts/check-pending-migrations.mjs
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
if (!projectRef) { console.error('✗ bad project ref'); process.exit(2); }

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    { method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }) },
  );
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

const hasColumn = (t, c) =>
  `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' AND column_name='${c}'`;
const hasFunction = (f) =>
  `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${f}'`;
const hasTable = (t) =>
  `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${t}'`;
const hasPermission = (key) =>
  `SELECT 1 FROM custom_roles WHERE permissions ? '${key}'`;

// Probe per migration. Ordered oldest → newest.
const CHECKS = [
  ['20260908034127_fp_items_bloom_level',                 hasColumn('fp_items', 'bloom_level')],
  ['20260909000000_school_receipt_payment_details',       hasColumn('billing_receipts', 'date_of_credit')],
  ['20260909001000_register_school_fees_collect_perm',    hasPermission('school_fees.collect')],
  ['20260909002000_school_fee_receipt_create',            hasFunction('fn_create_school_fee_receipt')],
  ['20260909003000_induction_feedback_group_program_name', hasFunction('fn_induction_feedback_group_program_name')],
  ['20260909100000_meeting_booking_mode_switch',          hasColumn('meeting_bookings', 'booking_mode')],
  ['20260920000000_induction_spm_incremental_balance',    hasFunction('fn_induction_spm_incremental_balance')],
  // Context: the college atomic-create this module had to work around.
  ['20260819100000_billing_receipt_atomic_create',        hasFunction('fn_create_billing_receipt')],
];

console.log(`Project: ${projectRef}\n`);
console.log('Migration                                                  applied?');
console.log('─'.repeat(72));

for (const [name, sql] of CHECKS) {
  let mark;
  try {
    const rows = await runSql(sql);
    mark = Array.isArray(rows) && rows.length > 0 ? '✓ yes' : '✗ PENDING';
  } catch (e) {
    mark = `? error (${String(e.message).slice(0, 40)})`;
  }
  console.log(`${name.padEnd(58)} ${mark}`);
}

// The four columns the school counter writes, individually.
console.log('\nSchool receipt columns on billing_receipts:');
try {
  const cols = await runSql(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='billing_receipts'
       AND column_name IN ('date_of_credit','dd_bank_name','dd_branch','remitter_name')
     ORDER BY column_name`);
  const found = new Set(cols.map((c) => c.column_name));
  for (const c of ['date_of_credit', 'dd_bank_name', 'dd_branch', 'remitter_name']) {
    console.log(`  ${found.has(c) ? '✓' : '✗'} ${c}`);
  }
} catch (e) {
  console.log('  ? could not read:', e.message);
}
