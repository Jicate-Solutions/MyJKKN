// scripts/generate-test-student-form-url.ts
//
// Generates a fresh HMAC-signed student-form token for a learner profile
// and inserts the matching row in learner_self_fill_tokens. Prints ONLY
// the resulting URL to stdout so it can be piped or copy-pasted.
//
// Mirrors StudentFormService.generateToken (lib/services/admission/
// student-form-service.ts) but skips the auth/permission gates the API
// route enforces — this script is for local manual QA only.
//
// Usage:
//   npx tsx scripts/generate-test-student-form-url.ts [learner_profile_id]
//
// If learner_profile_id is omitted, picks the most-recently-created
// admitted learner whose is_profile_complete is false/null.

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import crypto from 'node:crypto';

function gitRoot(): string {
  try {
    // execFileSync with fixed args — no shell, no injection surface.
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

const root = gitRoot();
dotenvConfig({ path: resolve(root, '.env.local') });
dotenvConfig({ path: resolve(root, '.env') });

import { createClient } from '@supabase/supabase-js';
import { signToken, hashRawToken } from '../lib/services/admission/student-form-hmac';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
  }

  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let learnerId = process.argv[2];

  if (!learnerId) {
    const { data, error } = await svc
      .from('learners_profiles')
      .select('id, first_name, last_name')
      .eq('lifecycle_status', 'admitted')
      .or('is_profile_complete.is.null,is_profile_complete.eq.false')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      console.error('No candidate learner found:', error?.message ?? 'no rows');
      process.exit(1);
    }
    learnerId = data.id;
    console.error(`[info] picked learner: ${data.first_name} ${data.last_name} (${learnerId})`);
  }

  const { data: learner, error: lErr } = await svc
    .from('learners_profiles')
    .select('id, is_profile_complete, first_name, last_name')
    .eq('id', learnerId)
    .maybeSingle();
  if (lErr || !learner) {
    console.error('Learner not found:', lErr?.message ?? 'no row');
    process.exit(1);
  }
  if (learner.is_profile_complete) {
    console.error(`Learner ${learnerId} has already submitted (is_profile_complete=true).`);
    process.exit(1);
  }

  await svc
    .from('learner_self_fill_tokens')
    .update({ status: 'superseded' })
    .eq('learner_profile_id', learnerId)
    .eq('status', 'active');

  const TTL_SECONDS = 30 * 60;
  const tokenId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const rawToken = signToken({ tid: tokenId, iat: now, exp: now + TTL_SECONDS });
  const tokenHash = hashRawToken(rawToken);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  const { error: insErr } = await svc
    .from('learner_self_fill_tokens')
    .insert({
      id: tokenId,
      learner_profile_id: learnerId,
      token_hash: tokenHash,
      status: 'active',
      expires_at: expiresAt.toISOString(),
      generated_by: null,
    });
  if (insErr) {
    console.error('Token insert failed:', insErr.message);
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/student-form/${encodeURIComponent(rawToken)}`;

  console.error(`[info] expires at: ${expiresAt.toISOString()} (~30 min from now)`);
  console.error(`[info] token id:   ${tokenId}`);
  console.log(url);
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
