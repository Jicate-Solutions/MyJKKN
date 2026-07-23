#!/usr/bin/env node
/**
 * scripts/diagnose-bos-program-visibility.mjs
 *
 * Walks the chain that /api/bos/programs uses to decide which programmes a user
 * sees in the Course-Scheme dropdown:
 *
 *   auth.users → profiles → staff(profile_id) → bos_members(staff_id, is_active)
 *     → bos_compositions(is_active) → board_id → bos_board_programmes(board_id, is_active)
 *
 * For each step, prints a row count + the rows themselves. The FIRST step that
 * reports 0 is the broken link.
 *
 * Usage:  node scripts/diagnose-bos-program-visibility.mjs <email>
 * Example: node scripts/diagnose-bos-program-visibility.mjs testuser@jkkn.ac.in
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// ── Load .env (avoid pulling in dotenv as a dep; tolerates Windows CRLF) ─────
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/diagnose-bos-program-visibility.mjs <email>');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const banner = (n, t) => console.log(`\n── Step ${n}: ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);
const fail = (msg) => { console.log(`\n❌ BROKEN LINK: ${msg}\n`); process.exit(0); };

// ── Step 1: locate user via auth.users (schema-direct, service role) ─────────
banner(1, 'auth.users (does the user exist?)');
let user = null;
const { data: authUsers, error: authErr } = await sb
  .schema('auth')
  .from('users')
  .select('id, email, last_sign_in_at')
  .ilike('email', email);
if (authErr) {
  console.log(`  ⚠ direct auth.users query failed: ${authErr.message}`);
} else if (authUsers && authUsers[0]) {
  user = authUsers[0];
  console.log(`  ✓ found via auth.users  id=${user.id}  last_sign_in=${user.last_sign_in_at ?? 'never'}`);
}
if (!user) {
  console.log('  → falling back to staff.email lookup');
  const { data: byStaff } = await sb
    .from('staff')
    .select('id, profile_id, email, first_name, last_name')
    .ilike('email', email);
  if (!byStaff || byStaff.length === 0) {
    fail(`no auth.users AND no staff record with email=${email}`);
  }
  const linked = byStaff.find((s) => s.profile_id);
  if (!linked) {
    console.log(`  ⚠ found ${byStaff.length} staff row(s) but NONE has profile_id set:`);
    byStaff.forEach((s) => console.log(`     staff.id=${s.id}  profile_id=NULL  name=${s.first_name} ${s.last_name}`));
    console.log(`\n  FIX: link staff to auth user via:`);
    console.log(`       UPDATE staff SET profile_id = (SELECT id FROM auth.users WHERE email = '${email}') WHERE id = '<one of the staff ids above>';`);
    fail('staff exists but profile_id is unlinked');
  }
  user = { id: linked.profile_id, email };
  console.log(`  ✓ resolved via staff.profile_id  id=${user.id}`);
}

// ── Step 2: profiles ─────────────────────────────────────────────────────────
banner(2, 'profiles (role + institution + super-admin flag)');
const { data: profile, error: profileErr } = await sb
  .from('profiles')
  .select('id, role, is_super_admin, institution_id, full_name')
  .eq('id', user.id)
  .maybeSingle();
if (profileErr) fail(`profiles query error: ${profileErr.message}`);
if (!profile) fail(`no profiles row for user.id=${user.id}`);
console.log(`  ✓ role=${profile.role}  is_super_admin=${profile.is_super_admin}  institution_id=${profile.institution_id}`);
console.log(`    name=${profile.full_name ?? ''}`);
if (profile.is_super_admin) console.log(`  ℹ super_admin → /api/bos/programs bypasses the filter entirely; dropdown should show ALL programmes.`);

// ── Step 3: staff (linked via profile_id — the canonical join) ──────────────
banner(3, 'staff (must have profile_id = user.id)');
const { data: staffRows } = await sb
  .from('staff')
  .select('id, profile_id, first_name, last_name, role_key, category_id, institution_id, is_active')
  .eq('profile_id', user.id);
if (!staffRows || staffRows.length === 0) {
  console.log(`  ❌ no staff row with profile_id=${user.id}`);
  // Diagnostic: maybe staff exists but profile_id wasn't backfilled
  const { data: byEmail } = await sb
    .from('staff')
    .select('id, profile_id, first_name, last_name, email')
    .eq('email', email);
  if (byEmail && byEmail.length > 0) {
    console.log(`  ⚠ but ${byEmail.length} staff row(s) match the email — profile_id is unlinked:`);
    byEmail.forEach((s) => console.log(`     staff.id=${s.id}  profile_id=${s.profile_id ?? 'NULL'}  name=${s.first_name} ${s.last_name}`));
    console.log(`\n  FIX:  UPDATE staff SET profile_id = '${user.id}' WHERE id = '<one of the ids above>';`);
  } else {
    console.log(`  ⚠ no staff row matches the email either — this user has no staff record.`);
  }
  fail(`step 3 (staff link)`);
}
staffRows.forEach((s) => console.log(`  ✓ staff.id=${s.id}  role_key=${s.role_key}  inst=${s.institution_id}`));

const staffIds = staffRows.map((s) => s.id);

// ── Step 4: bos_members ──────────────────────────────────────────────────────
banner(4, 'bos_members (rows pointing at this staff, any is_active)');
const { data: members } = await sb
  .from('bos_members')
  .select('id, composition_id, member_type, is_active, display_name, staff_id')
  .in('staff_id', staffIds);
if (!members || members.length === 0) {
  console.log(`  ❌ this user has NO bos_members rows on ANY composition.`);
  console.log(`  FIX:  add the user as a member to the relevant bos_compositions via the BoS Compositions UI.`);
  fail('step 4 (bos_members)');
}
const activeMembers = members.filter((m) => m.is_active);
console.log(`  total=${members.length}  active=${activeMembers.length}`);
members.forEach((m) =>
  console.log(`    ${m.is_active ? '✓' : '✗'} member_id=${m.id}  comp=${m.composition_id}  type=${m.member_type}  name="${m.display_name}"`),
);
if (activeMembers.length === 0) fail('all bos_members rows have is_active=false');

// ── Step 5: bos_compositions ─────────────────────────────────────────────────
banner(5, 'bos_compositions (membership comps that are themselves is_active)');
const { data: comps } = await sb
  .from('bos_compositions')
  .select('id, board_id, institutions_id, composition_title, is_active, term_start_date, term_end_date')
  .in('id', activeMembers.map((m) => m.composition_id));
if (!comps || comps.length === 0) fail('no bos_compositions rows for the user\'s member rows');
const activeComps = comps.filter((c) => c.is_active);
console.log(`  total=${comps.length}  active=${activeComps.length}`);
comps.forEach((c) =>
  console.log(`    ${c.is_active ? '✓' : '✗'} comp=${c.id}  board=${c.board_id}  inst=${c.institutions_id}  title="${c.composition_title}"  ${c.term_start_date}→${c.term_end_date}`),
);
if (activeComps.length === 0) fail('all matching compositions have is_active=false');

const boardIds = [...new Set(activeComps.map((c) => c.board_id).filter(Boolean))];
if (boardIds.length === 0) fail('active compositions exist but none has a board_id set');
console.log(`  → boardsOf set = [${boardIds.join(', ')}]`);

// ── Step 6: bos_board_programmes ─────────────────────────────────────────────
banner(6, 'bos_board_programmes (the dropdown source-of-truth)');
const { data: bps } = await sb
  .from('bos_board_programmes')
  .select('id, board_id, programme_code, programme_name, institutions_id, is_active')
  .in('board_id', boardIds);
if (!bps || bps.length === 0) {
  console.log('  ❌ none of the user\'s boards has ANY bos_board_programmes rows.');
  console.log('  FIX:  add programmes to the board via the BoS Boards UI (or POST /api/bos/boards/[id]/programmes).');
  fail('step 6 (bos_board_programmes)');
}
const activeBps = bps.filter((b) => b.is_active);
console.log(`  total=${bps.length}  active=${activeBps.length}`);
bps.forEach((b) =>
  console.log(`    ${b.is_active ? '✓' : '✗'} ${b.programme_code.padEnd(8)} ${b.programme_name?.padEnd(40) ?? ''} board=${b.board_id}  inst=${b.institutions_id ?? 'NULL'}`),
);
if (activeBps.length === 0) fail('all bos_board_programmes rows are inactive');

console.log('\n✅ All six steps passed — this user SHOULD see the following programmes in the dropdown:');
console.log('   ' + activeBps.map((b) => b.programme_code).join(', '));
console.log('\nIf the UI still shows none, the bug is on the API side (not data).');
