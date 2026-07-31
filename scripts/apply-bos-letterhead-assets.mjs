#!/usr/bin/env node
/**
 * Applies 20260729120000_bos_letterhead_assets.sql via the Supabase Management API.
 * Same pattern as scripts/apply-bos-board-senders-smtp-creds.mjs.
 *
 * Creates bos_letterhead_assets — per-institution seal + principal signature
 * (base64 data URIs) stamped on BoS call-letter PDFs, editable from
 * /bos/email-settings instead of being hardcoded file paths.
 *
 * Safe to re-run: CREATE TABLE / INDEX IF NOT EXISTS + DROP-then-CREATE POLICY.
 *
 * Usage:
 *   node scripts/apply-bos-letterhead-assets.mjs
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
  'supabase/migrations/20260729120000_bos_letterhead_assets.sql',
  'utf8',
);

console.log('Applying 20260729120000_bos_letterhead_assets.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const cols = await runSql(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'bos_letterhead_assets'
  ORDER BY column_name;
`);
const found = new Set(cols.map((c) => c.column_name));
for (const c of ['id', 'institutions_id', 'seal_image', 'signature_image', 'is_active']) {
  console.log(found.has(c) ? `✓ bos_letterhead_assets.${c} present` : `✗ ${c} MISSING`);
}

const policies = await runSql(`
  SELECT policyname FROM pg_policies
  WHERE tablename = 'bos_letterhead_assets'
  ORDER BY policyname;
`);
console.log(`✓ policies: ${policies.map((p) => p.policyname).join(', ') || '(none)'}`);
