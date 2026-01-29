// ============================================
// REPAIR SCRIPT: Fix Learner-Profile Sync Mismatches
// ============================================
// Created: 2026-01-28
// Purpose: Automatically fix all mismatches between learners_profiles and profiles tables
// Usage: npx tsx scripts/repair-learner-profile-sync.ts [--dry-run] [--verbose]
// ============================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LearnerProfile {
  id: string;
  first_name: string;
  last_name: string;
  college_email: string | null;
  lifecycle_status: string;
  is_profile_complete: boolean;
  institution_id: string | null;
  department_id: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  learner_id: string | null;
  institution_id: string | null;
  department_id: string | null;
}

interface RepairResult {
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  profileId: string | null;
  issuesFixed: string[];
  errors: string[];
  success: boolean;
}

// Command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');

/**
 * Find all learners with college_email
 */
async function findLearnersWithEmail() {
  const supabase = createClientSupabaseClient();

  const { data: learners, error } = await supabase
    .from('learners_profiles')
    .select('id, first_name, last_name, college_email, lifecycle_status, is_profile_complete, institution_id, department_id')
    .not('college_email', 'is', null)
    .neq('college_email', '')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching learners:', error);
    return [];
  }

  return learners as LearnerProfile[];
}

/**
 * Find profile for a learner (by email or learner_id)
 */
async function findProfileForLearner(learner: LearnerProfile) {
  const supabase = createClientSupabaseClient();

  // Try by email first
  let { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, learner_id, institution_id, department_id')
    .eq('email', learner.college_email!)
    .maybeSingle();

  if (profile) {
    return profile as UserProfile;
  }

  // Try by learner_id
  ({ data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, learner_id, institution_id, department_id')
    .eq('learner_id', learner.id)
    .maybeSingle());

  return profile as UserProfile | null;
}

/**
 * Repair a single learner-profile mismatch
 */
async function repairLearnerProfile(learner: LearnerProfile): Promise<RepairResult> {
  const result: RepairResult = {
    learnerId: learner.id,
    learnerName: `${learner.first_name} ${learner.last_name || ''}`.trim(),
    learnerEmail: learner.college_email!,
    profileId: null,
    issuesFixed: [],
    errors: [],
    success: false,
  };

  try {
    const supabase = createClientSupabaseClient();

    // Find existing profile
    const profile = await findProfileForLearner(learner);

    if (!profile) {
      // No profile exists
      // This is OK if learner is not active or profile is incomplete
      if (learner.lifecycle_status === 'active' && learner.is_profile_complete) {
        result.errors.push('CRITICAL: Active learner with complete profile has NO user account');
      } else {
        if (isVerbose) {
          console.log(`  ℹ No profile for ${result.learnerName} (status: ${learner.lifecycle_status}, complete: ${learner.is_profile_complete}) - This is expected`);
        }
        result.success = true;
      }
      return result;
    }

    result.profileId = profile.id;

    // Determine what needs fixing
    const updates: Record<string, any> = {};

    // Fix 1: Email mismatch
    if (profile.email !== learner.college_email) {
      updates.email = learner.college_email;
      result.issuesFixed.push(`Email: ${profile.email} → ${learner.college_email}`);
    }

    // Fix 2: Role incorrect
    if (profile.role !== 'student') {
      updates.role = 'student';
      result.issuesFixed.push(`Role: ${profile.role} → student`);
    }

    // Fix 3: is_active mismatch
    const shouldBeActive = learner.lifecycle_status === 'active';
    if (profile.is_active !== shouldBeActive) {
      updates.is_active = shouldBeActive;
      result.issuesFixed.push(`is_active: ${profile.is_active} → ${shouldBeActive} (lifecycle: ${learner.lifecycle_status})`);
    }

    // Fix 4: learner_id link missing
    if (!profile.learner_id || profile.learner_id !== learner.id) {
      updates.learner_id = learner.id;
      result.issuesFixed.push(`learner_id: ${profile.learner_id || 'null'} → ${learner.id}`);
    }

    // Fix 5: institution_id mismatch
    if (learner.institution_id && profile.institution_id !== learner.institution_id) {
      updates.institution_id = learner.institution_id;
      result.issuesFixed.push(`institution_id synced`);
    }

    // Fix 6: department_id mismatch
    if (learner.department_id && profile.department_id !== learner.department_id) {
      updates.department_id = learner.department_id;
      result.issuesFixed.push(`department_id synced`);
    }

    // Apply fixes
    if (Object.keys(updates).length > 0) {
      if (isDryRun) {
        console.log(`  [DRY RUN] Would fix ${Object.keys(updates).length} issue(s) for profile ${profile.id}`);
        result.issuesFixed.forEach(fix => console.log(`    - ${fix}`));
        result.success = true;
      } else {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id);

        if (updateError) {
          result.errors.push(`Failed to update profile: ${updateError.message}`);
          console.error(`  ✗ Error updating profile ${profile.id}:`, updateError);
        } else {
          console.log(`  ✓ Fixed ${Object.keys(updates).length} issue(s) for profile ${profile.id}`);
          result.issuesFixed.forEach(fix => console.log(`    - ${fix}`));
          result.success = true;
        }
      }
    } else {
      if (isVerbose) {
        console.log(`  ✓ Profile ${profile.id} already in sync`);
      }
      result.success = true;
    }

  } catch (error) {
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`  ✗ Error processing learner ${learner.id}:`, error);
  }

  return result;
}

