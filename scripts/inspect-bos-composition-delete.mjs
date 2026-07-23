#!/usr/bin/env node
// Inspect a bos_compositions row and every child that would block/cascade on delete.
// Read-only — does NOT delete anything.
//
// Usage:  node scripts/inspect-bos-composition-delete.mjs <composition_id>

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

const SUPA = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ID = process.argv[2];
if (!ID) {
  console.error('Usage: node scripts/inspect-bos-composition-delete.mjs <composition_id>');
  process.exit(1);
}

console.log(`\n=== Inspecting bos_compositions ${ID} ===\n`);

// 1. The composition row itself
const { data: comp, error: compErr } = await SUPA
  .from('bos_compositions')
  .select('*')
  .eq('id', ID)
  .maybeSingle();
if (compErr) { console.error('composition fetch error:', compErr); process.exit(1); }
if (!comp) { console.log('No composition with that id. Already gone?'); process.exit(0); }

console.log('composition:');
console.log({
  id: comp.id,
  institutions_id: comp.institutions_id,
  board_id: comp.board_id,
  composition_no: comp.composition_no,
  term_start_date: comp.term_start_date,
  term_end_date: comp.term_end_date,
  is_active: comp.is_active,
  created_by: comp.created_by,
  created_at: comp.created_at,
});

// 2. Direct children (CASCADE on composition_id) — bos_members
const { data: members, error: mErr } = await SUPA
  .from('bos_members')
  .select('id, member_type, display_name, staff_id, expert_id')
  .eq('composition_id', ID);
if (mErr) console.error('members err:', mErr);
console.log(`\nbos_members (CASCADE on composition delete): ${members?.length ?? 0}`);
for (const m of members ?? []) {
  console.log(`  ${m.id}  ${m.member_type.padEnd(20)} ${m.display_name}`);
}

// 3. Direct children (NO CASCADE on composition_id) — bos_meetings — BLOCKS DELETE
const { data: meetings, error: meetErr } = await SUPA
  .from('bos_meetings')
  .select('id, meeting_number, academic_year, status, scheduled_date, meeting_title')
  .eq('composition_id', ID);
if (meetErr) console.error('meetings err:', meetErr);
console.log(`\nbos_meetings (NO CASCADE — will BLOCK composition delete): ${meetings?.length ?? 0}`);
for (const m of meetings ?? []) {
  console.log(`  ${m.id}  #${m.meeting_number} ${m.academic_year} ${m.status} ${m.scheduled_date ?? ''} ${m.meeting_title ?? ''}`);
}

const meetingIds = (meetings ?? []).map((m) => m.id);
const memberIds = (members ?? []).map((m) => m.id);

// 4. Meeting-children (all CASCADE on meeting delete)
async function count(table, column, ids) {
  if (!ids.length) return 0;
  const { count, error } = await SUPA
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, ids);
  if (error) { console.error(`${table} count err:`, error); return -1; }
  return count ?? 0;
}

console.log('\nMeeting-children (cascade away when meetings deleted):');
console.log(`  bos_meeting_attendees   : ${await count('bos_meeting_attendees', 'meeting_id', meetingIds)}`);
console.log(`  bos_agenda_items        : ${await count('bos_agenda_items', 'meeting_id', meetingIds)}`);
console.log(`  bos_documents           : ${await count('bos_documents', 'meeting_id', meetingIds)}`);
console.log(`  bos_ta_da_claims        : ${await count('bos_ta_da_claims', 'meeting_id', meetingIds)}`);

// 5. Cross-composition stragglers: rows that reference these members
//    via FKs that are NOT scoped to this composition's meetings.
console.log('\nCross-composition references to these members (would block member cascade):');
const acrossAttendance = await (async () => {
  if (!memberIds.length) return 0;
  const { data, error } = await SUPA
    .from('bos_meeting_attendees')
    .select('id, meeting_id')
    .in('member_id', memberIds);
  if (error) { console.error('attendees x-scan err:', error); return -1; }
  const outside = (data ?? []).filter((r) => !meetingIds.includes(r.meeting_id));
  return outside.length;
})();
const acrossTaDa = await (async () => {
  if (!memberIds.length) return 0;
  const { data, error } = await SUPA
    .from('bos_ta_da_claims')
    .select('id, meeting_id')
    .in('member_id', memberIds);
  if (error) { console.error('ta_da x-scan err:', error); return -1; }
  const outside = (data ?? []).filter((r) => !meetingIds.includes(r.meeting_id));
  return outside.length;
})();
const acrossDocs = await (async () => {
  if (!memberIds.length) return 0;
  const { data, error } = await SUPA
    .from('bos_documents')
    .select('id, meeting_id')
    .in('recipient_member_id', memberIds);
  if (error) { console.error('documents x-scan err:', error); return -1; }
  const outside = (data ?? []).filter((r) => !meetingIds.includes(r.meeting_id));
  return outside.length;
})();
console.log(`  bos_meeting_attendees (other meetings): ${acrossAttendance}`);
console.log(`  bos_ta_da_claims      (other meetings): ${acrossTaDa}`);
console.log(`  bos_documents         (other meetings): ${acrossDocs}`);

console.log('\nSummary:');
const blockers = (meetings?.length ?? 0);
if (blockers === 0) {
  console.log('  No bos_meetings reference this composition. A direct DELETE should succeed.');
  console.log(`  bos_members count: ${members?.length ?? 0} (will cascade automatically)`);
} else {
  console.log(`  ${blockers} bos_meetings row(s) directly block the composition delete.`);
  console.log('  Deleting those meetings will cascade away all meeting-children.');
  if (acrossAttendance + acrossTaDa + acrossDocs > 0) {
    console.log('  WARNING: members from this composition are referenced in OTHER compositions\' meetings —');
    console.log('  those rows will block the bos_members cascade. Investigate before deleting.');
  } else {
    console.log('  No cross-composition stragglers — safe to: delete meetings, then composition.');
  }
}
