// ============================================
// DELETE BPHARM SEM8 ACTIVE STUDENTS - AUTH USERS
// ============================================
// Purpose: Delete 107 active student auth accounts
// WARNING: This is IRREVERSIBLE
// ============================================

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

// Load environment variables
config();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

interface DeletionResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
}

async function deleteAuthUsers() {
  console.log('🚀 Starting auth user deletion for BPHARM Sem 8 ACTIVE students...\n');

  // STEP 1: Get all active student emails
  const { data: activeStudents, error: fetchError } = await supabaseAdmin
    .from('learners_profiles')
    .select('college_email, first_name, last_name')
    .eq('semester_id', 'a74396db-9f15-43e7-a8c3-cdfc185ac09b')
    .eq('lifecycle_status', 'active')
    .order('college_email');

  if (fetchError) {
    console.error('❌ Failed to fetch active students:', fetchError);
    process.exit(1);
  }

  console.log(`📋 Found ${activeStudents.length} active students to delete\n`);

  const result: DeletionResult = {
    total: activeStudents.length,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // STEP 2: Delete auth users sequentially
  for (let i = 0; i < activeStudents.length; i++) {
    const student = activeStudents[i];
    const email = student.college_email;
    const progress = i + 1;

    try {
      // Get user by email
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const user: User | undefined = users.find((u: User) => u.email?.toLowerCase() === email.toLowerCase());

      if (!user) {
        console.log(`⏭️  [${progress}/${activeStudents.length}] Skipped (no auth): ${email}`);
        result.skipped++;
        continue;
      }

      // Delete auth user
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

      if (deleteError) {
        console.error(`❌ [${progress}/${activeStudents.length}] Failed: ${email} - ${deleteError.message}`);
        result.failed++;
        result.errors.push({ email, error: deleteError.message });
      } else {
        console.log(`✅ [${progress}/${activeStudents.length}] Deleted: ${email} (${student.first_name})`);
        result.success++;
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [${progress}/${activeStudents.length}] Exception: ${email} - ${errorMsg}`);
      result.failed++;
      result.errors.push({ email, error: errorMsg });
    }

    // Small delay to avoid rate limiting
    if (progress % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // STEP 3: Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 DELETION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total students: ${result.total}`);
  console.log(`✅ Successfully deleted: ${result.success}`);
  console.log(`⏭️  Skipped (no auth): ${result.skipped}`);
  console.log(`❌ Failed: ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    result.errors.forEach(({ email, error }) => {
      console.log(`  - ${email}: ${error}`);
    });
  }

  console.log('\n✅ Auth user deletion complete!');

  return result;
}

// Run the deletion
deleteAuthUsers()
  .then((result) => {
    if (result.failed > 0) {
      console.log('\n⚠️  Some deletions failed. Check errors above.');
      process.exit(1);
    } else {
      console.log('\n🎉 All auth users deleted successfully!');
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
