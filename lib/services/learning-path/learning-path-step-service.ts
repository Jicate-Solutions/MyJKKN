// ============================================================================
// Learning Path Step Service
// Handles CRUD operations for individual steps within a learning path
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  LearningPathStep,
  CreateLearningPathStepInput,
  UpdateLearningPathStepInput,
} from '@/types/learning-path';
import { LearningPathService } from './learning-path-service';

export class LearningPathStepService {
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
      console.error(`[LearningPathStep] Invalid ${fieldName}: ${actualValue}`);
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
   * Get all steps for a learning path
   */
  static async getStepsByPathId(pathId: string): Promise<LearningPathStep[]> {
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
      console.error('[LearningPathStep] Error fetching steps:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single step by ID
   */
  static async getStepById(id: string): Promise<LearningPathStep> {
    try {
      this.validateId(id, 'step ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error('Learning path step not found');
      }

      return data;
    } catch (error) {
      console.error('[LearningPathStep] Error fetching step:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create a new step in a learning path
   */
  static async createStep(input: CreateLearningPathStepInput): Promise<LearningPathStep> {
    try {
      this.validateId(input.path_id, 'path_id');

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
        status: 'pending' as const,
        is_required: input.is_required ?? true,
        // created_at and updated_at are handled by database defaults
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      // Recalculate path progress
      await LearningPathService.recalculateProgress(input.path_id);

      toast.success('Step added successfully');
      return data;
    } catch (error) {
      console.error('[LearningPathStep] Error creating step:', this.formatError(error));
      toast.error(`Failed to add step: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Update a step
   */
  static async updateStep(
    id: string,
    input: UpdateLearningPathStepInput
  ): Promise<LearningPathStep> {
    try {
      this.validateId(id, 'step ID');

      // Filter out undefined values
      const updateData: Record<string, any> = Object.fromEntries(
        Object.entries(input).filter(([_, value]) => value !== undefined)
      );

      // If marking as in_progress, set started_at
      if (input.status === 'in_progress' && !input.started_at) {
        updateData.started_at = new Date().toISOString();
      }

      // If marking as completed, set completed_at
      if (input.status === 'completed' && !input.completed_at) {
        updateData.completed_at = new Date().toISOString();
      }

      // updated_at is handled by database trigger

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Recalculate path progress if status changed
      if (input.status) {
        await LearningPathService.recalculateProgress(data.path_id);
      }

      toast.success('Step updated successfully');
      return data;
    } catch (error) {
      console.error('[LearningPathStep] Error updating step:', this.formatError(error));
      toast.error(`Failed to update step: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Delete a step
   */
  static async deleteStep(id: string): Promise<void> {
    try {
      this.validateId(id, 'step ID');

      // Get the step first to know the path_id for progress recalculation
      const step = await this.getStepById(id);

      const { error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Recalculate path progress
      await LearningPathService.recalculateProgress(step.path_id);

      toast.success('Step deleted successfully');
    } catch (error) {
      console.error('[LearningPathStep] Error deleting step:', this.formatError(error));
      toast.error('Failed to delete step');
      throw error;
    }
  }

  /**
   * Reorder steps - update step_numbers for a path
   * WARNING: This is not atomic - if it fails partway, step numbers may be inconsistent
   * TODO: Consider using a Postgres function for atomic reordering
   */
  static async reorderSteps(
    pathId: string,
    stepIds: string[]
  ): Promise<void> {
    try {
      this.validateId(pathId, 'path ID');

      // Update each step with its new step_number
      // Note: Sequential updates are not atomic
      for (let i = 0; i < stepIds.length; i++) {
        const { error } = await (this.getSupabase() as any)
          .from('learning_path_steps')
          .update({
            step_number: i + 1,
            // updated_at is handled by database trigger
          })
          .eq('id', stepIds[i])
          .eq('path_id', pathId);

        if (error) throw error;
      }

      toast.success('Steps reordered successfully');
    } catch (error) {
      console.error('[LearningPathStep] Error reordering steps:', this.formatError(error));
      toast.error('Failed to reorder steps');
      throw error;
    }
  }

  /**
   * Bulk create steps for a path
   */
  static async bulkCreateSteps(
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
        status: 'pending' as const,
        is_required: step.is_required ?? true,
        // created_at and updated_at are handled by database defaults
      }));

      const { data, error } = await (this.getSupabase() as any)
        .from('learning_path_steps')
        .insert(insertData)
        .select();

      if (error) throw error;

      // Recalculate path progress
      await LearningPathService.recalculateProgress(pathId);

      toast.success(`${data?.length || 0} steps added successfully`);
      return data || [];
    } catch (error) {
      console.error('[LearningPathStep] Error bulk creating steps:', this.formatError(error));
      toast.error(`Failed to add steps: ${this.formatError(error)}`);
      throw error;
    }
  }
}
