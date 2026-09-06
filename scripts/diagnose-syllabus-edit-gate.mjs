#!/usr/bin/env node
/**
 * Read-only: replicates resolveBosBoardScope + guardSyllabusEdit EXACTLY to
 * explain why a user can/can't edit given syllabi.
 *   staff.profile_id = authUid  →  bos_members.staff_id (active)  →  composition
 *   chairman => member_type base_type is chairman  =>  chairmanForBoards += board_id
 *   editable IF super-admin OR created_by===authUid OR chairmanForBoards.has(board_id)
 *
 * Usage: node scripts/diagnose-syllabus-edit-gate.mjs <email> [code...]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('='); if (eq < 1) continue;
  const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const email = process.argv[2] || 'yasodharan.v@jkkn.ac.in';
const codes = process.argv.slice(3);
const courseCodes = codes.length ? codes : ['24EVS01A','24PCAC01','24PCAC02','24PCAC03','24PCAC04','24PCAC05','24PCAC06'];
const isChair = (t) => /chair/i.test(t ?? '');

console.log(`\n══ Syllabus edit-gate for ${email} ══\n`);
const { data: profile } = await sb.from('profiles').select('id, email, full_name, role, is_super_admin, institution_id').eq('email', email).maybeSingle();
if (!profile) { console.log('✗ no profile'); process.exit(1); }
console.log(`profile.id(auth uid)=${profile.id}  role=${profile.role}  super=${profile.is_super_admin}`);

// staff by profile_id
const { data: staffRow, error: staffErr } = await sb.from('staff').select('id, first_name, last_name, institution_email').eq('profile_id', profile.id).maybeSingle();
if (staffErr) console.log('staff query error:', staffErr.message);
console.log(`staff row: ${staffRow ? staffRow.id + '  ' + [staffRow.first_name, staffRow.last_name].filter(Boolean).join(' ') : 'NONE (no staff link → zero BoS memberships)'}`);

const chairmanForBoards = new Set();
const memberOfBoards = new Set();
if (staffRow) {
  const { data: memberRows, error } = await sb
    .from('bos_members')
    .select('composition_id, member_type, is_active, bos_compositions!inner(id, board_id, name, is_active)')
    .eq('staff_id', staffRow.id)
    .eq('is_active', true)
    .eq('bos_compositions.is_active', true);
  if (error) console.log('bos_members query error:', error.message);
  console.log(`\nActive bos_members rows: ${memberRows?.length ?? 0}`);
  for (const m of memberRows ?? []) {
    const bid = m.bos_compositions?.board_id;
    if (bid) memberOfBoards.add(bid);
    const chair = isChair(m.member_type);
    if (chair && bid) chairmanForBoards.add(bid);
    console.log(`  • comp='${m.bos_compositions?.name}' board=${bid} type='${m.member_type}' chairman=${chair}`);
  }
  // multi-board junction
  const compIds = [...new Set((memberRows ?? []).map((m) => m.composition_id))];
  if (compIds.length) {
    const { data: cb } = await sb.from('bos_composition_boards').select('composition_id, board_id').in('composition_id', compIds);
    const chairComps = new Set((memberRows ?? []).filter((m) => isChair(m.member_type)).map((m) => m.composition_id));
    for (const row of cb ?? []) { if (!row.board_id) continue; memberOfBoards.add(row.board_id); if (chairComps.has(row.composition_id)) chairmanForBoards.add(row.board_id); }
  }
}
console.log(`\nchairmanForBoards: [${[...chairmanForBoards].join(', ') || '(none)'}]`);
console.log(`memberOfBoards:    [${[...memberOfBoards].join(', ') || '(none)'}]`);

const { data: syllabi } = await sb.from('bos_course_syllabi').select('course_code, board_id, created_by, is_latest, is_archived').in('course_code', courseCodes).eq('is_latest', true);
console.log(`\n── Edit gate (${syllabi?.length ?? 0} rows) ──`);
for (const s of syllabi ?? []) {
  let editable, reason;
  if (profile.is_super_admin) { editable = true; reason = 'super-admin'; }
  else if (!s.board_id) { editable = false; reason = 'board_id NULL'; }
  else if (s.created_by === profile.id) { editable = true; reason = 'creator'; }
  else if (chairmanForBoards.has(s.board_id)) { editable = true; reason = 'board chairman'; }
  else if (memberOfBoards.has(s.board_id)) { editable = true; reason = 'board member (widened rule)'; }
  else { editable = false; reason = memberOfBoards.size ? 'not a member of THIS board' : 'no BoS membership at all — add to the board composition'; }
  console.log(`  ${(s.course_code ?? '').padEnd(10)} board=${String(s.board_id ?? 'NULL').slice(0,8)} → ${editable ? 'EDIT ✓' : 'blocked'}  (${reason})`);
}
process.exit(0);
