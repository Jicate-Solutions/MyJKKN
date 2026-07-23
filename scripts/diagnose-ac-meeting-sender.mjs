#!/usr/bin/env node
// Investigate the From: sender used for a specific meeting.
// Walks: meeting → institutions_id → counselling_code → smtp_configuration
// and prints what From address BoS vs Academic Council would send from.

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

const MEETING_ID = process.argv[2] || '35e96d2e-9b3d-483b-ad5b-60eaf894fa76';

const { data: meeting, error: mErr } = await SUPA
  .from('bos_meetings')
  .select('id, meeting_title, meeting_type, status, institutions_id, composition_id, academic_year')
  .eq('id', MEETING_ID)
  .maybeSingle();

if (mErr) { console.error('meeting query error:', mErr); process.exit(1); }
if (!meeting) { console.error('Meeting not found:', MEETING_ID); process.exit(1); }

console.log('\n── Meeting ────────────────────────────────');
console.log('  id            :', meeting.id);
console.log('  title         :', meeting.meeting_title);
console.log('  meeting_type  :', meeting.meeting_type, meeting.meeting_type === 'academic_council' ? '  ← Academic Council' : '  ← Board of Studies');
console.log('  status        :', meeting.status);
console.log('  institutions_id:', meeting.institutions_id);

const { data: inst } = await SUPA
  .from('institutions')
  .select('id, name, counselling_code')
  .eq('id', meeting.institutions_id)
  .maybeSingle();

console.log('\n── Institution ────────────────────────────');
console.log('  name             :', inst?.name);
console.log('  counselling_code :', inst?.counselling_code);

const { data: smtp, error: sErr } = await SUPA
  .from('smtp_configuration')
  .select('*')
  .eq('institution_code', inst?.counselling_code ?? '__none__')
  .eq('is_active', true)
  .maybeSingle();

if (sErr) console.error('smtp query error:', sErr);

console.log('\n── SMTP config (active, by institution_code) ──');
if (!smtp) {
  console.log('  (no active row for counselling_code =', inst?.counselling_code, ')');
} else {
  console.log('  smtp_host        :', smtp.smtp_host);
  console.log('  smtp_user        :', smtp.smtp_user);
  console.log('  sender_email     :', smtp.sender_email, '   ← BoS From');
  console.log('  sender_name      :', smtp.sender_name);
  console.log('  ac_sender_email  :', smtp.ac_sender_email ?? '(null — column may not exist yet / not set)');
  console.log('  ac_sender_name   :', smtp.ac_sender_name ?? '(null)');
}

// Emulate the resolution the sender will now use.
const isAc = meeting.meeting_type === 'academic_council';
const effectiveEmail = (isAc && smtp?.ac_sender_email?.trim()) ? smtp.ac_sender_email.trim() : smtp?.sender_email;
const effectiveName = (isAc ? (smtp?.ac_sender_name ?? smtp?.sender_name) : smtp?.sender_name) ?? '';

console.log('\n── Effective From: for THIS meeting ───────');
console.log('  is Academic Council :', isAc);
console.log('  From email          :', effectiveEmail);
console.log('  From name           :', effectiveName);
console.log('');
