/**
 * Create / re-sync two derived roles that inherit ALL permissions from a source role:
 *
 *   school_principal  ("School Principal")  ← principal
 *   school_faculty    ("School Facilitator") ← faculty
 *
 * Permissions live in custom_roles.permissions (JSONB), so we copy from the LIVE
 * source row (permissions + institution_scope + module_scopes) — not from a static
 * migration — so the derived role matches whatever the source currently grants.
 *
 * Idempotent: re-running upserts on role_key and re-syncs parity.
 *
 * Usage:
 *   node scripts/create-school-derived-roles.mjs            # apply + verify
 *   node scripts/create-school-derived-roles.mjs --dry-run  # report only, no writes
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// --- Load .env manually (no dotenv dependency) ------------------------------
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

const DRY_RUN = process.argv.includes('--dry-run');

const COPIES = [
  {
    source: 'principal',
    target: 'school_principal',
    name: 'School Principal',
    description: 'School-level institution head. Inherits all permissions from the Principal role.',
  },
  {
    source: 'faculty',
    target: 'school_faculty',
    name: 'School Facilitator',
    description: 'School-level facilitator. Inherits all permissions from the Faculty role.',
  },
];

// Count only the keys that actually grant access (value === true), the way the
// permission hooks read them.
const grantedKeys = (perms) =>
  Object.entries(perms || {}).filter(([, v]) => v === true).map(([k]) => k).sort();

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function fetchRole(role_key) {
  const { data, error } = await sb
    .from('custom_roles')
    .select('id, role_key, role_name, permissions, institution_scope, module_scopes, is_system_role, is_active')
    .eq('role_key', role_key)
    .maybeSingle();
  if (error) throw new Error(`fetch ${role_key}: ${error.message}`);
  return data;
}

let failed = false;

for (const c of COPIES) {
  console.log(`\n=== ${c.target}  ←  ${c.source} ===`);

  const src = await fetchRole(c.source);
  if (!src) {
    console.error(`  ✗ source role '${c.source}' not found — skipping`);
    failed = true;
    continue;
  }

  const srcGranted = grantedKeys(src.permissions);
  console.log(`  source: ${srcGranted.length} granted permission key(s), scope='${src.institution_scope}'`);

  if (DRY_RUN) {
    const existing = await fetchRole(c.target);
    console.log(existing ? `  (dry-run) target exists — would re-sync` : `  (dry-run) target missing — would create`);
    continue;
  }

  const existing = await fetchRole(c.target);

  const payload = {
    role_key: c.target,
    role_name: c.name,
    description: c.description,
    is_system_role: src.is_system_role,
    is_active: src.is_active,
    institution_scope: src.institution_scope,
    permissions: src.permissions,
    module_scopes: src.module_scopes ?? {},
  };

  let writeErr;
  if (existing) {
    // Preserve the existing name/description if an admin already customised them;
    // only re-sync the access-bearing columns.
    ({ error: writeErr } = await sb
      .from('custom_roles')
      .update({
        permissions: payload.permissions,
        institution_scope: payload.institution_scope,
        module_scopes: payload.module_scopes,
        is_active: payload.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('role_key', c.target));
    console.log('  updated existing role');
  } else {
    ({ error: writeErr } = await sb.from('custom_roles').insert(payload));
    console.log('  created new role');
  }
  if (writeErr) {
    console.error(`  ✗ write failed: ${writeErr.message}`);
    failed = true;
    continue;
  }

  // --- Verify parity --------------------------------------------------------
  const tgt = await fetchRole(c.target);
  const tgtGranted = grantedKeys(tgt.permissions);

  const permsMatch = sameJson(tgt.permissions, src.permissions);
  const scopeMatch = tgt.institution_scope === src.institution_scope;
  const moduleMatch = sameJson(tgt.module_scopes ?? {}, src.module_scopes ?? {});

  if (permsMatch && scopeMatch && moduleMatch) {
    console.log(`  ✓ PARITY OK — ${tgtGranted.length} granted key(s), scope='${tgt.institution_scope}'`);
  } else {
    failed = true;
    console.error('  ✗ PARITY MISMATCH');
    if (!permsMatch) {
      const missing = srcGranted.filter((k) => !tgtGranted.includes(k));
      const extra = tgtGranted.filter((k) => !srcGranted.includes(k));
      if (missing.length) console.error(`     missing from target: ${missing.join(', ')}`);
      if (extra.length) console.error(`     extra on target:      ${extra.join(', ')}`);
    }
    if (!scopeMatch) console.error(`     institution_scope: target='${tgt.institution_scope}' source='${src.institution_scope}'`);
    if (!moduleMatch) console.error(`     module_scopes differ`);
  }
}

console.log(`\n${failed ? '✗ Completed WITH errors' : '✓ All roles created and verified at parity'}`);
process.exit(failed ? 1 : 0);
