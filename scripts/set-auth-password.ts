#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * scripts/set-auth-password.ts
 *
 * Sets (or replaces) the password on ONE auth account via the GoTrue admin
 * API. Built 2026-08-27 so a Google-OAuth-only super admin can add a password
 * provider — the JKKN ID backfill's --apply signs in with signInWithPassword,
 * which is impossible for an account that has no password at all.
 *
 * Adding a password does NOT remove Google sign-in: providers stack, and the
 * account keeps working in the browser exactly as before.
 *
 * Deliberately reads everything from env vars so the password is typed in the
 * operator's own terminal and never appears in a file, an argument list
 * (visible in process listings), or an assistant conversation.
 *
 * Usage (PowerShell):
 *   $env:TARGET_USER_ID = '<auth.users.id uuid>'
 *   $env:NEW_PASSWORD   = '<the new password>'
 *   npx tsx --env-file=.env scripts/set-auth-password.ts
 *   Remove-Item Env:NEW_PASSWORD
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (from .env).
 */

import { createClient } from '@supabase/supabase-js';
import { env, exit } from 'node:process';

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const userId = env.TARGET_USER_ID;
const password = env.NEW_PASSWORD;

if (!url || !serviceKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (pass --env-file=.env).');
  exit(1);
}
if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
  console.error('✗ Set TARGET_USER_ID to the auth.users.id uuid of the account.');
  exit(1);
}
if (!password || password.length < 8) {
  console.error('✗ Set NEW_PASSWORD (at least 8 characters). It is read from the environment, never from argv.');
  exit(1);
}

// No top-level await: the repo's scripts transform as CJS (same reason
// backfill-jkkn-ids.ts wraps everything in main()).
async function main(): Promise<void> {
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  const { data, error } = await admin.auth.admin.updateUserById(userId!, { password: password! });

  if (error) {
    console.error(`✗ update failed: ${error.message}`);
    exit(1);
  }

  console.log(`✓ password set for ${data.user?.email ?? userId}. Google sign-in is unaffected.`);
  console.log('  Now put the same password in .env as JKKN_BACKFILL_ADMIN_PASSWORD (and the email as JKKN_BACKFILL_ADMIN_EMAIL).');
}

main().catch((err) => {
  console.error('✗ fatal:', err);
  exit(1);
});
