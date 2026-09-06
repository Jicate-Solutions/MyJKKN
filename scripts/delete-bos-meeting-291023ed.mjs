#!/usr/bin/env node
// One-shot: delete the bos_meetings row that's blocking composition
// e6897517-f942-482c-862b-efa1cc4a124e from being deleted.
// Uses service role; bypasses RLS.

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

const MEETING_ID = '291023ed-9618-4d8c-b1ef-1073274ad76c';
const EXPECTED_COMPOSITION_ID = 'e6897517-f942-482c-862b-efa1cc4a124e';

// Sanity check: re-verify the meeting still belongs to the expected composition
// and still has no children, right before deleting. Guards against the script
// being re-run later against a row that has since changed shape.
const { data: meeting, error: getErr } = await SUPA
  .from('bos_meetings')
  .select('id, composition_id, meeting_number, academic_year, status')
  .eq('id', MEETING_ID)
  .maybeSingle();
if (getErr) { console.error('fetch error:', getErr); process.exit(1); }
if (!meeting) { console.log('Meeting already gone. Nothing to do.'); process.exit(0); }
if (meeting.composition_id !== EXPECTED_COMPOSITION_ID) {
  console.error(`Refusing to delete — meeting.composition_id is ${meeting.composition_id}, expected ${EXPECTED_COMPOSITION_ID}.`);
  process.exit(1);
}

async function head(table, ids) {
  const { count } = await SUPA.from(table).select('*', { count: 'exact', head: true }).in('meeting_id', ids);
  return count ?? 0;
}
const guards = {
  attendees: await head('bos_meeting_attendees', [MEETING_ID]),
  agenda:    await head('bos_agenda_items',      [MEETING_ID]),
  docs:      await head('bos_documents',         [MEETING_ID]),
  ta_da:     await head('bos_ta_da_claims',      [MEETING_ID]),
};
console.log('Meeting children at delete time:', guards);
const nonZero = Object.entries(guards).filter(([, c]) => c > 0);
if (nonZero.length) {
  console.error('Refusing to delete — meeting now has children that would cascade:', nonZero);
  console.error('Re-run inspect-bos-composition-delete.mjs to review.');
  process.exit(1);
}

console.log(`Deleting bos_meetings ${MEETING_ID} (composition ${meeting.composition_id}, #${meeting.meeting_number} ${meeting.academic_year} status=${meeting.status})...`);
const { error: delErr } = await SUPA.from('bos_meetings').delete().eq('id', MEETING_ID);
if (delErr) { console.error('delete error:', delErr); process.exit(1); }
console.log('Done. Composition e6897517 should now be deletable from the UI.');
