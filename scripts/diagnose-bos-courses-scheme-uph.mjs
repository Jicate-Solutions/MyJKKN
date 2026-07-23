#!/usr/bin/env node
/**
 * Diagnose why /bos/courses + /bos/course-scheme fail for UPH board members.
 * Two questions answered:
 *   A) Do the relevant roles have dot-format keys for bos-courses + bos-scheme?
 *   B) Who is on the UPH board, what roles do they carry, and do they pass
 *      the permission check + the board-membership chain we just instrumented?
 */
import { createClient } from '@supabase/supabase-js';
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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── A. Permission matrix across roles for bos-courses + bos-scheme ──────────
console.log('═══ A. PERMISSION MATRIX ═══════════════════════════════════════');
const ROLES = ['administrator', 'hod', 'principal', 'facilitator', 'coordinator', 'faculty'];
const { data: roles } = await sb
  .from('custom_roles')
  .select('role_key, permissions, is_active')
  .in('role_key', ROLES);

const MODULES = ['academic.bos-courses', 'academic.bos-scheme'];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'import'];

for (const module of MODULES) {
  console.log(`\nModule: ${module}`);
  const matrix = [];
  for (const role of (roles ?? []).sort((a, b) => a.role_key.localeCompare(b.role_key))) {
    const row = { role_key: role.role_key };
    for (const a of ACTIONS) {
      const dot = `${module}.${a}`;
      const under = `${module}_${a}`;
      row[a] = role.permissions[dot] === true ? '✓dot' : role.permissions[under] === true ? '_under' : '—';
    }
    matrix.push(row);
  }
  console.table(matrix);
}

// ── B. UPH board: programme + composition + members ─────────────────────────
console.log('\n═══ B. UPH BOARD MEMBERSHIP ════════════════════════════════════');

console.log('\nB.1 bos_board_programmes rows for programme_code=UPH');
const { data: uphProgs } = await sb
  .from('bos_board_programmes')
  .select('id, board_id, programme_code, programme_name, institutions_id, is_active')
  .ilike('programme_code', 'UPH');
if (!uphProgs || uphProgs.length === 0) {
  console.log('  ❌ no bos_board_programmes row with programme_code=UPH (case-insensitive). Maybe a different code?');
  console.log('  → searching for "physics" in programme_name…');
  const { data: byName } = await sb
    .from('bos_board_programmes')
    .select('id, board_id, programme_code, programme_name, institutions_id, is_active')
    .ilike('programme_name', '%physics%');
  console.table(byName);
} else {
  console.table(uphProgs);
}

const boards = [...new Set((uphProgs ?? []).map((p) => p.board_id))];
if (boards.length === 0) { console.log('\n  (no boards to chase further)'); process.exit(0); }

console.log(`\nB.2 active compositions for board_ids = [${boards.join(', ')}]`);
const { data: comps } = await sb
  .from('bos_compositions')
  .select('id, board_id, institutions_id, composition_title, is_active, term_start_date, term_end_date')
  .in('board_id', boards);
console.table(comps);

const compIds = (comps ?? []).filter((c) => c.is_active).map((c) => c.id);
if (compIds.length === 0) { console.log('\n  ❌ no ACTIVE compositions for the UPH board(s).'); process.exit(0); }

console.log(`\nB.3 bos_members on those compositions`);
const { data: members } = await sb
  .from('bos_members')
  .select('id, composition_id, member_type, is_active, display_name, staff_id, expert_id')
  .in('composition_id', compIds);
console.table(members);

// ── C. For internal members (staff_id set), resolve to profile + role ───────
const internalStaffIds = [...new Set((members ?? []).filter((m) => m.staff_id).map((m) => m.staff_id))];
const externalExpertIds = [...new Set((members ?? []).filter((m) => m.expert_id).map((m) => m.expert_id))];

if (internalStaffIds.length > 0) {
  console.log(`\nB.4 staff → profiles → role for ${internalStaffIds.length} internal member(s)`);
  const { data: staffRows } = await sb
    .from('staff')
    .select('id, profile_id, first_name, last_name, email, role_key, institution_id, is_active')
    .in('id', internalStaffIds);
  console.table(staffRows);
  const profileIds = (staffRows ?? []).map((s) => s.profile_id).filter(Boolean);
  if (profileIds.length > 0) {
    const { data: profs } = await sb
      .from('profiles')
      .select('id, role, is_super_admin, institution_id, full_name')
      .in('id', profileIds);
    console.table(profs);
  }
}

if (externalExpertIds.length > 0) {
  console.log(`\nB.5 external experts (NO profile link — they can't log in via this row)`);
  const { data: experts } = await sb
    .from('bos_external_experts')
    .select('id, name, email, category, designation, institution_id, is_active')
    .in('id', externalExpertIds);
  console.table(experts);
}
