// ============================================
// DEBUG SCRIPT: Learner Profile Sync Issues
// ============================================
// Created: 2026-01-28
// Purpose: Diagnose and report learner profile sync mismatches
// Issues addressed:
//   1. College email changes not reflecting in profiles table
//   2. User roles stuck as 'guest' instead of 'student'
//   3. Sync function not detecting mismatches
// ============================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LearnerProfile {
  id: string;
  first_name: string;
  last_name: string;
  college_email: string | null;
  lifecycle_status: string;
  is_profile_complete: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  learner_id: string | null;
}

interface MismatchReport {
  learnerId: string;
  learnerName: string;
  learnerEmail: string | null;
  learnerStatus: string;
  profileEmail: string | null;
  profileRole: string | null;
  profileActive: boolean | null;
  profileLinked: boolean;
  issues: string[];
}

/**
 * Find all learners with college_email that should have user profiles
 */
async function findLearnersWithEmail() {
  const supabase = createClientSupabaseClient();

  const { data: learners, error } = await supabase
    .from('learners_profiles')
    .select('id, first_name, last_name, college_email, lifecycle_status, is_profile_complete')
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
 * Find all user profiles
 */
async function findAllProfiles() {
  const supabase = createClientSupabaseClient();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, learner_id')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching profiles:', error);
    return [];
  }

  return profiles as UserProfile[];
}

/**
 * Detect mismatches between learners and profiles
 */
function detectMismatches(
  learners: LearnerProfile[],
  profiles: UserProfile[]
): MismatchReport[] {
  const reports: MismatchReport[] = [];

  // Create maps for quick lookup
  const profilesByEmail = new Map<string, UserProfile>();
  const profilesByLearnerId = new Map<string, UserProfile>();

  profiles.forEach(profile => {
    if (profile.email) {
      profilesByEmail.set(profile.email.toLowerCase(), profile);
    }
    if (profile.learner_id) {
      profilesByLearnerId.set(profile.learner_id, profile);
    }
  });

  // Check each learner
  learners.forEach(learner => {
    if (!learner.college_email) return;

    const issues: string[] = [];
    const email = learner.college_email.toLowerCase();

    // Find profile by email
    const profileByEmail = profilesByEmail.get(email);

    // Find profile by learner_id
    const profileByLearnerId = profilesByLearnerId.get(learner.id);

    let profile = profileByEmail || profileByLearnerId;

    // Issue 1: No profile exists for active learner
    if (!profile && learner.lifecycle_status === 'active' && learner.is_profile_complete) {
      issues.push('CRITICAL: Active learner with complete profile has NO user account');
    }

    // Issue 2: Profile exists but email mismatch
    if (profileByLearnerId && !profileByEmail) {
      issues.push(`EMAIL MISMATCH: Profile email '${profileByLearnerId.email}' ≠ learner email '${learner.college_email}'`);
      profile = profileByLearnerId; // Use the linked one for further checks
    }

    // Issue 3: Multiple profiles (linked by both email and learner_id but different records)
    if (profileByEmail && profileByLearnerId && profileByEmail.id !== profileByLearnerId.id) {
      issues.push('DUPLICATE: Two different profiles - one by email, one by learner_id link');
    }

    // Issue 4: Profile role is not 'student'
    if (profile && profile.role !== 'student') {
      issues.push(`ROLE ERROR: Profile role is '${profile.role}' instead of 'student'`);
    }

    // Issue 5: Profile is_active mismatch with lifecycle_status
    const shouldBeActive = learner.lifecycle_status === 'active';
    if (profile && profile.is_active !== shouldBeActive) {
      issues.push(`STATUS MISMATCH: Profile is_active=${profile.is_active} but lifecycle_status='${learner.lifecycle_status}' (should be ${shouldBeActive})`);
    }

    // Issue 6: Profile not linked to learner
    if (profile && !profile.learner_id) {
      issues.push('LINK MISSING: Profile exists but learner_id is not set');
    }

    // Only report if there are issues
    if (issues.length > 0) {
      reports.push({
        learnerId: learner.id,
        learnerName: `${learner.first_name} ${learner.last_name || ''}`.trim(),
        learnerEmail: learner.college_email,
        learnerStatus: learner.lifecycle_status,
        profileEmail: profile?.email || null,
        profileRole: profile?.role || null,
        profileActive: profile?.is_active ?? null,
        profileLinked: !!profile?.learner_id,
        issues,
      });
    }
  });

  return reports;
}

