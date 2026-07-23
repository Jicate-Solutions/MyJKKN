#!/usr/bin/env node
/**
 * Read-only diagnostic for the "HOD sees blank /bos/compositions page" bug.
 *
 * Reports:
 *   1. Current permission keys on the 'hod', 'principal', and 'facilitator'
 *      custom_roles rows — specifically which academic.bos-compositions.* and
 *      academic.bos-syllabus.* keys are present and set to true.
 *   2. For each HOD user (profiles.role = 'hod'): which custom_roles row(s)
 *      their user_roles entries link to, and whether any of those roles
 *      actually carries academic.bos-compositions.view = true. This catches
 *      the "data drift" case the use-permissions.ts:114-144 safety net was
 *      written to handle.
 *
 * Exits 0 if all expected keys are present for HOD; exits 1 if any are missing.
 * No writes — safe to run against production.
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

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const EXPECTED_HOD_KEYS = [
  'academic.bos-compositions.view',
  'academic.bos-compositions.create',
  'academic.bos-compositions.edit',
  'academic.bos-syllabus.view',
  'academic.bos-syllabus.create',
  'academic.bos-syllabus.edit',
  'academic.bos-courses.view',
  'academic.bos-meetings.view',
  'academic.bos-meetings.create',
  'academic.bos-meetings.edit',
  'academic.bos-taxonomy.view',
];

const SHOULD_NOT_HAVE = [
  'academic.bos-syllabus.delete',      // revoked by 20260514c
  'academic.bos-compositions.delete',  // revoked by 20260514c
];

function bosKeysOf(permsObj) {
  if (!permsObj || typeof permsObj !== 'object') return [];
  return Object.entries(permsObj)
    .filter(([k, v]) => k.startsWith('academic.bos') && v === true)
    .map(([k]) => k)
    .sort();
}

let exitCode = 0;

console.log('── 1. custom_roles snapshot ─────────────────────────────────────────');
const { data: roles, error: rolesErr } = await sb
  .from('custom_roles')
  .select('id, role_key, role_name, is_active, permissions')
  .in('role_key', ['hod', 'principal', 'facilitator']);

if (rolesErr) {
  console.error('  ERROR:', rolesErr.message);
  process.exit(2);
}

for (const role of roles ?? []) {
  console.log(`\n  Role: ${role.role_key} (${role.role_name}) [${role.is_active ? 'active' : 'INACTIVE'}]`);
  console.log(`  id: ${role.id}`);
  const keys = bosKeysOf(role.permissions);
  console.log(`  academic.bos-* keys (= true): ${keys.length}`);
  for (const k of keys) console.log(`    ✓ ${k}`);
}

console.log('\n── 2. HOD expected-key audit ────────────────────────────────────────');
const hod = (roles ?? []).find((r) => r.role_key === 'hod');
if (!hod) {
  console.log('  ✗ FATAL: no custom_role with role_key=\'hod\' exists.');
  exitCode = 1;
} else {
  for (const key of EXPECTED_HOD_KEYS) {
    const has = hod.permissions?.[key] === true;
    console.log(`  ${has ? '✓' : '✗ MISSING'} ${key}`);
    if (!has) exitCode = 1;
  }
  console.log('  ─── should NOT be present ───');
  for (const key of SHOULD_NOT_HAVE) {
    const has = hod.permissions?.[key] === true;
    console.log(`  ${has ? '✗ STILL PRESENT' : '✓ revoked'} ${key}`);
    if (has) exitCode = 1;
  }
}

console.log('\n── 3. HOD users and their user_roles linkage ────────────────────────');
const { data: hodProfiles } = await sb
  .from('profiles')
  .select('id, email, full_name, role, is_active')
  .eq('role', 'hod')
  .eq('is_active', true)
  .limit(20);

console.log(`  Found ${hodProfiles?.length ?? 0} active HOD profile(s) (showing up to 20)`);

for (const p of hodProfiles ?? []) {
  console.log(`\n  ─ ${p.email} (${p.full_name ?? '?'}) — profile.id=${p.id}`);
  const { data: urLinks } = await sb
    .from('user_roles')
    .select('role_id, is_primary, custom_roles!inner(id, role_key, role_name, permissions)')
    .eq('user_id', p.id);

  if (!urLinks || urLinks.length === 0) {
    console.log('    ✗ NO user_roles rows — relies on use-permissions.ts safety net.');
    continue;
  }
  for (const link of urLinks) {
    const cr = link.custom_roles;
    const hasView = cr.permissions?.['academic.bos-compositions.view'] === true;
    const hasCreate = cr.permissions?.['academic.bos-compositions.create'] === true;
    const flags = [
      link.is_primary ? 'PRIMARY' : 'secondary',
      hasView ? 'view ✓' : 'view ✗',
      hasCreate ? 'create ✓' : 'create ✗',
    ].join(' | ');
    console.log(`    • role_key=${cr.role_key.padEnd(15)} ${flags}`);
  }
}

console.log('\n── Summary ──────────────────────────────────────────────────────────');
if (exitCode === 0) {
  console.log('  ✓ HOD role has all expected academic.bos-compositions keys.');
  console.log('    If the page is still blank, the issue is the user_roles linkage');
  console.log('    (section 3 above) — check which custom_role each HOD user points to.');
} else {
  console.log('  ✗ HOD role is missing one or more expected keys.');
  console.log('    Apply supabase/migrations/20260515_ensure_hod_compositions_perms.sql');
  console.log('    (and 20260514c, 20260514d if not yet applied) and re-run.');
}

process.exit(exitCode);
