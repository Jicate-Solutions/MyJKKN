/**
 * LTI Grade Service
 * Handles grade passback validation and processing
 *
 * LTI Advantage Assignment and Grade Services (AGS):
 * - Receives scores from external tools (MATLAB)
 * - Validates grade payloads
 * - Stores grades in lti_grades table
 * - (Future) Syncs to gradebook
 *
 * Created: 2026-01-12
 */

import { createClient } from '@/lib/supabase/server';
import { LtiError, LTI_ERROR_CODES } from '@/types/lti';

// LTI AGS Score Types
export interface LtiGradePayload {
  userId: string;
  scoreGiven?: number;
  scoreMaximum?: number;
  comment?: string;
  timestamp?: string;
  activityProgress?:
    | 'Initialized'
    | 'Started'
    | 'InProgress'
    | 'Submitted'
    | 'Completed';
  gradingProgress?:
    | 'FullyGraded'
    | 'Pending'
    | 'PendingManual'
    | 'Failed'
    | 'NotReady';
}

export interface LtiGradeContext {
  toolId: string;
  resourceLinkId: string;
  resourceLinkTitle?: string;
  launchId?: string;
}

export interface StoredGrade {
  id: string;
  tool_id: string;
  user_id: string;
  learner_profile_id: string;
  institution_id: string;
  resource_link_id: string;
  resource_link_title: string | null;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  received_at: string;
  synced_to_gradebook: boolean;
  created_at: string;
}

export class LtiGradeService {
  /**
   * Validate grade payload from external tool
   */
  static validateGradePayload(
    payload: LtiGradePayload
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate userId
    if (!payload.userId || typeof payload.userId !== 'string') {
      errors.push('userId is required and must be a string');
    }

    // Validate scoreGiven
    if (payload.scoreGiven !== undefined) {
      if (typeof payload.scoreGiven !== 'number') {
        errors.push('scoreGiven must be a number');
      } else if (payload.scoreGiven < 0) {
        errors.push('scoreGiven cannot be negative');
      }
    }

    // Validate scoreMaximum
    if (payload.scoreMaximum !== undefined) {
      if (typeof payload.scoreMaximum !== 'number') {
        errors.push('scoreMaximum must be a number');
      } else if (payload.scoreMaximum <= 0) {
        errors.push('scoreMaximum must be greater than 0');
      }
    }

    // Validate score bounds
    if (
      payload.scoreGiven !== undefined &&
      payload.scoreMaximum !== undefined &&
      payload.scoreGiven > payload.scoreMaximum
    ) {
      errors.push('scoreGiven cannot exceed scoreMaximum');
    }

    // Validate activityProgress enum
    if (payload.activityProgress) {
      const validActivityProgress = [
        'Initialized',
        'Started',
        'InProgress',
        'Submitted',
        'Completed'
      ];
      if (!validActivityProgress.includes(payload.activityProgress)) {
        errors.push(
          `activityProgress must be one of: ${validActivityProgress.join(', ')}`
        );
      }
    }

    // Validate gradingProgress enum
    if (payload.gradingProgress) {
      const validGradingProgress = [
        'FullyGraded',
        'Pending',
        'PendingManual',
        'Failed',
        'NotReady'
      ];
      if (!validGradingProgress.includes(payload.gradingProgress)) {
        errors.push(
          `gradingProgress must be one of: ${validGradingProgress.join(', ')}`
        );
      }
    }

    // Validate timestamp format (ISO 8601)
    if (payload.timestamp) {
      const date = new Date(payload.timestamp);
      if (isNaN(date.getTime())) {
        errors.push('timestamp must be a valid ISO 8601 date string');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if grade already exists (idempotency)
   */
  static async checkDuplicateGrade(
    userId: string,
    resourceLinkId: string,
    gradedAt: string
  ): Promise<StoredGrade | null> {
    const supabase = await createClient();

    // Generate idempotency key (same as database trigger)
    const crypto = await import('crypto');
    const idempotencyKey = crypto
      .createHash('md5')
      .update(`${resourceLinkId}${userId}${gradedAt}`)
      .digest('hex');

    const { data, error } = await supabase
      .from('lti_grades')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found (OK)
      console.error('[LTI Grade Service] Error checking duplicate:', error);
      throw new LtiError(
        LTI_ERROR_CODES.GRADE_PASSBACK_FAILED,
        'Failed to check for duplicate grade',
        500
      );
    }

    return data as StoredGrade | null;
  }

  /**
   * Find original launch record
   */
  static async findLaunchRecord(
    userId: string,
    resourceLinkId: string
  ): Promise<{ launchId: string; institutionId: string } | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('lti_launches')
      .select('id, institution_id')
      .eq('user_id', userId)
      .eq('resource_link_id', resourceLinkId)
      .order('launched_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      console.error('[LTI Grade Service] Error finding launch:', error);
      throw new LtiError(
        LTI_ERROR_CODES.GRADE_PASSBACK_FAILED,
        'Failed to find launch record',
        500
      );
    }

    return {
      launchId: data.id,
      institutionId: data.institution_id
    };
  }

  /**
   * Get learner profile ID for user
   */
  static async getLearnerProfileId(userId: string): Promise<string | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('learners_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found - user might be faculty
        return null;
      }
      console.error('[LTI Grade Service] Error finding learner:', error);
      throw new LtiError(
        LTI_ERROR_CODES.GRADE_PASSBACK_FAILED,
        'Failed to find learner profile',
        500
      );
    }

