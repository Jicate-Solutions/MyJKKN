// ============================================================================
// Learning Path Service
// CRUD operations for learning paths and steps with progress calculation
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  LearningPath,
  LearningPathStep,
  LearningPathListResponse,
  LearningPathFilters,
  CreateLearningPathInput,
  UpdateLearningPathInput,
  CreateLearningPathStepInput,
  UpdateLearningPathStepInput,
  LearningPathStatus,
} from '@/types/learning-path';

export class LearningPathService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Validate UUID format
   */
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

  // ===========================================================================
  // LEARNING PATHS CRUD
  // ===========================================================================

  /**
   * Get all learning paths with filters and pagination
   */
  static async getLearningPaths(
    filters: LearningPathFilters = {}
  ): Promise<LearningPathListResponse> {
    try {
      if (filters.institution_id) {
        this.validateId(filters.institution_id, 'institution_id');
      }

      let query = (this.getSupabase() as any)
        .from('learning_paths')
        .select('*', { count: 'exact' });

      // Apply filters
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

      // Sorting
      const sortBy = filters.sort_by || 'created_at';
      const ascending = filters.sort_order === 'asc';
      query = query.order(sortBy, { ascending });

      // Pagination
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
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Learning path not found');

      // Fetch steps separately
      const { data: steps, error: stepsError } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .select('*')
        .eq('path_id', id)
        .order('step_number', { ascending: true });

      if (stepsError) {
        console.warn('[LearningPath] Error fetching steps:', this.formatError(stepsError));
      }

      return {
        ...data,
        steps: steps || [],
      };
    } catch (error) {
      console.error('[LearningPath] Error fetching path:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create a new learning path
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
        estimated_duration_weeks: input.estimated_duration_weeks || null,
        start_date: input.start_date || null,
        target_completion_date: input.target_completion_date || null,
        is_ai_generated: input.is_ai_generated || false,
        metadata: input.metadata || {},
        status: 'active',
        current_progress: 0,
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
   * Update a learning path
   */
  static async updateLearningPath(
    id: string,
    input: UpdateLearningPathInput
  ): Promise<LearningPath> {
    try {
      this.validateId(id, 'learning path ID');

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.target_role !== undefined) updateData.target_role = input.target_role;
      if (input.target_industry !== undefined) updateData.target_industry = input.target_industry;
      if (input.target_competencies !== undefined) updateData.target_competencies = input.target_competencies;
      if (input.current_progress !== undefined) updateData.current_progress = input.current_progress;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.estimated_duration_weeks !== undefined) updateData.estimated_duration_weeks = input.estimated_duration_weeks;
      if (input.start_date !== undefined) updateData.start_date = input.start_date;
      if (input.target_completion_date !== undefined) updateData.target_completion_date = input.target_completion_date;
      if (input.completed_at !== undefined) updateData.completed_at = input.completed_at;
      if (input.metadata !== undefined) updateData.metadata = input.metadata;

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Learning path updated');
      return data;
    } catch (error) {
      console.error('[LearningPath] Error updating path:', this.formatError(error));
      toast.error(`Failed to update learning path: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete a learning path (cascades to steps)
   */
  static async deleteLearningPath(id: string): Promise<void> {
    try {
      this.validateId(id, 'learning path ID');

      const { error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Learning path deleted');
    } catch (error) {
      console.error('[LearningPath] Error deleting path:', this.formatError(error));
      toast.error('Failed to delete learning path');
      throw error;
    }
  }

  /**
   * Archive a learning path
   */
  static async archiveLearningPath(id: string): Promise<void> {
    try {
      this.validateId(id, 'learning path ID');

      const { error } = await (this.getSupabase() as any)
        .from('learning_paths')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast.success('Learning path archived');
    } catch (error) {
      console.error('[LearningPath] Error archiving path:', this.formatError(error));
      toast.error('Failed to archive learning path');
      throw error;
    }
  }

  // ===========================================================================
  // LEARNING PATH STEPS CRUD
  // ===========================================================================

  /**
   * Get steps for a learning path
   */
  static async getSteps(pathId: string): Promise<LearningPathStep[]> {
    try {
      this.validateId(pathId, 'path ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .select('*')
        .eq('path_id', pathId)
        .order('step_number', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[LearningPath] Error fetching steps:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create a step
   */
  static async createStep(input: CreateLearningPathStepInput): Promise<LearningPathStep> {
    try {
      this.validateId(input.path_id, 'path ID');

      const insertData = {
        path_id: input.path_id,
        step_number: input.step_number,
        title: input.title,
        description: input.description || null,
        step_type: input.step_type || 'course',
        resource_id: input.resource_id || null,
        resource_type: input.resource_type || null,
        target_competencies: input.target_competencies || [],
        estimated_hours: input.estimated_hours || null,
        is_required: input.is_required !== undefined ? input.is_required : true,
        status: 'pending',
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('[LearningPath] Error creating step:', this.formatError(error));
      toast.error(`Failed to add step: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update a step
   */
  static async updateStep(
    stepId: string,
    input: UpdateLearningPathStepInput
  ): Promise<LearningPathStep> {
    try {
      this.validateId(stepId, 'step ID');

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.step_type !== undefined) updateData.step_type = input.step_type;
      if (input.step_number !== undefined) updateData.step_number = input.step_number;
      if (input.target_competencies !== undefined) updateData.target_competencies = input.target_competencies;
      if (input.estimated_hours !== undefined) updateData.estimated_hours = input.estimated_hours;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.started_at !== undefined) updateData.started_at = input.started_at;
      if (input.completed_at !== undefined) updateData.completed_at = input.completed_at;
      if (input.completion_evidence !== undefined) updateData.completion_evidence = input.completion_evidence;
      if (input.score !== undefined) updateData.score = input.score;
      if (input.mentor_notes !== undefined) updateData.mentor_notes = input.mentor_notes;
      if (input.is_required !== undefined) updateData.is_required = input.is_required;

      // If marking as in_progress, set started_at
      if (input.status === 'in_progress' && !input.started_at) {
        updateData.started_at = new Date().toISOString();
      }

      // If marking as completed, set completed_at
      if (input.status === 'completed' && !input.completed_at) {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .update(updateData)
        .eq('id', stepId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('[LearningPath] Error updating step:', this.formatError(error));
      toast.error(`Failed to update step: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete a step
   */
  static async deleteStep(stepId: string): Promise<void> {
    try {
      this.validateId(stepId, 'step ID');

      const { error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .delete()
        .eq('id', stepId);

      if (error) throw error;
    } catch (error) {
      console.error('[LearningPath] Error deleting step:', this.formatError(error));
      toast.error('Failed to delete step');
      throw error;
    }
  }

  // ===========================================================================
  // PROGRESS CALCULATION
  // ===========================================================================

  /**
   * Recalculate and update progress for a learning path based on step completion
   */
  static async recalculateProgress(pathId: string): Promise<number> {
    try {
      this.validateId(pathId, 'path ID');

      const steps = await this.getSteps(pathId);

      if (steps.length === 0) {
        return 0;
      }

      const completedSteps = steps.filter((s) => s.status === 'completed').length;
      const totalSteps = steps.length;
      const progress = Math.round((completedSteps / totalSteps) * 100 * 100) / 100;

      // Determine status based on progress
      const updateData: Record<string, unknown> = {
        current_progress: progress,
        updated_at: new Date().toISOString(),
      };

      if (progress >= 100) {
        updateData.status = 'completed';
        updateData.completed_at = new Date().toISOString();
      }

      await (this.getSupabase() as any)
        .from('learning_paths')
        .update(updateData)
        .eq('id', pathId);

      return progress;
    } catch (error) {
      console.error('[LearningPath] Error recalculating progress:', this.formatError(error));
      return 0;
    }
  }

  /**
   * Batch create steps for a learning path
   */
  static async batchCreateSteps(
    pathId: string,
    steps: Omit<CreateLearningPathStepInput, 'path_id'>[]
  ): Promise<LearningPathStep[]> {
    try {
      this.validateId(pathId, 'path ID');

      const insertData = steps.map((step, index) => ({
        path_id: pathId,
        step_number: step.step_number || index + 1,
        title: step.title,
        description: step.description || null,
        step_type: step.step_type || 'course',
        resource_id: step.resource_id || null,
        resource_type: step.resource_type || null,
        target_competencies: step.target_competencies || [],
        estimated_hours: step.estimated_hours || null,
        is_required: step.is_required !== undefined ? step.is_required : true,
        status: 'pending',
      }));

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .insert(insertData)
        .select();

      if (error) throw error;

      toast.success(`Added ${data?.length || 0} steps`);
      return data || [];
    } catch (error) {
      console.error('[LearningPath] Error batch creating steps:', this.formatError(error));
      toast.error('Failed to create steps');
      throw error;
    }
  }
}
