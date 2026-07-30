#!/usr/bin/env node
/**
 * Applies 20260725_bos_board_senders_smtp_creds.sql via the Supabase Management API.
 * Same pattern as scripts/apply-bos-governing-body.mjs.
 *
 * Adds nullable per-board SMTP credential columns to bos_board_senders
 * (smtp_host/port/secure/user/password_encrypted) for Model 3 — a board can
 * authenticate as its own mailbox instead of the shared institution account.
 *
 * Safe to re-run: all ADD COLUMN IF NOT EXISTS + COMMENT statements are idempotent.
 *
 * Usage:
 *   node scripts/apply-bos-board-senders-smtp-creds.mjs
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
  'supabase/migrations/20260725_bos_board_senders_smtp_creds.sql',
  'utf8',
);

console.log('Applying 20260725_bos_board_senders_smtp_creds.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const cols = await runSql(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'bos_board_senders'
    AND column_name IN ('smtp_host','smtp_port','smtp_secure','smtp_user','smtp_password_encrypted')
  ORDER BY column_name;
`);
const found = new Set(cols.map((c) => c.column_name));
for (const c of ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password_encrypted']) {
  console.log(found.has(c) ? `✓ bos_board_senders.${c} present` : `✗ ${c} MISSING`);
}
