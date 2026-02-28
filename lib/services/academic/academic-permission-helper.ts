// lib/services/academic/academic-permission-helper.ts
// Shared institution access resolution for academic services
// Created: 2026-02-28
//
// Centralizes the two institution ID resolution patterns used across the academic module:
// 1. user_institution_access table (preferred — consistent with AttendanceService)
// 2. profiles.institution_id (legacy fallback, intentionally kept in leave workflows)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * AcademicPermissionHelper — shared institution access resolution for academic services.
 *
 * Centralizes the two patterns used across the academic module:
 * 1. user_institution_access table (preferred — consistent with AttendanceService)
 * 2. profiles.institution_id (legacy fallback)
 *
 * Usage:
 *   const institutionId = await AcademicPermissionHelper.getInstitutionId(userId);
 *
 * Background on module-specific patterns:
 * - AttendanceService (attendance-core-service.ts): uses user_institution_access exclusively
 * - PeriodService, RegulationService: accept optional userInstitutionId parameter from caller
 * - LeaveService, LeaveApprovalService: use profiles.institution_id intentionally
 *   (leave workflows are scoped to the user's primary institution profile)
 */
export class AcademicPermissionHelper {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Get institution ID for a user via user_institution_access table.
   * Returns null if no active access record found.
   * Falls back to profiles.institution_id if user_institution_access has no record.
   *
   * This is the preferred method for new academic services — it matches the pattern
   * used by AttendanceService (attendance-core-service.ts lines 48, 62).
   */
  static async getInstitutionId(userId: string): Promise<string | null> {
    // Primary: user_institution_access (same source as AttendanceService)
    const { data: access, error: accessError } = await this.supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (accessError) {
      logger.warn('academic/permissions', 'user_institution_access lookup failed, falling back to profile', { userId, error: accessError });
    } else if (access?.institution_id) {
      return access.institution_id;
    }

    // Fallback: profiles.institution_id (used by LeaveService, LeaveApprovalService)
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      logger.error('academic/permissions', 'Profile institution_id fallback also failed', { userId, error: profileError });
      return null;
    }

    if (!profile?.institution_id) {
      logger.warn('academic/permissions', 'No institution_id found for user via either source', { userId });
      return null;
    }

    return profile.institution_id;
  }

  /**
   * Get institution ID from profiles table directly (legacy pattern).
   * Use this only when you need profile-based access specifically
   * (e.g., leave workflows that use profiles.institution_id by design).
   *
   * For most new services, prefer getInstitutionId() which tries
   * user_institution_access first and only falls back to profiles.
   */
  static async getInstitutionIdFromProfile(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('academic/permissions', 'Failed to get institution_id from profile', { userId, error });
      return null;
    }
    return data?.institution_id ?? null;
  }
}
