// ============================================
// FEATURE FLAGS CONFIGURATION
// ============================================
// Created: 2025-01-18
// Purpose: Gradual rollout of unified learners profiles module
// ============================================

/**
 * Feature flags for phased migration from admissions/students to learners_profiles
 *
 * Migration Strategy:
 * - Week 1: Enable LEARNERS_ENQUIRIES (test enquiry workflow)
 * - Week 2: Enable LEARNERS_APPLICATIONS (test approval/rejection workflow)
 * - Week 3: Enable LEARNERS_PROFILES (test active student management)
 * - Week 4: Enable LEARNERS_ALUMNI + LEARNERS_ANALYTICS (complete rollout)
 *
 * Rollback: Set all flags to 'false' to revert to old modules
 */

export const FEATURE_FLAGS = {
  // ============================================
  // MASTER TOGGLE - Controls entire learners module
  // ============================================
  /**
   * Master switch for learners module
   * When true: Shows /learners routes, hides /admissions and /students
   * When false: Shows old /admissions and /students routes
   */
  USE_LEARNERS_PROFILES: process.env.NEXT_PUBLIC_USE_LEARNERS_PROFILES === 'true',

  // ============================================
  // GRANULAR MODULE FLAGS (for testing)
  // ============================================
  /**
   * Enquiries module (lifecycle_status: enquiry, pending)
   * Manages initial contact and application submission
   */
  LEARNERS_ENQUIRIES: process.env.NEXT_PUBLIC_LEARNERS_ENQUIRIES === 'true',

  /**
   * Applications module (lifecycle_status: approved, rejected, waitlisted)
   * Manages application processing and approval workflow
   */
  LEARNERS_APPLICATIONS: process.env.NEXT_PUBLIC_LEARNERS_APPLICATIONS === 'true',

  /**
   * Profiles module (lifecycle_status: active, inactive)
   * Manages currently enrolled students
   */
  LEARNERS_PROFILES: process.env.NEXT_PUBLIC_LEARNERS_PROFILES === 'true',

  /**
   * Alumni module (lifecycle_status: graduated, exited)
   * Manages graduated and exited learners
   */
  LEARNERS_ALUMNI: process.env.NEXT_PUBLIC_LEARNERS_ALUMNI === 'true',

  /**
   * Analytics dashboard
   * Unified lifecycle funnel and insights
   */
  LEARNERS_ANALYTICS: process.env.NEXT_PUBLIC_LEARNERS_ANALYTICS === 'true',
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if learners module is enabled (master switch)
 */
export function useLearnerProfilesModule(): boolean {
  return FEATURE_FLAGS.USE_LEARNERS_PROFILES;
}

/**
 * Check if specific learner sub-module is enabled
 */
export function isLearnerModuleEnabled(module: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[module] === true;
}

/**
 * Check if any learner module is enabled (for debugging)
 */
export function hasAnyLearnerModuleEnabled(): boolean {
  return (
    FEATURE_FLAGS.USE_LEARNERS_PROFILES ||
    FEATURE_FLAGS.LEARNERS_ENQUIRIES ||
    FEATURE_FLAGS.LEARNERS_APPLICATIONS ||
    FEATURE_FLAGS.LEARNERS_PROFILES ||
    FEATURE_FLAGS.LEARNERS_ALUMNI ||
    FEATURE_FLAGS.LEARNERS_ANALYTICS
  );
}

/**
 * Get feature flag status for admin panel
 */
export function getFeatureFlagStatus() {
  return {
    masterSwitch: FEATURE_FLAGS.USE_LEARNERS_PROFILES,
    modules: {
      enquiries: FEATURE_FLAGS.LEARNERS_ENQUIRIES,
      applications: FEATURE_FLAGS.LEARNERS_APPLICATIONS,
      profiles: FEATURE_FLAGS.LEARNERS_PROFILES,
      alumni: FEATURE_FLAGS.LEARNERS_ALUMNI,
      analytics: FEATURE_FLAGS.LEARNERS_ANALYTICS,
    },
    allEnabled: Object.values(FEATURE_FLAGS).every((flag) => flag === true),
    anyEnabled: hasAnyLearnerModuleEnabled(),
  };
}

// ============================================
// MIGRATION CHECKLIST (for developers)
// ============================================
/**
 * Phase 3 Rollout Checklist:
 *
 * Week 1 - Enquiries:
 * [ ] Set NEXT_PUBLIC_LEARNERS_ENQUIRIES=true
 * [ ] Test enquiry form submission
 * [ ] Test enquiry → pending transition
 * [ ] Verify data appears in learners_profiles table
 *
 * Week 2 - Applications:
 * [ ] Set NEXT_PUBLIC_LEARNERS_APPLICATIONS=true
 * [ ] Test approve/reject/waitlist workflow
 * [ ] Test pending → approved → active transitions
 * [ ] Verify enrollment creates student record
 *
 * Week 3 - Profiles:
 * [ ] Set NEXT_PUBLIC_LEARNERS_PROFILES=true
 * [ ] Test active student management
 * [ ] Test profile editing
 * [ ] Verify attendance/billing integration
 *
 * Week 4 - Complete Rollout:
 * [ ] Set NEXT_PUBLIC_LEARNERS_ALUMNI=true
 * [ ] Set NEXT_PUBLIC_LEARNERS_ANALYTICS=true
 * [ ] Set NEXT_PUBLIC_USE_LEARNERS_PROFILES=true (master switch)
 * [ ] Verify old routes hidden
 * [ ] Test all modules end-to-end
 *
 * Rollback:
 * [ ] Set all flags to false
 * [ ] Redeploy application
 * [ ] Verify old modules visible
 */
