// ============================================================================
// Learning Path Service
// Handles CRUD operations for learning paths
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  LearningPath,
  LearningPathListResponse,
  LearningPathFilters,
  CreateLearningPathInput,
  UpdateLearningPathInput,
} from '@/types/learning-path';

export class LearningPathService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      console.error(`[LearningPath] Invalid ${fieldName}: ${actualValue}`);
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      if (e.details) return String(e.details);
      return JSON.stringify(error);
    }
    return String(error);
  }

  /**
   * Get all learning paths with filters and pagination
   */
  static async getLearningPaths(
    filters: LearningPathFilters = {}
  ): Promise<LearningPathListResponse> {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter');
      }

      let query = (this.getSupabase() as any)
        .from('learning_paths')
        .select('*', { count: 'exact' });

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.learner_id) {
        query = query.eq('learner_id', filters.learner_id);
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.is_ai_generated !== undefined) {
        query = query.eq('is_ai_generated', filters.is_ai_generated);
      }

      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,target_role.ilike.%${filters.search}%`
        );
      }

      const sortBy = filters.sort_by || 'created_at';
      const sortOrder = filters.sort_order === 'asc';
      query = query.order(sortBy, { ascending: sortOrder });

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[LearningPath] Error fetching paths:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single learning path by ID with steps
   */
  static async getLearningPathById(id: string): Promise<LearningPath> {
    try {
      this.validateId(id, 'learning path ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .select(`
          *,
          steps:learning_path_steps(
            id,
            path_id,
            step_number,
            title,
            description,
            step_type,
            resource_id,
            resource_type,
            target_competencies,
            estimated_hours,
            status,
            started_at,
            completed_at,
            completion_evidence,
            score,
            mentor_notes,
            is_required,
            created_at,
            updated_at
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error('Learning path not found');
      }

      // Sort steps by step_number
      if (data.steps) {
        data.steps.sort((a: any, b: any) => a.step_number - b.step_number);
      }

      return data;
    } catch (error) {
      console.error('[LearningPath] Error fetching path:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create new learning path
   */
  static async createLearningPath(input: CreateLearningPathInput): Promise<LearningPath> {
    try {
      this.validateId(input.institution_id, 'institution_id');

      const insertData = {
        institution_id: input.institution_id,
        learner_id: input.learner_id,
        title: input.title,
        description: input.description || null,
        target_role: input.target_role || null,
        target_industry: input.target_industry || null,
        target_competencies: input.target_competencies || [],
        current_progress: 0,
        status: 'active' as const,
        estimated_duration_weeks: input.estimated_duration_weeks || null,
        start_date: input.start_date || null,
        target_completion_date: input.target_completion_date || null,
        is_ai_generated: input.is_ai_generated || false,
        metadata: input.metadata || {},
        // created_at and updated_at are handled by database defaults
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Learning path created successfully');
      return data;
    } catch (error) {
      console.error('[LearningPath] Error creating path:', this.formatError(error));
      toast.error(`Failed to create learning path: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update learning path
   */
  static async updateLearningPath(
    id: string,
    input: UpdateLearningPathInput
  ): Promise<LearningPath> {
    try {
      this.validateId(id, 'learning path ID');

      // Filter out undefined values to avoid sending them to Supabase
      const updateData = Object.fromEntries(
        Object.entries(input).filter(([_, value]) => value !== undefined)
      );

      // updated_at is handled by database trigger

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Learning path updated successfully');
      return data;
    } catch (error) {
      console.error('[LearningPath] Error updating path:', this.formatError(error));
      toast.error(`Failed to update learning path: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete learning path (cascade deletes steps)
   */
  static async deleteLearningPath(id: string): Promise<void> {
    try {
      this.validateId(id, 'learning path ID');

      const { error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Learning path deleted successfully');
    } catch (error) {
      console.error('[LearningPath] Error deleting path:', this.formatError(error));
      toast.error('Failed to delete learning path');
      throw error;
    }
  }

  /**
   * Archive learning path (soft delete)
   */
  static async archiveLearningPath(id: string): Promise<void> {
    try {
      this.validateId(id, 'learning path ID');

      const { error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .update({
          status: 'archived',
          // updated_at is handled by database trigger
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Learning path archived');
    } catch (error) {
      console.error('[LearningPath] Error archiving path:', this.formatError(error));
      toast.error('Failed to archive learning path');
      throw error;
    }
  }

  /**
   * Recalculate path progress based on completed steps
   */
  static async recalculateProgress(pathId: string): Promise<number> {
    try {
      this.validateId(pathId, 'path ID');

      const { data: steps, error: stepsError } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .select('status, is_required')
        .eq('path_id', pathId);

      if (stepsError) throw stepsError;

      if (!steps || steps.length === 0) return 0;

      const totalRequired = steps.filter((s: any) => s.is_required).length;
      const completedRequired = steps.filter(
        (s: any) => s.is_required && s.status === 'completed'
      ).length;

      const progress = totalRequired > 0
        ? Math.round((completedRequired / totalRequired) * 100)
        : 0;

      // Update the path's current_progress (updated_at handled by trigger)
      await (this.getSupabase() as any)
        .from('learning_paths')
        .update({
          current_progress: progress,
        })
        .eq('id', pathId);

      return progress;
    } catch (error) {
      console.error('[LearningPath] Error recalculating progress:', this.formatError(error));
      throw error;
    }
  }
}