/**
 * Generate summary report
 */
function generateSummary(results: RepairResult[]) {
  const successful = results.filter(r => r.success && r.issuesFixed.length > 0);
  const failed = results.filter(r => !r.success);
  const alreadyInSync = results.filter(r => r.success && r.issuesFixed.length === 0);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('REPAIR SUMMARY');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes were made\n');
  }

  console.log(`Total Learners Processed: ${results.length}`);
  console.log(`✓ Successfully Fixed: ${successful.length}`);
  console.log(`✓ Already in Sync: ${alreadyInSync.length}`);
  console.log(`✗ Failed: ${failed.length}\n`);

  if (successful.length > 0) {
    console.log('FIXED PROFILES:');
    console.log('─────────────────────────────────────────────────────────────────');
    successful.forEach((result, index) => {
      console.log(`${index + 1}. ${result.learnerName} (${result.learnerEmail})`);
      console.log(`   Profile ID: ${result.profileId}`);
      console.log(`   Issues Fixed: ${result.issuesFixed.length}`);
      result.issuesFixed.forEach(fix => {
        console.log(`     - ${fix}`);
      });
    });
    console.log('');
  }

  if (failed.length > 0) {
    console.log('FAILED REPAIRS:');
    console.log('─────────────────────────────────────────────────────────────────');
    failed.forEach((result, index) => {
      console.log(`${index + 1}. ${result.learnerName} (${result.learnerEmail})`);
      console.log(`   Learner ID: ${result.learnerId}`);
      console.log(`   Errors:`);
      result.errors.forEach(error => {
        console.log(`     - ${error}`);
      });
    });
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════\n');

  if (isDryRun && successful.length > 0) {
    console.log('💡 To apply these fixes, run without --dry-run flag:\n');
    console.log('   npx tsx scripts/repair-learner-profile-sync.ts\n');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('LEARNER-PROFILE SYNC REPAIR TOOL');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (isDryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made\n');
  }

  console.log(`Started: ${new Date().toISOString()}\n`);

  // Fetch learners
  console.log('Fetching learners with email addresses...');
  const learners = await findLearnersWithEmail();
  console.log(`Found ${learners.length} learners with college email\n`);

  if (learners.length === 0) {
    console.log('No learners to process. Exiting.\n');
    return;
  }

  // Process each learner
  console.log('Processing learners...\n');
  const results: RepairResult[] = [];

  for (let i = 0; i < learners.length; i++) {
    const learner = learners[i];
    if (!isVerbose) {
      // Show progress
      process.stdout.write(`\rProgress: ${i + 1}/${learners.length} (${Math.round(((i + 1) / learners.length) * 100)}%)`);
    } else {
      console.log(`\nProcessing ${i + 1}/${learners.length}: ${learner.first_name} ${learner.last_name || ''} (${learner.college_email})`);
    }

    const result = await repairLearnerProfile(learner);
    results.push(result);
  }

  if (!isVerbose) {
    console.log('\n'); // New line after progress
  }

  // Generate summary
  generateSummary(results);

  // Save detailed report
  const fs = await import('fs/promises');
  const reportFile = `repair-report-${Date.now()}.json`;
  await fs.writeFile(
    reportFile,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      dryRun: isDryRun,
      results
    }, null, 2)
  );
  console.log(`Detailed report saved to: ${reportFile}\n`);
}

// Run with error handling
main().catch(error => {
  console.error('\n✗ Fatal error:', error);
  process.exit(1);
});
