/**
 * Cleanup MathWorks LTI Test Accounts
 *
 * Soft-bans the two LTI test accounts (preserves audit trail in lti_launches / lti_grades
 * per your compliance policy — we do NOT hard-delete).
 *
 *   lti.student@jkkn.ac.in
 *   lti.faculty@jkkn.ac.in
 *
 * Effects:
 *   1. Sets auth.users.banned_until = 100 years in future (effectively revokes all sessions)
 *   2. Marks profiles.is_active = false
 *   3. Rotates password to a random 40-char string (makes old password unusable)
 *
 * Leaves intact:
 *   - lti_launches rows (audit trail)
 *   - lti_grades rows (grade passback history)
 *   - learners_profiles row (for LTI launch context lookup if someone queries history)
 *
 * Run:
 *   source .env.local
 *   npx tsx scripts/cleanup-lti-test-accounts.ts
 *
 * To fully re-enable these accounts later, re-run create-lti-test-accounts.ts —
 * it will auto-unban, rotate the password, and restore is_active.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TARGET_EMAILS = ['lti.student@jkkn.ac.in', 'lti.faculty@jkkn.ac.in'];

async function main() {
  console.log('\n🧹 Cleaning up LTI test accounts...\n');

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const targets = list?.users.filter((u) => TARGET_EMAILS.includes(u.email ?? '')) ?? [];

  if (targets.length === 0) {
    console.log('  (no target accounts found — nothing to clean up)\n');
    return;
  }

  for (const user of targets) {
    console.log(`▶ ${user.email}`);

    const randomPassword = randomBytes(20).toString('hex'); // 40 chars

    const { error: authErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: randomPassword,
      ban_duration: '876000h', // ~100 years
    });
    if (authErr) {
      console.error(`  ✗ auth update failed: ${authErr.message}`);
      continue;
    }
    console.log(`  ✓ banned + password rotated`);

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profileErr) {
      console.error(`  ✗ profile deactivation failed: ${profileErr.message}`);
      continue;
    }
    console.log(`  ✓ profiles.is_active = false`);
  }

  console.log(`\n✅ Cleaned up ${targets.length} LTI test account(s).`);
  console.log(`   Audit trail (lti_launches, lti_grades) preserved.\n`);
}

main().catch((e) => {
  console.error('\n💥 Fatal:', e);
  process.exit(1);
});
