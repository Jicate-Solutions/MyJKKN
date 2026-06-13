#!/usr/bin/env node
/**
 * Backfill bos_compositions.board_type and bos_meetings.board_type for rows
 * created before the 20260521 migration that added these columns. Source of
 * truth is the COE /api/public/boards endpoint, keyed by counselling_code.
 *
 * Flow:
 *   1. Find distinct (institutions_id, board_id) pairs from bos_compositions
 *      and bos_meetings where board_type IS NULL.
 *   2. For each institutions_id, resolve counselling_code from the
 *      institutions table.
 *   3. For each counselling_code, GET COE /api/public/boards?institution_code=...
 *      and build a board_id → board_type map.
 *   4. UPDATE bos_compositions.board_type per row (one round-trip per row,
 *      keeping the change set small).
 *   5. Cascade the same value into every bos_meeting whose composition was
 *      just updated.
 *
 * Re-runs are safe (idempotent — only touches NULL rows). If COE is
 * unreachable for an institution, those rows stay NULL and the script reports
 * them in the summary so you can re-run later.
 *
 * Required .env keys:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   COE_API_URL
 *   COE_API_KEY_ID
 *   COE_API_SECRET
 *
 * Run:  node scripts/backfill-bos-board-type-from-coe.mjs
 *       node scripts/backfill-bos-board-type-from-coe.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// ── .env loader ──────────────────────────────────────────────────────────────
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
const coeUrl = process.env.COE_API_URL;
const coeKeyId = process.env.COE_API_KEY_ID;
const coeSecret = process.env.COE_API_SECRET;

if (!supabaseUrl || !serviceKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(2);
}
if (!coeUrl || !coeKeyId || !coeSecret) {
  console.error('✗ COE_API_URL / COE_API_KEY_ID / COE_API_SECRET missing from .env');
  process.exit(2);
}

const dryRun = process.argv.includes('--dry-run');
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

console.log(`Project: ${supabaseUrl.match(/https:\/\/([a-z0-9]+)\./i)?.[1] ?? '(unknown)'}`);
console.log(`COE:     ${coeUrl}`);
console.log(`Mode:    ${dryRun ? 'DRY RUN — no writes' : 'LIVE — writes will be applied'}`);

// ── 1. Find compositions needing backfill ────────────────────────────────────
console.log('\n▸ Fetching bos_compositions rows with NULL board_type…');
const { data: comps, error: compErr } = await sb
  .from('bos_compositions')
  .select('id, institutions_id, board_id, composition_title, board_type')
  .is('board_type', null)
  .order('institutions_id', { ascending: true });

if (compErr) {
  console.error('✗ Failed to fetch compositions:', compErr.message);
  process.exit(1);
}

const compRows = comps ?? [];
console.log(`  found ${compRows.length} compositions`);

if (compRows.length === 0) {
  console.log('\nNothing to do. Exiting.');
  process.exit(0);
}

// ── 2. Resolve counselling_code per institution ──────────────────────────────
const instIdSet = [...new Set(compRows.map((r) => r.institutions_id).filter(Boolean))];

console.log(`\n▸ Resolving counselling_code for ${instIdSet.length} institutions…`);
const { data: insts, error: instErr } = await sb
  .from('institutions')
  .select('id, counselling_code, name')
  .in('id', instIdSet);

if (instErr) {
  console.error('✗ Failed to fetch institutions:', instErr.message);
  process.exit(1);
}

/** @type {Map<string, { code: string|null, name: string }>} */
const instById = new Map();
for (const i of insts ?? []) {
  instById.set(i.id, { code: i.counselling_code ?? null, name: i.name ?? '' });
}
const codesMissing = instIdSet.filter((id) => !instById.get(id)?.code);
if (codesMissing.length > 0) {
  console.log(`  ! ${codesMissing.length} institutions have no counselling_code — their rows will be skipped`);
}

// ── 3. Fetch boards per unique counselling_code (deduped across CAS pairs) ───
const uniqueCodes = [
  ...new Set([...instById.values()].map((v) => v.code).filter(Boolean)),
];

/** @type {Map<string, string|null>} board_id → board_type */
const boardTypeById = new Map();
const codeStatus = new Map(); // code → 'ok' | 'fail'

console.log(`\n▸ Fetching COE boards for ${uniqueCodes.length} institution codes…`);
const trimmedBase = coeUrl.replace(/\/$/, '');
for (const code of uniqueCodes) {
  const url = `${trimmedBase}/api/public/boards?institution_code=${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'X-API-Key-Id': coeKeyId,
        'X-API-Secret': coeSecret,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      codeStatus.set(code, 'fail');
      console.log(`  ✗ code=${code} → HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const boards = Array.isArray(json) ? json : (json?.data ?? []);
    let added = 0;
    for (const b of boards) {
      if (b?.id) {
        boardTypeById.set(b.id, b.board_type ?? null);
        added++;
      }
    }
    codeStatus.set(code, 'ok');
    console.log(`  ✓ code=${code} → ${added} boards (${boards.length} returned)`);
  } catch (e) {
    codeStatus.set(code, 'fail');
    console.log(`  ✗ code=${code} → ${e.message}`);
  }
}

