#!/usr/bin/env node
/**
 * Dry-run / verification report for
 * supabase/migrations/20260906120200_cl_girls_bc_allocation_reconciliation.sql
 *
 * The plan is READ OUT OF THE MIGRATION FILE, never re-derived here, so the
 * report can never describe something the migration does not do. Everything the
 * report needs beyond that comes from live tables.
 *
 *   node --env-file=.env scripts/cl-girls-bc-reconcile-report.mjs
 *       Read-only. Prints the per-learner before -> after manifest, the upgrade
 *       billing, and the allocation-audit verdict for every live GHB/GHC
 *       resident (baseline, plus the projected verdict for the rows we touch).
 *
 *   node --env-file=.env scripts/cl-girls-bc-reconcile-report.mjs --rehearse
 *       REHEARSAL. Executes the real migration against the real database with a
 *       forced abort appended to the end of its DO block, so every statement,
 *       trigger and assertion runs for real and then the whole thing rolls back.
 *       This is the only way to prove the migration works before applying it:
 *       exec_sql wraps the entire multi-statement EXECUTE in one subtransaction,
 *       so raising inside it discards the CREATE TABLE too. Writes nothing.
 *
 *   node --env-file=.env scripts/cl-girls-bc-reconcile-report.mjs --verify
 *       Run AFTER applying. Reads cl_girls_bc_reconcile_log and re-checks that
 *       every learner sits on the planned bed with the planned category, and
 *       re-runs the audit so the before/after verdict shift is visible.
 *
 * Transport is PostgREST + public.exec_sql with the service-role key, matching
 * scripts/apply-migration-file.mjs. Note that fn_hostel_allocation_audit itself
 * is auth.uid()-gated and unusable from here, so this script recomputes the same
 * verdicts from hostel_program_eligibility + the upgrade bills.
 */
import { readFileSync } from 'node:fs';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env');
  process.exit(1);
}
const MIGRATION = 'supabase/migrations/20260906120200_cl_girls_bc_allocation_reconciliation.sql';
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' };

const pad = (v, n) => String(v ?? '-').padEnd(n).slice(0, n);
const lpad = (v, n) => String(v ?? '').padStart(n);
const inr = (v) => Number(v || 0).toLocaleString('en-IN');

async function get(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: HEADERS });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path.slice(0, 110)} -> ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
async function rpc(name, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) return { __err: `${res.status} ${text.slice(0, 200)}` };
  return text ? JSON.parse(text) : null;
}
/** PostgREST rejects an over-long URL, so every `in.(...)` filter is chunked. */
async function getIn(table, select, col, values, extra = '') {
  const uniq = [...new Set(values.filter(Boolean))];
  let out = [];
  for (let i = 0; i < uniq.length; i += 90) {
    const list = uniq.slice(i, i + 90).join(',');
    out = out.concat(await get(`${table}?select=${encodeURIComponent(select)}&${col}=in.(${list})${extra}`));
  }
  return out;
}
const index = (rows, k) => Object.fromEntries(rows.map((r) => [r[k], r]));

/** Pulls the plan straight out of the migration's `INSERT INTO _cl_plan` VALUES. */
function readPlanFromMigration() {
  const sql = readFileSync(MIGRATION, 'utf8');
  const block = sql.split('INSERT INTO _cl_plan')[1];
  if (!block) throw new Error(`No _cl_plan INSERT found in ${MIGRATION}`);
  const values = block.split('VALUES')[1].split(/;\s*\n/)[0];
  const rows = [];
  for (const line of values.split('\n')) {
    const m = line.trim().match(/^\((\d+),\s*(\d+),\s*'([a-z]+)',\s*'((?:[^']|'')*)',\s*(.*)\)[,;]?$/);
    if (!m) continue;
    const [, seq, phase, action, name, rest] = m;
    const parts = rest.match(/'[0-9a-f-]{36}'::uuid|NULL|\d+(?:\.\d+)?|'(?:[^']|'')*'/g) || [];
    const uuid = (i) => (parts[i] && parts[i] !== 'NULL' ? parts[i].slice(1, 37) : null);
    rows.push({
      seq: +seq, phase: +phase, action, name: name.replace(/''/g, "'"),
      lp: uuid(0), profile: uuid(1),
      blockId: uuid(2), roomId: uuid(3), bedId: uuid(4), catId: uuid(5),
      bill: parts[6] && parts[6] !== 'NULL' && !parts[6].startsWith("'") ? Number(parts[6]) : 0,
    });
  }
  return rows;
}

