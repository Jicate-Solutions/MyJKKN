#!/usr/bin/env node
/**
 * Follow-up diagnostic: the staff row claims profile_id=<X> but no profiles row exists.
 * Resolve which of these is true:
 *   A) auth.users has a row but profiles row was never inserted (handle_new_user trigger gap)
 *   B) staff.profile_id is stale (points at a deleted/different user)
 *   C) The user has TWO staff rows — one linked, one unlinked
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

const email = 'testuser@jkkn.ac.in';
const staffProfileId = 'd43cefe1-0765-44ff-9446-aea79487aff5';

console.log('── 1. All staff rows for this email ─────────────────────────────────');
const { data: staffByEmail } = await sb
  .from('staff')
  .select('id, profile_id, email, first_name, last_name, institution_id, role_key, is_active')
  .ilike('email', email);
console.table(staffByEmail);

console.log('\n── 2. Profiles row by id (the one staff claims to point at) ─────────');
const { data: profileById } = await sb.from('profiles').select('*').eq('id', staffProfileId);
console.log(`  rows=${profileById?.length ?? 0}`);
if (profileById?.[0]) console.log('  →', profileById[0]);

console.log('\n── 3. Profiles row matching the email (if column exists) ────────────');
const { data: profileByEmail, error: pbeErr } = await sb
  .from('profiles')
  .select('id, role, is_super_admin, institution_id, email')
  .ilike('email', email);
if (pbeErr) console.log('  (profiles has no email column or query failed:', pbeErr.message, ')');
else console.table(profileByEmail);

console.log('\n── 4. Any profile whose id begins with the same prefix? ─────────────');
const { data: profileByPrefix } = await sb
  .from('profiles')
  .select('id, role, institution_id, first_name, last_name')
  .like('id', `${staffProfileId.slice(0, 8)}%`);
console.table(profileByPrefix);

console.log('\n── 5. bos_members for ALL staff rows above ──────────────────────────');
if (staffByEmail && staffByEmail.length > 0) {
  const ids = staffByEmail.map((s) => s.id);
  const { data: members } = await sb
    .from('bos_members')
    .select('id, composition_id, member_type, is_active, display_name, staff_id')
    .in('staff_id', ids);
  console.log(`  rows=${members?.length ?? 0}`);
  console.table(members);
}
