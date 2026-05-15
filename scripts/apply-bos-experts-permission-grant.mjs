#!/usr/bin/env node
/**
 * Applies 20260514e_grant_bos_experts_dotformat_to_roles.sql against the dev DB
 * using service-role credentials. One-shot; idempotent. Use only because no
 * Supabase CLI is installed locally.
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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// HOD ────────────────────────────────────────────────────────────────────────
const { data: hodBefore } = await sb.from('custom_roles').select('permissions').eq('role_key', 'hod').single();
const hodNew = {
  ...hodBefore.permissions,
  'academic.bos-experts.view': true,
  'academic.bos-experts.create': true,
  'academic.bos-experts.edit': true,
  'academic.bos-experts.delete': true,
};
const { error: hodErr } = await sb.from('custom_roles').update({ permissions: hodNew, updated_at: new Date().toISOString() }).eq('role_key', 'hod');
console.log(hodErr ? `❌ HOD update failed: ${hodErr.message}` : '✓ HOD: added dot-format view/create/edit/delete');

// Principal ─────────────────────────────────────────────────────────────────
const { data: prinBefore } = await sb.from('custom_roles').select('permissions').eq('role_key', 'principal').single();
const prinNew = { ...prinBefore.permissions };
delete prinNew['academic.bos-experts']; // orphan
prinNew['academic.bos-experts.view'] = true;
prinNew['academic.bos-experts.edit'] = true;
const { error: prinErr } = await sb.from('custom_roles').update({ permissions: prinNew, updated_at: new Date().toISOString() }).eq('role_key', 'principal');
console.log(prinErr ? `❌ Principal update failed: ${prinErr.message}` : '✓ Principal: added dot-format view/edit, stripped orphan bare-module key');

// Facilitator ───────────────────────────────────────────────────────────────
const { data: facBefore } = await sb.from('custom_roles').select('permissions').eq('role_key', 'facilitator').single();
const facNew = { ...facBefore.permissions, 'academic.bos-experts.view': true };
const { error: facErr } = await sb.from('custom_roles').update({ permissions: facNew, updated_at: new Date().toISOString() }).eq('role_key', 'facilitator');
console.log(facErr ? `❌ Facilitator update failed: ${facErr.message}` : '✓ Facilitator: confirmed view (idempotent)');

// Verify ────────────────────────────────────────────────────────────────────
const { data: verify } = await sb.from('custom_roles').select('role_key, permissions').in('role_key', ['hod', 'principal', 'facilitator']);
console.log('\n── Verification ─────────────────────────────────────');
for (const r of verify) {
  const dot = ['view', 'create', 'edit', 'delete'].map((a) => `${a}=${r.permissions[`academic.bos-experts.${a}`] === true ? '✓' : '—'}`).join('  ');
  console.log(`  ${r.role_key.padEnd(12)} ${dot}`);
}