/** The same classification the Allocation Audit page renders. */
function verdictFor(curFee, bandFees, roomRuleOk, bills, paidByBill) {
  if (!bandFees.length) return 'band_unknown';
  const bandTop = Math.max(...bandFees);
  const live = bills.filter((b) => !['cancelled', 'superseded'].includes(b.status));
  let v;
  if (bandFees.includes(curFee)) v = 'clean';
  else if (curFee > bandTop) {
    if (!live.length) v = bills.length ? 'upgrade_bill_cancelled' : 'upgrade_unbilled';
    else {
      const billed = live.reduce((s, b) => s + Number(b.final_amount || 0), 0);
      const paid = live.reduce((s, b) => s + (paidByBill[b.id] || 0), 0);
      v = paid <= 0 ? 'upgrade_unpaid' : paid >= billed ? 'upgrade_paid' : 'upgrade_partial';
    }
  } else v = 'below_band';
  if (roomRuleOk === false) v = v === 'clean' ? 'room_rule_violation' : 'band_and_rule_violation';
  return v;
}

async function loadReference() {
  const [blocks, cats, years, billCats] = await Promise.all([
    get('hostel_blocks?select=id,name,code,hostel_type'),
    get('hostel_categories?select=id,name,type,room_source_category_id'),
    get('hostel_years?select=id,name,is_current&is_current=is.true'),
    get('billing_categories?select=id,category_name'),
  ]);
  const hy = years[0];
  if (!hy) throw new Error('No current hostel year');
  const fees = await get(`hostel_fees?select=hostel_category_id,amount&hostel_year_id=eq.${hy.id}&mess_category_id=is.null&is_active=is.true`);
  const feeByCat = Object.fromEntries(fees.map((f) => [f.hostel_category_id, Number(f.amount)]));
  const ghIds = blocks.filter((b) => b.hostel_type === 'girls').map((b) => b.id);
  const rooms = await getIn('hostel_rooms', 'id,block_id,room_number,category_id,room_purpose', 'block_id', ghIds);
  const beds = await getIn('hostel_beds', 'id,room_id,bed_number,status', 'room_id', rooms.map((r) => r.id));
  return {
    hy, blocks: index(blocks, 'id'), cats: index(cats, 'id'), feeByCat,
    rooms: index(rooms, 'id'), beds: index(beds, 'id'),
    upgradeBillCat: (billCats.find((c) => c.category_name === 'Hostel Upgrade Fee') || {}).id,
    ghIds,
  };
}

