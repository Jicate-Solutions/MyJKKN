#!/usr/bin/env node
/**
 * Apply the pending BOS permission migrations via the Supabase Management API.
 * Uses SUPABASE_ACCESS_TOKEN from .env — the same path the original
 * 20260511_rename_bos_syllabi_permissions_to_syllabus.sql migration was
 * applied with (per its header comment).
 *
 * Migrations applied (in order):
 *   1. 20260511_rename_bos_syllabi_permissions_to_syllabus.sql
 *   2. 20260512_grant_bos_compositions_dotformat_to_roles.sql
 *   3. 20260512_grant_bos_taxonomy_edit_to_roles.sql
 *   4. 20260514c_revoke_hod_overgranted_bos_permissions.sql
 *   5. 20260514d_grant_facilitator_compositions_meetings_edit.sql
 *   6. 20260515_ensure_hod_compositions_perms.sql
 *
 * Each migration is wrapped in BEGIN/COMMIT internally so they apply atomically.
 * Safe to re-run — all operations use jsonb || (merge) or '-' (idempotent delete).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken) {
  console.error('✗ SUPABASE_ACCESS_TOKEN missing from .env');
  process.exit(2);
}
if (!supabaseUrl) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}

// Extract project ref from https://<ref>.supabase.co
const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!match) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}
const projectRef = match[1];
console.log(`Project: ${projectRef}`);

const MIGRATIONS = [
  '20260511_rename_bos_syllabi_permissions_to_syllabus.sql',
  '20260512_grant_bos_compositions_dotformat_to_roles.sql',
  '20260512_grant_bos_taxonomy_edit_to_roles.sql',
  '20260514c_revoke_hod_overgranted_bos_permissions.sql',
  '20260514d_grant_facilitator_compositions_meetings_edit.sql',
  '20260515_ensure_hod_compositions_perms.sql',
];

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

let appliedCount = 0;
let failedCount = 0;

for (const file of MIGRATIONS) {
  const path = resolve('supabase/migrations', file);
  let sql;
  try {
    sql = readFileSync(path, 'utf8');
  } catch (err) {
    console.log(`\n✗ ${file} — could not read: ${err.message}`);
    failedCount++;
    continue;
  }

  console.log(`\n▸ Applying ${file} (${sql.length} bytes)`);
  try {
    await runSql(sql);
    console.log(`  ✓ applied`);
    appliedCount++;
  } catch (err) {
    console.log(`  ✗ FAILED: ${err.message}`);
    failedCount++;
  }
}

console.log(`\n── Summary ──────────────────────────────────────────────────────────`);
console.log(`  Applied: ${appliedCount}/${MIGRATIONS.length}`);
console.log(`  Failed:  ${failedCount}/${MIGRATIONS.length}`);

if (failedCount === 0) {
  console.log(`\n  Next: run scripts/diagnose-hod-bos-permissions.mjs to verify.`);
  process.exit(0);
} else {
  console.log(`\n  Review failures above. Re-run is safe (all migrations are idempotent).`);
  process.exit(1);
}
