#!/usr/bin/env node
/**
 * Applies 20260723120000_drop_bos_experts_category_check.sql via the Supabase
 * Management API. Same pattern as scripts/apply-bos-member-type-catalog-migration.mjs.
 *
 * The migration drops bos_external_experts_category_check so category is no
 * longer limited to the static 5-value enum at the DB layer.
 *
 * Safe to re-run: DROP CONSTRAINT IF EXISTS.
 *
 * Usage:
 *   node scripts/apply-bos-experts-category-check-drop.mjs
 */
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

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken || !supabaseUrl) {
  console.error('✗ SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}
const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!projectRef) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}
console.log(`Project: ${projectRef}\n`);

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
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

const sql = readFileSync(
  'supabase/migrations/20260723120000_drop_bos_experts_category_check.sql',
  'utf8',
);

console.log('Applying 20260723120000_drop_bos_experts_category_check.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const cons = await runSql(`
  SELECT conname FROM pg_constraint
  WHERE conrelid = 'public.bos_external_experts'::regclass AND contype = 'c';
`);
console.log('Remaining CHECK constraints on bos_external_experts:');
if (cons.length === 0) console.log('  (none)');
for (const c of cons) console.log(`  - ${c.conname}`);
const gone = !cons.some((c) => c.conname === 'bos_external_experts_category_check');
console.log(gone ? '✓ category CHECK removed' : '✗ category CHECK STILL PRESENT');