async function auditPopulation(ref, blockCodes) {
  const ids = Object.values(ref.blocks).filter((b) => blockCodes.includes(b.code)).map((b) => b.id);
  let live = [];
  for (const id of ids) {
    live = live.concat(await get(`hostel_allocations?select=id,learner_id,block_id,room_id,bed_id,check_out_date&status=eq.active&block_id=eq.${id}`));
  }
  live = live.filter((a) => !a.check_out_date);
  const profs = await getIn('profiles', 'id,email,full_name,learner_id', 'id', live.map((a) => a.learner_id));
  const profById = index(profs, 'id');
  const lpIds = profs.map((p) => p.learner_id).filter(Boolean);
  const lps = await getIn('learners_profiles', 'id,hostel_category_id', 'id', lpIds);
  const lpById = index(lps, 'id');
  const bills = await getIn('billing_student_bills', 'id,student_id,item_category_id,final_amount,status,hostel_year_id', 'student_id', lpIds, '&fee_source=eq.hostel_category');
  const items = await getIn('billing_receipt_items', 'bill_id,amount_paid', 'bill_id', bills.map((b) => b.id));
  const paidByBill = items.reduce((m, x) => ((m[x.bill_id] = (m[x.bill_id] || 0) + Number(x.amount_paid || 0)), m), {});

  const rows = [];
  for (const a of live) {
    const p = profById[a.learner_id];
    const lp = p ? lpById[p.learner_id] : null;
    if (!lp) continue;
    const band = ((await rpc('fn_hostel_learner_room_categories', { p_learner_id: lp.id })) || [])
      .map((x) => ref.feeByCat[x.category_id]).filter((x) => x != null);
    const roomOk = await rpc('fn_learner_eligible_for_room', { p_learner_id: lp.id, p_room_id: a.room_id });
    const mine = bills.filter((b) => b.student_id === lp.id && b.item_category_id === ref.upgradeBillCat && b.hostel_year_id === ref.hy.id);
    rows.push({
      allocId: a.id, profile: p.id, lp: lp.id, name: p.full_name,
      block: ref.blocks[a.block_id]?.code, room: ref.rooms[a.room_id]?.room_number, bed: ref.beds[a.bed_id]?.bed_number,
      cat: ref.cats[lp.hostel_category_id]?.name ?? null,
      verdict: verdictFor(ref.feeByCat[lp.hostel_category_id], band, roomOk, mine, paidByBill),
    });
  }
  return rows;
}

function tally(rows, key) {
  const m = {};
  for (const r of rows) m[key(r)] = (m[key(r)] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

async function rehearse() {
  const sql = readFileSync(MIGRATION, 'utf8');
  const marker = '\nEND\n$mig$;';
  if (!sql.includes(marker)) throw new Error('Could not find the end of the DO block to inject the abort into');
  const aborted = sql.replace(
    marker,
    "\n  RAISE EXCEPTION 'DRY_RUN_ROLLBACK: every statement and assertion succeeded; discarding';\nEND\n$mig$;"
  );
  console.log('Rehearsing the migration against the live database with a forced rollback...\n');
  const res = await fetch(`${URL_}/rest/v1/rpc/exec_sql`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query: aborted }) });
  const text = await res.text();
  let out;
  try { out = JSON.parse(text); } catch { out = { ok: false, error: text.slice(0, 1500) }; }

  if (out && out.ok === true) {
    console.error('REHEARSAL BROKEN: exec_sql reported success, which means the forced abort never ran.');
    console.error('Nothing can be concluded and the run may have COMMITTED. Inspect the database.');
    process.exitCode = 2;
    return;
  }
  const err = String(out?.error ?? '');
  if (err.includes('DRY_RUN_ROLLBACK')) {
    console.log('REHEARSAL PASSED.');
    console.log('  Every statement, trigger and phase-5 assertion executed against real data,');
    console.log('  then the whole transaction was discarded. Nothing was written.');
    console.log('  The migration is safe to apply with:');
    console.log('    node --env-file=.env scripts/apply-migration-file.mjs 20260906120200_cl_girls_bc_allocation_reconciliation.sql');
  } else {
    console.error('REHEARSAL FAILED — the migration aborted before reaching the end.');
    console.error(`  sqlstate: ${out?.sqlstate ?? '(none)'}`);
    console.error(`  error   : ${err}`);
    console.error('  Nothing was written. Fix the cause and rehearse again.');
    process.exitCode = 1;
  }
}