/**
 * Generate report
 */
function generateReport(reports: MismatchReport[]) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('LEARNER-PROFILE SYNC DIAGNOSTIC REPORT');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Total Mismatches Found: ${reports.length}\n`);

  if (reports.length === 0) {
    console.log('✓ No issues found! All learner profiles are in sync.\n');
    return;
  }

  // Group by issue type
  const issueCategories = {
    critical: reports.filter(r => r.issues.some(i => i.startsWith('CRITICAL'))),
    emailMismatch: reports.filter(r => r.issues.some(i => i.startsWith('EMAIL MISMATCH'))),
    roleError: reports.filter(r => r.issues.some(i => i.startsWith('ROLE ERROR'))),
    statusMismatch: reports.filter(r => r.issues.some(i => i.startsWith('STATUS MISMATCH'))),
    linkMissing: reports.filter(r => r.issues.some(i => i.startsWith('LINK MISSING'))),
    duplicate: reports.filter(r => r.issues.some(i => i.startsWith('DUPLICATE'))),
  };

  // Summary
  console.log('ISSUE SUMMARY:');
  console.log('─────────────────────────────────────────────────────────────────');
  if (issueCategories.critical.length > 0) {
    console.log(`  🔴 CRITICAL (No user account): ${issueCategories.critical.length}`);
  }
  if (issueCategories.emailMismatch.length > 0) {
    console.log(`  ⚠️  EMAIL MISMATCH: ${issueCategories.emailMismatch.length}`);
  }
  if (issueCategories.roleError.length > 0) {
    console.log(`  ⚠️  ROLE ERROR: ${issueCategories.roleError.length}`);
  }
  if (issueCategories.statusMismatch.length > 0) {
    console.log(`  ⚠️  STATUS MISMATCH: ${issueCategories.statusMismatch.length}`);
  }
  if (issueCategories.linkMissing.length > 0) {
    console.log(`  ⚠️  LINK MISSING: ${issueCategories.linkMissing.length}`);
  }
  if (issueCategories.duplicate.length > 0) {
    console.log(`  ⚠️  DUPLICATE: ${issueCategories.duplicate.length}`);
  }
  console.log('');

  // Detailed report
  console.log('\nDETAILED ISSUES:');
  console.log('─────────────────────────────────────────────────────────────────\n');

  reports.forEach((report, index) => {
    console.log(`${index + 1}. ${report.learnerName} (${report.learnerStatus})`);
    console.log(`   Learner ID: ${report.learnerId}`);
    console.log(`   Learner Email: ${report.learnerEmail}`);
    console.log(`   Profile Email: ${report.profileEmail || 'N/A'}`);
    console.log(`   Profile Role: ${report.profileRole || 'N/A'}`);
    console.log(`   Profile Active: ${report.profileActive ?? 'N/A'}`);
    console.log(`   Profile Linked: ${report.profileLinked ? 'Yes' : 'No'}`);
    console.log(`   Issues:`);
    report.issues.forEach(issue => {
      console.log(`     - ${issue}`);
    });
    console.log('');
  });

  console.log('════════════════════════════════════════════════════════════════\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('Fetching learners with email addresses...');
  const learners = await findLearnersWithEmail();
  console.log(`Found ${learners.length} learners with college email\n`);

  console.log('Fetching user profiles...');
  const profiles = await findAllProfiles();
  console.log(`Found ${profiles.length} user profiles\n`);

  console.log('Analyzing mismatches...');
  const reports = detectMismatches(learners, profiles);

  generateReport(reports);

  // Export to file
  const fs = await import('fs/promises');
  const reportFile = `learner-profile-sync-report-${Date.now()}.json`;
  await fs.writeFile(
    reportFile,
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2)
  );
  console.log(`\nDetailed report saved to: ${reportFile}\n`);
}

main().catch(console.error);
