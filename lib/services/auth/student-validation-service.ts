// ============================================
// Student Validation Service
// Created: 2025-12-27
// Purpose: Validate student lifecycle status for portal access
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES } from '@/lib/constants/induction-access';

// Re-export so existing server-side importers (e.g. the OAuth callback) can keep
// importing from this service. Client code must import it from the constants file
// directly — this module pulls in the server-only service-role client.
export { INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES };

export interface StudentValidationResult {
  /** TRUE only for FULL portal access (active/graduated). Pre-onboarding learners
   *  are intentionally `allowed: false` so every existing learner-page/API guard
   *  keeps blocking them — the proxy + callback opt them into the induction
   *  whitelist via `accessTier === 'induction_only'` instead. */
  allowed: boolean;
  /** Access tier. 'full' = active/graduated; 'induction_only' = pre-onboarding
   *  learner restricted to My Induction (+ feedback + profile completion);
   *  'none' = blocked. Undefined on early DB-error returns (treated as blocked). */
  accessTier?: 'full' | 'induction_only' | 'none';
  reason: string;
  status?: string;
  isGraduated: boolean;
}

// Full DB enum (learners_profiles.lifecycle_status). Kept in sync with the
// USER-DEFINED type in Postgres — the prior union was stale (missing enquiry*,
// reserved, account), which made those statuses fall through silently.
type LifecycleStatus =
  | 'enquiry'
  | 'enquiry_submitted'
  | 'reserved'
  | 'admitted'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'account'
  | 'active'
  | 'inactive'
  | 'exited'
  | 'graduated'
  | 'alumni';

export class StudentValidationService {
  /**
   * Validates if a student can access the portal based on lifecycle status
   *
   * Security: Uses service role client to bypass RLS for reliable validation
   * Allowed statuses: active, graduated
   * Blocked statuses: all others
   */
  static async validateStudentAccess(userId: string): Promise<StudentValidationResult> {
    try {
      console.log('[StudentValidation] 🔍 Starting validation for user:', userId);
      const adminClient = createServiceRoleClient();

      // Get learner_id from profile
      console.log('[StudentValidation] Querying profiles table...');
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('learner_id, role, email, full_name')
        .eq('id', userId)
        .maybeSingle();

      console.log('[StudentValidation] Profile query result:', {
        found: !!profile,
        learner_id: profile?.learner_id,
        role: profile?.role,
        email: profile?.email,
        error: profileError
      });

      if (profileError) {
        console.error('[StudentValidation] ❌ Profile query error:', profileError);
        return {
          allowed: false,
          reason: 'database_error',
          isGraduated: false,
        };
      }

      if (!profile || !profile.learner_id) {
        console.warn('[StudentValidation] ⚠️ No learner_id found for user:', userId);
        console.warn('[StudentValidation] Profile data:', profile);
        return {
          allowed: false,
          reason: 'no_student_profile',
          isGraduated: false,
        };
      }

      // Query learners_profiles for lifecycle status
      console.log('[StudentValidation] Querying learners_profiles for learner_id:', profile.learner_id);
      const { data: learnerProfile, error: learnerError } = await adminClient
        .from('learners_profiles')
        .select('lifecycle_status, id, first_name, last_name, roll_number')
        .eq('id', profile.learner_id)
        .maybeSingle();

      console.log('[StudentValidation] Learner profile query result:', {
        found: !!learnerProfile,
        lifecycle_status: learnerProfile?.lifecycle_status,
        name: learnerProfile ? `${learnerProfile.first_name} ${learnerProfile.last_name}` : null,
        roll_number: learnerProfile?.roll_number,
        error: learnerError
      });

      if (learnerError) {
        console.error('[StudentValidation] ❌ Learner profile query error:', learnerError);
        return {
          allowed: false,
          reason: 'database_error',
          isGraduated: false,
        };
      }

      if (!learnerProfile) {
        console.warn('[StudentValidation] ⚠️ Learner profile not found for learner_id:', profile.learner_id);
        return {
          allowed: false,
          reason: 'no_student_profile',
          isGraduated: false,
        };
      }

      const fullAccessStatuses: LifecycleStatus[] = ['active', 'graduated'];
      const status = learnerProfile.lifecycle_status as LifecycleStatus;

      console.log('[StudentValidation] Checking status:', status, 'against full-access:', fullAccessStatuses);

      // Pre-onboarding learners → RESTRICTED induction-only access. NOT fully
      // allowed (so existing guards keep blocking them); the proxy + callback
      // grant the induction whitelist off accessTier. See spec.
      if ((INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES as readonly string[]).includes(status)) {
        console.log('[StudentValidation] 🎓 Induction-only access - status:', status, 'user:', userId);
        return {
          allowed: false,
          accessTier: 'induction_only',
          reason: 'student_induction_only',
          status,
          isGraduated: false,
        };
      }

      if (!fullAccessStatuses.includes(status)) {
        console.log('[StudentValidation] ❌ Student BLOCKED - status:', status, 'user:', userId);
        return {
          allowed: false,
          accessTier: 'none',
          reason: this.getBlockedReasonCode(status),
          status,
          isGraduated: false,
        };
      }

      // Student is allowed — full access
      console.log('[StudentValidation] ✅ Student ALLOWED (full)');
      console.log('[StudentValidation] Status:', status);
      console.log('[StudentValidation] User:', userId);
      console.log('[StudentValidation] Name:', `${learnerProfile.first_name} ${learnerProfile.last_name}`);
      console.log('[StudentValidation] Roll Number:', learnerProfile.roll_number);

      return {
        allowed: true,
        accessTier: 'full',
        reason: 'access_granted',
        status,
        isGraduated: status === 'graduated',
      };
    } catch (error) {
      console.error('[StudentValidation] ❌ Unexpected error:', error);
      return {
        allowed: false,
        reason: 'database_error',
        isGraduated: false,
      };
    }
  }