async function main() {
  const mode = process.argv.includes('--rehearse') ? 'rehearse'
    : process.argv.includes('--verify') ? 'verify' : 'report';
  if (mode === 'rehearse') return rehearse();

  const ref = await loadReference();
  const plan = readPlanFromMigration();
  const acting = plan.filter((p) => p.action !== 'skip');

  const profs = await getIn('profiles', 'id,email,full_name,learner_id', 'id', plan.map((p) => p.profile));
  const profById = index(profs, 'id');
  const lps = await getIn('learners_profiles', 'id,hostel_category_id,institution_id', 'id', plan.map((p) => p.lp));
  const lpById = index(lps, 'id');
  const allocs = await getIn('hostel_allocations', 'id,learner_id,block_id,room_id,bed_id,check_out_date,status', 'learner_id', plan.map((p) => p.profile), '&status=eq.active');
  const allocByProfile = index(allocs.filter((a) => !a.check_out_date), 'learner_id');
  const loc = (a) => (a ? `${ref.blocks[a.block_id]?.code} R${ref.rooms[a.room_id]?.room_number} B${ref.beds[a.bed_id]?.bed_number}` : '(unplaced)');
  const target = (p) => `${ref.blocks[p.blockId]?.code} R${ref.rooms[p.roomId]?.room_number} B${ref.beds[p.bedId]?.bed_number}`;

  console.log(`Girls Hostel B & C — allocation reconciliation, ${mode === 'verify' ? 'POST-APPLY VERIFICATION' : 'DRY RUN'}`);
  console.log(`Migration: ${MIGRATION}`);
  console.log(`Hostel year: ${ref.hy.name}\n`);

  // What each learner is ALREADY billed in the Hostel Upgrade Fee category —
  // scoped to the category and not to fee_source/hostel_year, because that is
  // the scope trg_billing_bills_once_per_learner enforces and the scope the
  // migration derives its top-up from.
  const liveBills = await getIn(
    'billing_student_bills', 'id,student_id,final_amount,balance_amount,status,fee_source,hostel_year_id',
    'student_id', plan.map((p) => p.lp),
    `&item_category_id=eq.${ref.upgradeBillCat}&status=not.in.(cancelled,superseded)`
  );
  const billedByLp = liveBills.reduce((m, b) => ((m[b.student_id] = (m[b.student_id] || 0) + Number(b.final_amount || 0)), m), {});
  const invisibleToRpc = new Set(
    liveBills.filter((b) => b.fee_source !== 'hostel_category' || b.hostel_year_id !== ref.hy.id).map((b) => b.student_id)
  );

  console.log('PER-LEARNER CHANGE MANIFEST');
  console.log(`  ${pad('#', 4)}${pad('ph', 4)}${pad('action', 9)}${pad('learner', 24)}${pad('from', 16)}${pad('to', 16)}${pad('category', 32)}${lpad('need', 8)}${lpad('billed', 8)}${lpad('raise', 8)}`);
  let expected = 0;
  for (const p of plan) {
    const lp = lpById[p.lp];
    const before = allocByProfile[p.profile];
    const curCat = ref.cats[lp?.hostel_category_id]?.name ?? '(none)';
    const newCat = ref.cats[p.catId]?.name ?? '(unchanged)';
    const catCell = p.action === 'skip' ? '-' : curCat === newCat ? curCat : `${curCat} -> ${newCat}`;
    // Phase 3 lets _cl_upgrade_room_category price the rung from the configured
    // ladder, so the plan row carries no amount; phase 4 carries the REQUIRED
    // TOTAL and the migration raises only the shortfall. Model both here.
    const need = p.action === 'upgrade'
      ? (ref.feeByCat[p.catId] ?? 0) - (ref.feeByCat[lp?.hostel_category_id] ?? 0)
      : p.bill;
    const already = p.action === 'fresh' ? (billedByLp[p.lp] || 0) : 0;
    const raise = p.action === 'skip' ? 0 : Math.max(0, need - already);
    expected += raise;
    const flag = p.action === 'fresh' && invisibleToRpc.has(p.lp) ? ' *' : '';
    console.log(`  ${pad(p.seq, 4)}${pad(p.phase, 4)}${pad(p.action, 9)}${pad(p.name, 24)}`
      + `${pad(p.action === 'skip' ? '-' : loc(before), 16)}${pad(p.action === 'skip' ? '-' : target(p), 16)}`
      + `${pad(catCell, 32)}${lpad(need ? inr(need) : '-', 8)}${lpad(already ? inr(already) : '-', 8)}${lpad(raise ? inr(raise) : '0', 8)}${flag}`);
  }
  console.log(`\n  ${acting.length} rows to apply, ${plan.length - acting.length} deliberately skipped.`);
  console.log(`  Billing actually raised: Rs.${inr(expected)}`);
  console.log('    need   = the rung this learner ends on, priced off hostel_category_upgrade_fees');
  console.log('    billed = what they already hold in the Hostel Upgrade Fee category (any fee_source, any year)');
  console.log('    raise  = the shortfall, and the only thing this migration charges. No bill is cancelled.');
  if (invisibleToRpc.size) {
    console.log(`    *      = holds a bill _cl_apply_upgrade_fee_bill cannot see (wrong fee_source / hostel year);`);
    console.log('             the migration tops that bill up in place instead of inserting a second one, which');
    console.log('             would be refused by trg_billing_bills_once_per_learner (BL001).');
  }

  console.log('\nBED CONTENTION CHECK (why phase 1 runs first)');
  const wanted = new Set(acting.map((p) => p.bedId));
  const movingOff = new Set(acting.map((p) => allocByProfile[p.profile]?.bed_id).filter(Boolean));
  for (const p of acting) {
    const holder = allocs.find((a) => !a.check_out_date && a.bed_id === p.bedId && a.learner_id !== p.profile);
    if (!holder) continue;
    const hName = profById[holder.learner_id]?.full_name ?? holder.learner_id;
    const freed = movingOff.has(p.bedId);
    console.log(`  ${pad(p.name, 24)} wants ${pad(target(p), 16)} held by ${pad(hName, 24)}`
      + (freed ? '-> freed by an earlier phase' : '-> NOT FREED: this will fail'));
  }
  if (![...wanted].some((b) => allocs.some((a) => !a.check_out_date && a.bed_id === b && !movingOff.has(b)))) {
    console.log('  every contended bed is vacated by an earlier phase.');
  }

  console.log('\nALLOCATION AUDIT — live GHB/GHC residents');
  const before = await auditPopulation(ref, ['GHB', 'GHC']);
  for (const [v, n] of tally(before, (r) => r.verdict)) console.log(`  ${lpad(n, 4)}  ${v}`);
  const red = before.filter((r) => ['upgrade_unbilled', 'upgrade_bill_cancelled', 'room_rule_violation', 'band_and_rule_violation'].includes(r.verdict));
  const touched = new Set(acting.map((p) => p.profile));
  console.log(`\n  ${red.length} rows are red today; ${red.filter((r) => touched.has(r.profile)).length} of them are rows this migration touches.`);
  console.log('  The rest are the pre-existing Deluxe Plus population: hostel_category_upgrade_fees');
  console.log('  prices Deluxe -> Deluxe Plus at net_amount 0, so no bill is ever raised and the');
  console.log('  audit reports "above band, never billed" permanently. Separate fix, not this one.');

  if (mode === 'verify') {
    console.log('\nPOST-APPLY CHECK against cl_girls_bc_reconcile_log');
    const log = await get('cl_girls_bc_reconcile_log?select=*&order=seq.asc');
    if (!log.length) { console.log('  no log rows — the migration has not been applied'); return; }
    let bad = 0;
    for (const l of log.filter((x) => x.outcome === 'applied')) {
      const a = allocs.find((x) => x.id === l.after_allocation_id)
        ?? (await get(`hostel_allocations?select=id,room_id,bed_id,check_out_date,status&id=eq.${l.after_allocation_id}`))[0];
      const lp = (await get(`learners_profiles?select=hostel_category_id&id=eq.${l.learner_profile_id}`))[0];
      const okBed = a && a.room_id === l.target_room_id && a.bed_id === l.target_bed_id && a.status === 'active' && !a.check_out_date;
      const okCat = lp && lp.hostel_category_id === l.target_category_id;
      if (!okBed || !okCat) {
        bad++;
        console.log(`  MISMATCH ${pad(l.learner_name, 24)}${okBed ? '' : 'bed/room off '}${okCat ? '' : 'category off '}`);
      }
    }
    console.log(`  ${log.filter((x) => x.outcome === 'applied').length} applied rows checked, ${bad} mismatches.`);
    console.log(`  ${log.filter((x) => x.outcome === 'skipped').length} skipped: ${log.filter((x) => x.outcome === 'skipped').map((x) => `${x.learner_name} (${x.note})`).join('; ')}`);
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
