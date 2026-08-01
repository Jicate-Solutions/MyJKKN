#!/usr/bin/env node
/**
 * Applies supabase/migrations/20260801130000_coe_role_bos_courses_scheme_grants.sql
 * via the service-role client (Supabase MCP cannot reach this project).
 *
 * Merges five BoS keys into custom_roles.permissions for role_key='coe':
 *   academic.bos-courses.view / .create / .edit / .import
 *   academic.bos-scheme.edit
 *
 * Read-modify-write on the JSONB column — equivalent to the `||` merge in the
 * migration and equally idempotent. Dry-run by default; pass --apply to write.
 *
 *   node scripts/apply-coe-bos-courses-scheme-grants.mjs           # preview
 *   node scripts/apply-coe-bos-courses-scheme-grants.mjs --apply   # write
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

const APPLY = process.argv.includes('--apply');
const NEW_KEYS = [
  'academic.bos-courses.view',
  'academic.bos-courses.create',
  'academic.bos-courses.edit',
  'academic.bos-courses.import',
  'academic.bos-scheme.edit',
];

const { data: role, error } = await sb
  .from('custom_roles')
  .select('id, role_key, role_name, permissions')
  .eq('role_key', 'coe')
  .single();

if (error) {
  console.error('Failed to load the coe role:', error.message);
  process.exit(2);
}

console.log(`Role: ${role.role_key} — ${role.role_name} (${role.id})`);
const before = role.permissions ?? {};
const missing = NEW_KEYS.filter((k) => before[k] !== true);
console.log(`\nAlready granted: ${NEW_KEYS.filter((k) => before[k] === true).join(', ') || '(none)'}`);
console.log(`To grant:        ${missing.join(', ') || '(none — already up to date)'}`);

if (missing.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to write.');
  process.exit(0);
}

const next = { ...before };
for (const k of NEW_KEYS) next[k] = true;

const { error: upErr } = await sb
  .from('custom_roles')
  .update({ permissions: next, updated_at: new Date().toISOString() })
  .eq('id', role.id);

if (upErr) {
  console.error('\nUpdate failed:', upErr.message);
  process.exit(2);
}

const { data: after } = await sb
  .from('custom_roles')
  .select('permissions')
  .eq('id', role.id)
  .single();

console.log('\nApplied. academic.bos-* keys now on the coe role:');
for (const [k, v] of Object.entries(after?.permissions ?? {})) {
  if (k.startsWith('academic.bos') && v === true) console.log(`  ✓ ${k}`);
}
