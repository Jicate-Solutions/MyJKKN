#!/usr/bin/env node
/**
 * Backfill bos_members.display_department for rows added before the column
 * existed (20260518 migration). Same denormalisation pattern the add-member
 * dialog uses at insert-time:
 *
 *   Internal members (staff_id IS NOT NULL):
 *     bos_members.staff_id → staff.department_id → departments.department_name
 *
 *   External experts (expert_id IS NOT NULL):
 *     bos_members.expert_id → bos_external_experts.department_name
 *
 * Only touches rows where display_department is NULL or empty — re-running is
 * safe. Rows whose source FK has no department (industry experts / alumni with
 * no department, or staff with department_id = NULL) are left as NULL; the
 * call-letter PDF renderer correctly skips the "Department of …" line in that
 * case.
 *
 * Run:  node scripts/backfill-bos-display-department.mjs
 *       node scripts/backfill-bos-display-department.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// ── .env loader (matches the diagnose-bos-*.mjs pattern) ─────────────────────
for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(2);
}

const dryRun = process.argv.includes('--dry-run');
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

console.log(`Project: ${supabaseUrl.match(/https:\/\/([a-z0-9]+)\./i)?.[1] ?? '(unknown)'}`);
console.log(`Mode:    ${dryRun ? 'DRY RUN — no writes' : 'LIVE — writes will be applied'}`);

// ── 1. Find candidate bos_members rows ───────────────────────────────────────
console.log('\n▸ Fetching bos_members rows needing backfill…');
const { data: candidates, error: candErr } = await sb
  .from('bos_members')
  .select('id, display_name, staff_id, expert_id, display_department')
  .or('display_department.is.null,display_department.eq.')
  .order('id', { ascending: true });

if (candErr) {
  console.error('✗ Failed to fetch candidates:', candErr.message);
  process.exit(1);
}

const candidateRows = candidates ?? [];
console.log(`  found ${candidateRows.length} rows`);

const staffRows = candidateRows.filter((r) => r.staff_id);
const expertRows = candidateRows.filter((r) => r.expert_id);
const orphanRows = candidateRows.filter((r) => !r.staff_id && !r.expert_id);
console.log(`    • ${staffRows.length} with staff_id (internal members)`);
console.log(`    • ${expertRows.length} with expert_id (external experts)`);
console.log(`    • ${orphanRows.length} with neither (skipped — nothing to resolve)`);

if (candidateRows.length === 0) {
  console.log('\nNothing to do. Exiting.');
  process.exit(0);
}

// ── 2. Resolve internal members via staff → departments ──────────────────────
//    Two-step lookup: bos_members.staff_id → staff.department_id → departments.department_name
const staffIdSet = [...new Set(staffRows.map((r) => r.staff_id))];
/** @type {Map<string, string|null>} staff_id → department_name (null = no department) */
const staffDeptByStaffId = new Map();

if (staffIdSet.length > 0) {
  console.log('\n▸ Resolving departments for internal staff…');
  const { data: staff, error: staffErr } = await sb
    .from('staff')
    .select('id, department_id')
    .in('id', staffIdSet);
  if (staffErr) {
    console.error('✗ Failed to fetch staff rows:', staffErr.message);
    process.exit(1);
  }

  const deptIdSet = [
    ...new Set((staff ?? []).map((s) => s.department_id).filter(Boolean)),
  ];
  /** @type {Map<string, string>} */
  const deptNameById = new Map();
  if (deptIdSet.length > 0) {
    const { data: depts, error: deptErr } = await sb
      .from('departments')
      .select('id, department_name')
      .in('id', deptIdSet);
    if (deptErr) {
      console.error('✗ Failed to fetch departments:', deptErr.message);
      process.exit(1);
    }
    for (const d of depts ?? []) deptNameById.set(d.id, d.department_name);
  }

  for (const s of staff ?? []) {
    const name = s.department_id ? deptNameById.get(s.department_id) ?? null : null;
    staffDeptByStaffId.set(s.id, name);
  }
  console.log(
    `  resolved ${[...staffDeptByStaffId.values()].filter(Boolean).length}/${staffIdSet.length} staff department names`,
  );
}

// ── 3. Resolve external experts via bos_external_experts.department_name ─────
const expertIdSet = [...new Set(expertRows.map((r) => r.expert_id))];
/** @type {Map<string, string|null>} */
const deptByExpertId = new Map();

if (expertIdSet.length > 0) {
  console.log('\n▸ Resolving departments for external experts…');
  const { data: experts, error: expErr } = await sb
    .from('bos_external_experts')
    .select('id, department_name')
    .in('id', expertIdSet);
  if (expErr) {
    console.error('✗ Failed to fetch external experts:', expErr.message);
    process.exit(1);
  }
  for (const e of experts ?? []) {
    deptByExpertId.set(e.id, e.department_name?.trim() || null);
  }
  console.log(
    `  resolved ${[...deptByExpertId.values()].filter(Boolean).length}/${expertIdSet.length} expert department names`,
  );
}

// ── 4. Apply UPDATEs row-by-row ──────────────────────────────────────────────
let writes = 0;
let nullSource = 0;
let writeErrors = 0;

console.log('\n▸ Applying updates…');
for (const row of candidateRows) {
  let newDept = null;
  let source = '';

  if (row.staff_id) {
    newDept = staffDeptByStaffId.get(row.staff_id) ?? null;
    source = 'staff';
  } else if (row.expert_id) {
    newDept = deptByExpertId.get(row.expert_id) ?? null;
    source = 'expert';
  }

  if (!newDept) {
    nullSource++;
    console.log(`  – ${row.display_name ?? row.id} (${source}): no department on source — leaving NULL`);
    continue;
  }

  if (dryRun) {
    writes++;
    console.log(`  [dry] ${row.display_name ?? row.id} (${source}) → "${newDept}"`);
    continue;
  }

  const { error: updErr } = await sb
    .from('bos_members')
    .update({ display_department: newDept })
    .eq('id', row.id);

  if (updErr) {
    writeErrors++;
    console.log(`  ✗ ${row.display_name ?? row.id}: ${updErr.message}`);
    continue;
  }

  writes++;
  console.log(`  ✓ ${row.display_name ?? row.id} (${source}) → "${newDept}"`);
}

// ── 5. Summary ───────────────────────────────────────────────────────────────
console.log(`\n── Summary ──────────────────────────────────────────────────────────`);
console.log(`  Candidates scanned:       ${candidateRows.length}`);
console.log(`  ${dryRun ? 'Would update' : 'Updated'}:               ${writes}`);
console.log(`  Skipped (no source dept): ${nullSource + orphanRows.length}`);
if (writeErrors > 0) console.log(`  Write errors:             ${writeErrors}`);

if (dryRun) {
  console.log('\n  Re-run without --dry-run to apply.');
} else if (writeErrors === 0) {
  console.log('\n  Done. Re-run is safe (idempotent — only touches NULL/empty rows).');
}

process.exit(writeErrors === 0 ? 0 : 1);