    return data.id;
  }

  /**
   * Store grade in database
   */
  static async storeGrade(
    payload: LtiGradePayload,
    context: LtiGradeContext
  ): Promise<StoredGrade> {
    const supabase = await createClient();

    // Find launch record
    const launchRecord = await this.findLaunchRecord(
      payload.userId,
      context.resourceLinkId
    );

    if (!launchRecord) {
      throw new LtiError(
        LTI_ERROR_CODES.LAUNCH_FAILED,
        'No launch record found for this user and resource',
        404
      );
    }

    // Get learner profile
    const learnerProfileId = await this.getLearnerProfileId(payload.userId);

    if (!learnerProfileId) {
      throw new LtiError(
        LTI_ERROR_CODES.USER_NOT_FOUND,
        'User does not have a learner profile',
        400
      );
    }

    // Prepare grade data
    const gradeData = {
      launch_id: context.launchId || launchRecord.launchId,
      tool_id: context.toolId,
      user_id: payload.userId,
      learner_profile_id: learnerProfileId,
      institution_id: launchRecord.institutionId,
      resource_link_id: context.resourceLinkId,
      resource_link_title: context.resourceLinkTitle || null,
      score: payload.scoreGiven || 0,
      score_maximum: payload.scoreMaximum || 100,
      activity_progress: payload.activityProgress || null,
      grading_progress: payload.gradingProgress || null,
      graded_at: payload.timestamp || new Date().toISOString(),
      received_at: new Date().toISOString(),
      synced_to_gradebook: false
    };

    // Insert grade
    const { data, error } = await supabase
      .from('lti_grades')
      .insert(gradeData)
      .select()
      .single();

    if (error) {
      console.error('[LTI Grade Service] Error storing grade:', error);
      throw new LtiError(
        LTI_ERROR_CODES.GRADE_PASSBACK_FAILED,
        'Failed to store grade',
        500
      );
    }

    return data as StoredGrade;
  }

  /**
   * Process incoming grade from external tool
   */
  static async processGrade(
    payload: LtiGradePayload,
    context: LtiGradeContext
  ): Promise<{ grade: StoredGrade; isDuplicate: boolean }> {
    // Validate payload
    const validation = this.validateGradePayload(payload);
    if (!validation.valid) {
      throw new LtiError(
        LTI_ERROR_CODES.INVALID_GRADE,
        `Invalid grade payload: ${validation.errors.join(', ')}`,
        400
      );
    }

    // Check for duplicate
    const existingGrade = await this.checkDuplicateGrade(
      payload.userId,
      context.resourceLinkId,
      payload.timestamp || new Date().toISOString()
    );

    if (existingGrade) {

      return {
        grade: existingGrade,
        isDuplicate: true
      };
    }

    // Store new grade
    const grade = await this.storeGrade(payload, context);

    return {
      grade,
      isDuplicate: false
    };
  }

  /**
   * Get grades for a user
   */
  static async getGradesForUser(
    userId: string,
    filters?: {
      toolId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ): Promise<StoredGrade[]> {
    const supabase = await createClient();

    let query = supabase
      .from('lti_grades')
      .select(
        `
        *,
        lti_tools!inner(name, tool_type)
      `
      )
      .eq('user_id', userId)
      .order('graded_at', { ascending: false });

    if (filters?.toolId) {
      query = query.eq('tool_id', filters.toolId);
    }

    if (filters?.startDate) {
      query = query.gte('graded_at', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('graded_at', filters.endDate);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[LTI Grade Service] Error fetching grades:', error);
      throw new LtiError(
        LTI_ERROR_CODES.GRADE_PASSBACK_FAILED,
        'Failed to fetch grades',
        500
      );
    }

    return data as StoredGrade[];
  }

  /**
   * Get grades for a context (section/course)
   */
  static async getGradesForContext(
    institutionId: string,
    filters: {
      programId?: string;
      semesterId?: string;
      sectionId?: string;
      toolId?: string;
      resourceLinkId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<StoredGrade[]> {
    const supabase = await createClient();

    let query = supabase
      .from('lti_grades')
      .select(
        `
        *,
        lti_tools!inner(name, tool_type),
        learners_profiles!inner(
          first_name,
          last_name,
          program_id,
          semester_id,
          section_id
        )
      `
      )
      .eq('institution_id', institutionId);

    if (filters.programId) {
      query = query.eq('learners_profiles.program_id', filters.programId);
    }

    if (filters.semesterId) {
      query = query.eq('learners_profiles.semester_id', filters.semesterId);
    }

    if (filters.sectionId) {
      query = query.eq('learners_profiles.section_id', filters.sectionId);
    }

    if (filters.toolId) {
      query = query.eq('tool_id', filters.toolId);
    }

    if (filters.resourceLinkId) {
      query = query.eq('resource_link_id', filters.resourceLinkId);
    }

    if (filters.startDate) {
      query = query.gte('graded_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('graded_at', filters.endDate);
    }

    query = query.order('graded_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[LTI Grade Service] Error fetching context grades:', error);
      throw new LtiError(
        LTI_ERROR_CODES.GRADE_PASSBACK_FAILED,
        'Failed to fetch grades for context',
        500
      );
    }

    return data as StoredGrade[];
  }
}