  /**
   * Maps lifecycle status to user-friendly error reason codes
   */
  private static getBlockedReasonCode(status: LifecycleStatus): string {
    const reasonMap: Record<LifecycleStatus, string> = {
      // Induction-only statuses return before this is called; mapped for type completeness.
      enquiry: 'student_induction_only',
      enquiry_submitted: 'student_induction_only',
      reserved: 'student_induction_only',
      admitted: 'student_induction_only',
      account: 'student_blocked',
      pending: 'student_pending_approval',
      approved: 'student_not_enrolled',
      rejected: 'student_application_rejected',
      waitlisted: 'student_waitlisted',
      inactive: 'student_inactive',
      exited: 'student_exited',
      alumni: 'student_alumni_contact_support',
      active: '', // Not used
      graduated: '', // Not used
    };

    return reasonMap[status] || 'student_blocked';
  }

  /**
   * Get user-friendly error messages for display
   */
  static getErrorMessage(reasonCode: string): string {
    const messages: Record<string, string> = {
      student_induction_only:
        'Your full account is being set up. For now you have access to your Induction program.',
      student_enquiry_only:
        'Your enquiry is being processed. You will receive login access once approved.',
      student_pending_approval: 'Your application is pending approval. Please wait for confirmation.',
      student_not_enrolled:
        'Your application is approved but enrollment is not complete. Please contact admissions.',
      student_application_rejected:
        'Your application has been rejected. Please contact admissions for details.',
      student_waitlisted: 'You are currently on the waitlist. We will notify you when a seat becomes available.',
      student_inactive: 'Your account is temporarily inactive. Please contact your institution for assistance.',
      student_exited: 'Your student account has been marked as exited. Please contact your institution.',
      student_alumni_contact_support: 'For alumni portal access, please contact our alumni relations office.',
      no_student_profile: 'No student profile found. Please contact support.',
      database_error: 'System error. Please try again later or contact support.',
      student_redirect: 'Student portal access is currently unavailable. Please check back later.',
      student_blocked: 'Portal access is not available for your account status. Please contact support.',
    };

    return messages[reasonCode] || messages['student_blocked'];
  }
}
