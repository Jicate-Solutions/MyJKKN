#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * scripts/sync-backfill-password.ts
 *
 * Sets the backfill admin account's auth password to EXACTLY the value of
 * JKKN_BACKFILL_ADMIN_PASSWORD in the env file, then verifies by signing in
 * with it. Exists because the first apply attempt failed with "Invalid login
 * credentials": the password typed into set-auth-password.ts and the one in
 * .env did not match. Reading BOTH from the same file, with the same
 * --env-file parser, makes a mismatch impossible by construction.
 *
 * Never prints the password; prints only its length and the outcome.
 *
 * Usage: npx tsx --env-file=.env scripts/sync-backfill-password.ts
 */

import { createClient } from '@supabase/supabase-js';
import { env, exit } from 'node:process';

async function main(): Promise<void> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = env.JKKN_BACKFILL_ADMIN_EMAIL;
  const password = env.JKKN_BACKFILL_ADMIN_PASSWORD;

  if (!url || !serviceKey || !anonKey || !email || !password) {
    console.error('✗ need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, JKKN_BACKFILL_ADMIN_EMAIL and JKKN_BACKFILL_ADMIN_PASSWORD (pass --env-file=.env).');
    exit(1);
  }
  if (password.length < 8) {
    console.error(`✗ JKKN_BACKFILL_ADMIN_PASSWORD is only ${password.length} characters — likely truncated in .env (an unquoted # starts a comment). Wrap the value in double quotes or choose one without #.`);
    exit(1);
  }

  console.log(`account: ${email}`);
  console.log(`password from .env: ${password.length} characters (value not shown)`);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // By id, not by listing: GoTrue's listUsers is paginated (50/page in this
  // project's experience) and an email can hide past any page size.
  const userId = env.JKKN_BACKFILL_ADMIN_USER_ID ?? '7f6836fd-24b5-477b-8892-a04a77552700';
  const { data: found, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !found?.user) {
    console.error(`✗ could not load auth user ${userId}: ${getErr?.message ?? 'not found'}`);
    exit(1);
  }
  if ((found.user.email ?? '').toLowerCase() !== email.toLowerCase()) {
    console.error(`✗ auth user ${userId} is ${found.user.email}, not ${email} — refusing to set a password on the wrong account.`);
    exit(1);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (updErr) {
    console.error(`✗ password update failed: ${updErr.message}`);
    exit(1);
  }
  console.log('✓ account password set to the .env value');

  // Prove the backfill's own sign-in path works before anyone re-runs it.
  const session = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await session.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.user) {
    console.error(`✗ verification sign-in STILL fails: ${signInErr?.message ?? 'no session'}`);
    exit(1);
  }
  await session.auth.signOut();
  console.log(`✓ verification sign-in succeeded — issued_by will be ${signIn.user.id}`);
  console.log('  The backfill --apply can now run.');
}

main().catch((err) => {
  console.error('✗ fatal:', err);
  exit(1);
});
