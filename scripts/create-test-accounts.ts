/**
 * Create Test Accounts for Role Permission Testing
 *
 * Run: npx tsx scripts/create-test-accounts.ts
 *
 * Creates email/password auth users for each custom role with:
 * - Email: test.{role}@jkkn.ac.in
 * - Password: Test@1234
 * - Profile with correct role and institution
 * - user_roles assignment
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  console.error('Run: source .env.local && npx tsx scripts/create-test-accounts.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEFAULT_PASSWORD = 'Test@1234';

// Test institution to assign (first non-null institution)
async function getDefaultInstitution(): Promise<string | null> {
  const { data } = await supabase
    .from('institutions')
    .select('id')
    .limit(1)
    .single();
  return data?.id || null;
}

const TEST_ACCOUNTS = [
  { roleKey: 'super_admin', email: 'test.superadmin@jkkn.ac.in', name: 'Test Super Admin', isSuperAdmin: true, needsInstitution: false },
  { roleKey: 'administrator', email: 'test.admin@jkkn.ac.in', name: 'Test Administrator', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'admission', email: 'test.admission@jkkn.ac.in', name: 'Test Admission Officer', isSuperAdmin: false, needsInstitution: false },
  { roleKey: 'admission_staff', email: 'test.admission_staff@jkkn.ac.in', name: 'Test Admission Staff', isSuperAdmin: false, needsInstitution: false },
  { roleKey: 'admission_counselor', email: 'test.counselor@jkkn.ac.in', name: 'Test Admission Counselor', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'expo_counselor', email: 'test.expo_counselor@jkkn.ac.in', name: 'Test Expo Counselor', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'hod', email: 'test.hod@jkkn.ac.in', name: 'Test HOD', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'faculty', email: 'test.faculty@jkkn.ac.in', name: 'Test Faculty', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'student', email: 'test.student@jkkn.ac.in', name: 'Test Student', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'accounts', email: 'test.accounts@jkkn.ac.in', name: 'Test Accountant', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'staff', email: 'test.staff@jkkn.ac.in', name: 'Test Staff', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'digital_coordinator', email: 'test.digital@jkkn.ac.in', name: 'Test Digital Coordinator', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'principal', email: 'test.principal@jkkn.ac.in', name: 'Test Principal', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'event_coordinator', email: 'test.event@jkkn.ac.in', name: 'Test Event Coordinator', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'driver', email: 'test.driver@jkkn.ac.in', name: 'Test Driver', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'guest', email: 'test.guest@jkkn.ac.in', name: 'Test Guest', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'coe', email: 'test.coe@jkkn.ac.in', name: 'Test COE', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'coe_office', email: 'test.coe_office@jkkn.ac.in', name: 'Test COE Officer', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'health_supervisor', email: 'test.health_sup@jkkn.ac.in', name: 'Test Health Supervisor', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'health_screener', email: 'test.health_scr@jkkn.ac.in', name: 'Test Health Screener', isSuperAdmin: false, needsInstitution: true },
  { roleKey: 'health_counselor', email: 'test.health_coun@jkkn.ac.in', name: 'Test Health Counselor', isSuperAdmin: false, needsInstitution: true },
];

async function main() {
  console.log('Creating test accounts...\n');

  const institutionId = await getDefaultInstitution();
  console.log(`Default institution: ${institutionId}\n`);

  // Get all custom_roles for role_id lookup
  const { data: roles } = await supabase.from('custom_roles').select('id, role_key');
  const roleMap = new Map(roles?.map(r => [r.role_key, r.id]) || []);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const account of TEST_ACCOUNTS) {
    const roleId = roleMap.get(account.roleKey);
    if (!roleId) {
      console.log(`  SKIP ${account.email} — role '${account.roleKey}' not found in custom_roles`);
      skipped++;
      continue;
    }

    try {
      // 1. Create auth user (or get existing)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: account.name },
      });

      if (authError) {
        if (authError.message.includes('already been registered')) {
          console.log(`  EXISTS ${account.email} — already registered, updating profile...`);

          // Get existing user
          const { data: { users } } = await supabase.auth.admin.listUsers();
          const existingUser = users?.find(u => u.email === account.email);

          if (existingUser) {
            // Update password
            await supabase.auth.admin.updateUserById(existingUser.id, { password: DEFAULT_PASSWORD });

            // Update profile
            await supabase.from('profiles').upsert({
              id: existingUser.id,
              email: account.email,
              full_name: account.name,
              role: account.roleKey,
              institution_id: account.needsInstitution ? institutionId : null,
              is_super_admin: account.isSuperAdmin,
              is_active: true,
              profile_completed: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            // Upsert user_roles
            await supabase.from('user_roles').upsert({
              user_id: existingUser.id,
              role_id: roleId,
              is_primary: true,
            }, { onConflict: 'user_id,role_id' });

            skipped++;
          }
          continue;
        }
        throw authError;
      }

      const userId = authData.user!.id;

      // 2. Create/update profile
      await supabase.from('profiles').upsert({
        id: userId,
        email: account.email,
        full_name: account.name,
        role: account.roleKey,
        institution_id: account.needsInstitution ? institutionId : null,
        is_super_admin: account.isSuperAdmin,
        is_active: true,
        profile_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      // 3. Assign role
      await supabase.from('user_roles').upsert({
        user_id: userId,
        role_id: roleId,
        is_primary: true,
      }, { onConflict: 'user_id,role_id' });

      console.log(`  ✓ CREATED ${account.email} → ${account.roleKey}`);
      created++;

    } catch (err: any) {
      console.error(`  ✗ FAILED ${account.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Done! Created: ${created}, Updated: ${skipped}, Failed: ${failed}`);
  console.log(`\nAll test accounts use password: ${DEFAULT_PASSWORD}`);
  console.log(`Test login page: http://localhost:3000/auth/test-login`);
}

main().catch(console.error);
