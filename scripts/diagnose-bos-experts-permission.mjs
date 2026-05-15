#!/usr/bin/env node
/**
 * Diagnose why /bos/experts renders blank for testuser@jkkn.ac.in.
 * The page is gated by PermissionGuard module='academic.bos-experts' action='view'.
 * That check hits user_has_permission() RPC which reads custom_roles.permissions JSONB.
 *
 * This script checks both layers:
 *  1. RPC: user_has_permission('academic.bos-experts.view') for this user
 *  2. Raw: which BOS keys exist on the HOD custom_role
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

const TARGET_USER = 'd43cefe1-0765-44ff-9446-aea79487aff5';   // testuser@jkkn.ac.in
const ROLES_TO_CHECK = ['hod', 'facilitator', 'principal'];

// ── 1. Pull all three custom_roles rows in one shot ─────────────────────────
console.log('── 1. custom_roles rows ──────────────────────────────────────────');
const { data: roles, error: rolesErr } = await sb
  .from('custom_roles')
  .select('id, role_key, role_name, permissions, is_active')
  .in('role_key', ROLES_TO_CHECK);
if (rolesErr) { console.error(rolesErr); process.exit(1); }
console.table(roles?.map((r) => ({ role_key: r.role_key, name: r.role_name, is_active: r.is_active, perm_count: Object.keys(r.permissions || {}).length })));

// ── 2. For each role, show which bos-experts keys exist ─────────────────────
console.log('\n── 2. bos-experts permission keys per role ──────────────────────');
const EXPERT_KEYS_EXPECTED = ['view', 'create', 'edit', 'delete'];
const summary = [];
for (const role of roles ?? []) {
  const perms = role.permissions || {};
  const expertKeys = Object.keys(perms).filter((k) => k.startsWith('academic.bos-experts')).sort();
  const row = { role_key: role.role_key };
  for (const act of EXPERT_KEYS_EXPECTED) {
    const dot = `academic.bos-experts.${act}`;
    const under = `academic.bos-experts_${act}`;
    row[act] = perms[dot] === true ? 'dot' : perms[under] === true ? 'underscore' : '—';
  }
  summary.push(row);
  if (expertKeys.length === 0) {
    console.log(`  ❌ ${role.role_key}: ZERO bos-experts keys (page will be blank for users in this role)`);
  } else {
    console.log(`  ${role.role_key}: ${expertKeys.length} key(s) → ${expertKeys.join(', ')}`);
  }
}
console.log('\n── 3. Summary matrix (— = missing) ──────────────────────────────');
console.table(summary);

// ── 4. testuser (HOD) specifically: which BOS module keys exist? ────────────
console.log('\n── 4. ALL bos-* keys on HOD (to spot under_score vs .dot mix) ───');
const hod = roles?.find((r) => r.role_key === 'hod');
if (hod) {
  const all = Object.keys(hod.permissions || {}).filter((k) => k.startsWith('academic.bos-')).sort();
  for (const k of all) console.log(`    ${hod.permissions[k] === true ? '✓' : '✗'}  ${k}`);
} else {
  console.log('  ❌ no hod row');
}

// ── 5. user_roles linkage ──────────────────────────────────────────────────
console.log('\n── 5. user_roles linkage for testuser ────────────────────────────');
const { data: userRoles } = await sb
  .from('user_roles')
  .select('user_id, role_id, role:custom_roles(role_key, role_name)')
  .eq('user_id', TARGET_USER);
console.log(`  rows=${userRoles?.length ?? 0}`);
console.table(userRoles);
