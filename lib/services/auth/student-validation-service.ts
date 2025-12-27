// ============================================
// Student Validation Service
// Created: 2025-12-27
// Purpose: Validate student lifecycle status for portal access
// ============================================

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface StudentValidationResult {
  allowed: boolean;
  reason: string;
  status?: string;
  isGraduated: boolean;
}

type LifecycleStatus =
  | 'enquiry'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
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

      const allowedStatuses: LifecycleStatus[] = ['active', 'graduated'];
      const status = learnerProfile.lifecycle_status as LifecycleStatus;

      console.log('[StudentValidation] Checking status:', status, 'against allowed:', allowedStatuses);

      if (!allowedStatuses.includes(status)) {
        console.log('[StudentValidation] ❌ Student BLOCKED - status:', status, 'user:', userId);
        return {
          allowed: false,
          reason: this.getBlockedReasonCode(status),
          status,
          isGraduated: false,
        };
      }

      // Student is allowed
      console.log('[StudentValidation] ✅ Student ALLOWED');
      console.log('[StudentValidation] Status:', status);
      console.log('[StudentValidation] User:', userId);
      console.log('[StudentValidation] Name:', `${learnerProfile.first_name} ${learnerProfile.last_name}`);
      console.log('[StudentValidation] Roll Number:', learnerProfile.roll_number);

      return {
        allowed: true,
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
      enquiry: 'student_enquiry_only',
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