// ── 4. Update compositions row-by-row ────────────────────────────────────────
let compWrites = 0;
let compSkipNoCode = 0;
let compSkipNoBoardType = 0;
let compErrors = 0;

console.log('\n▸ Updating compositions…');
for (const row of compRows) {
  const inst = instById.get(row.institutions_id);
  if (!inst?.code) {
    compSkipNoCode++;
    continue;
  }
  const boardType = boardTypeById.get(row.board_id) ?? null;
  if (!boardType) {
    compSkipNoBoardType++;
    console.log(`  – ${row.composition_title ?? row.id}: COE returned no board_type for board_id=${row.board_id}`);
    continue;
  }

  if (dryRun) {
    compWrites++;
    console.log(`  [dry] ${row.composition_title ?? row.id} → "${boardType}"`);
    continue;
  }

  const { error: updErr } = await sb
    .from('bos_compositions')
    .update({ board_type: boardType })
    .eq('id', row.id);

  if (updErr) {
    compErrors++;
    console.log(`  ✗ ${row.composition_title ?? row.id}: ${updErr.message}`);
    continue;
  }
  compWrites++;
  console.log(`  ✓ ${row.composition_title ?? row.id} → "${boardType}"`);
}

// ── 5. Cascade into bos_meetings ─────────────────────────────────────────────
// Every meeting under a backfilled composition picks up the same value. We
// only touch meetings whose board_type is NULL — meetings created after the
// migration already have a value, and we shouldn't overwrite them.
console.log('\n▸ Cascading board_type into bos_meetings (NULL rows only)…');

const { data: meetings, error: meetErr } = await sb
  .from('bos_meetings')
  .select('id, composition_id, meeting_title, board_type')
  .is('board_type', null);

if (meetErr) {
  console.error('✗ Failed to fetch meetings:', meetErr.message);
  process.exit(1);
}

// Re-fetch composition board_type values so we cascade the just-updated set.
const compIdsToCheck = [...new Set((meetings ?? []).map((m) => m.composition_id))];
/** @type {Map<string, string|null>} */
const compBoardTypeById = new Map();
if (compIdsToCheck.length > 0) {
  const { data: refreshedComps } = await sb
    .from('bos_compositions')
    .select('id, board_type')
    .in('id', compIdsToCheck);
  for (const c of refreshedComps ?? []) {
    compBoardTypeById.set(c.id, c.board_type ?? null);
  }
}

let meetWrites = 0;
let meetSkip = 0;
let meetErrors = 0;

for (const m of meetings ?? []) {
  const boardType = compBoardTypeById.get(m.composition_id) ?? null;
  if (!boardType) {
    meetSkip++;
    continue;
  }
  if (dryRun) {
    meetWrites++;
    console.log(`  [dry] ${m.meeting_title ?? m.id} → "${boardType}"`);
    continue;
  }
  const { error: updErr } = await sb
    .from('bos_meetings')
    .update({ board_type: boardType })
    .eq('id', m.id);
  if (updErr) {
    meetErrors++;
    console.log(`  ✗ ${m.meeting_title ?? m.id}: ${updErr.message}`);
    continue;
  }
  meetWrites++;
  console.log(`  ✓ ${m.meeting_title ?? m.id} → "${boardType}"`);
}

// ── 6. Summary ───────────────────────────────────────────────────────────────
console.log(`\n── Summary ──────────────────────────────────────────────────────────`);
console.log(`  Compositions scanned:        ${compRows.length}`);
console.log(`  ${dryRun ? 'Would update' : 'Updated'} compositions:      ${compWrites}`);
console.log(`  Skipped (no counselling code): ${compSkipNoCode}`);
console.log(`  Skipped (no COE board_type): ${compSkipNoBoardType}`);
if (compErrors > 0) console.log(`  Composition write errors:    ${compErrors}`);
console.log(`  Meetings scanned (NULL):     ${(meetings ?? []).length}`);
console.log(`  ${dryRun ? 'Would update' : 'Updated'} meetings:          ${meetWrites}`);
console.log(`  Meetings skipped (parent NULL): ${meetSkip}`);
if (meetErrors > 0) console.log(`  Meeting write errors:        ${meetErrors}`);

const failedCodes = [...codeStatus.entries()].filter(([, s]) => s === 'fail').map(([c]) => c);
if (failedCodes.length > 0) {
  console.log(`\n  ! COE lookup failed for ${failedCodes.length} institution code(s):`);
  for (const c of failedCodes) console.log(`     - ${c}`);
  console.log(`  Re-run after COE recovers to pick these up (script is idempotent).`);
}

if (dryRun) {
  console.log('\n  Re-run without --dry-run to apply.');
} else if (compErrors === 0 && meetErrors === 0) {
  console.log('\n  Done. Re-run is safe (idempotent — only touches NULL rows).');
}

process.exit(compErrors + meetErrors === 0 ? 0 : 1);
