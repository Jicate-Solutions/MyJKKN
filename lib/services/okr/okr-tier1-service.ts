// ============================================================================
// OKR TIER 1 Service - Dependencies, Tasks (RACI), Risks
// Handles CRUD operations for TIER 1 OKR features
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OKRDependency,
  OKRTask,
  OKRRisk,
  CreateOKRDependencyDTO,
  CreateOKRTaskDTO,
  CreateOKRRiskDTO,
  DependencyStatus,
  RiskLevel
} from '@/types/okr';

// ============================================================================
// UUID VALIDATION HELPER
// ============================================================================

/**
 * Validates if a string is a valid UUID v4 format
 */
function isValidUUID(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// ============================================================================
// DEPENDENCIES SERVICE
// ============================================================================

export class OKRDependencyService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get dependencies for an objective
   */
  static async getDependenciesByObjective(
    objectiveId: string
  ): Promise<OKRDependency[]> {
    if (!isValidUUID(objectiveId)) {
      throw new Error(`[OKR] Invalid objectiveId: ${objectiveId}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_dependencies')
        .select(`
          *,
          owner_user:profiles!owner_user_id(id, first_name, last_name, email),
          owner_department:departments!owner_department_id(id, department_name)
        `)
        .eq('objective_id', objectiveId)
        .order('required_by_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching dependencies:', error?.message || error?.code || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Create new dependency
   */
  static async createDependency(
    input: CreateOKRDependencyDTO
  ): Promise<OKRDependency> {
    if (!isValidUUID(input.objective_id)) {
      throw new Error(`[OKR] Invalid objective_id: ${input.objective_id}`);
    }
    if (input.owner_user_id && !isValidUUID(input.owner_user_id)) {
      throw new Error(`[OKR] Invalid owner_user_id: ${input.owner_user_id}`);
    }
    if (input.owner_department_id && !isValidUUID(input.owner_department_id)) {
      throw new Error(`[OKR] Invalid owner_department_id: ${input.owner_department_id}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_dependencies')
        .insert([{
          ...input,
          status: 'pending'
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Dependency added');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error creating dependency:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to add dependency');
      throw error;
    }
  }

  /**
   * Update dependency status
   */
  static async updateDependencyStatus(
    id: string,
    status: DependencyStatus,
    resolutionNotes?: string
  ): Promise<OKRDependency> {
    if (!isValidUUID(id)) {
      throw new Error(`[OKR] Invalid dependency id: ${id}`);
    }

    try {
      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'completed') {
        updateData.resolved_at = new Date().toISOString();
      }
      if (resolutionNotes) {
        updateData.resolution_notes = resolutionNotes;
      }

      const { data, error } = await (this.supabase as any)
        .from('okr_dependencies')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Dependency updated');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error updating dependency:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to update dependency');
      throw error;
    }
  }

  /**
   * Delete dependency
   */
  static async deleteDependency(id: string): Promise<void> {
    if (!isValidUUID(id)) {
      throw new Error(`[OKR] Invalid dependency id: ${id}`);
    }

    try {
      const { error } = await (this.supabase as any)
        .from('okr_dependencies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Dependency removed');
    } catch (error: any) {
      console.error('[OKR] Error deleting dependency:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to remove dependency');
      throw error;
    }
  }
}

// ============================================================================
// TASKS (RACI) SERVICE
// ============================================================================

export class OKRTaskService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get tasks for an objective
   */
  static async getTasksByObjective(objectiveId: string): Promise<OKRTask[]> {
    if (!isValidUUID(objectiveId)) {
      throw new Error(`[OKR] Invalid objectiveId: ${objectiveId}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_tasks')
        .select(`
          *,
          responsible:profiles!responsible_id(id, first_name, last_name, email),
          accountable:profiles!accountable_id(id, first_name, last_name, email),
          key_result:okr_key_results(id, title)
        `)
        .eq('objective_id', objectiveId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching tasks:', error?.message || error?.code || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Create new task
   */
  static async createTask(input: CreateOKRTaskDTO): Promise<OKRTask> {
    if (!isValidUUID(input.objective_id)) {
      throw new Error(`[OKR] Invalid objective_id: ${input.objective_id}`);
    }
    if (input.key_result_id && !isValidUUID(input.key_result_id)) {
      throw new Error(`[OKR] Invalid key_result_id: ${input.key_result_id}`);
    }
    if (input.responsible_id && !isValidUUID(input.responsible_id)) {
      throw new Error(`[OKR] Invalid responsible_id: ${input.responsible_id}`);
    }
    if (input.accountable_id && !isValidUUID(input.accountable_id)) {
      throw new Error(`[OKR] Invalid accountable_id: ${input.accountable_id}`);
    }

    try {
      // Get max order_index for this objective
      const { data: existing } = await (this.supabase as any)
        .from('okr_tasks')
        .select('order_index')
        .eq('objective_id', input.objective_id)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextIndex = existing?.[0]?.order_index
        ? existing[0].order_index + 1
        : 0;

      const { data, error } = await (this.supabase as any)
        .from('okr_tasks')
        .insert([{
          ...input,
          status: 'not_started',
          order_index: nextIndex
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Task added');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error creating task:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to add task');
      throw error;
    }
  }

  /**
   * Update task
   */
  static async updateTask(
    id: string,
    input: Partial<CreateOKRTaskDTO & { status: string }>
  ): Promise<OKRTask> {
    if (!isValidUUID(id)) {
      throw new Error(`[OKR] Invalid task id: ${id}`);
    }
    if (input.objective_id && !isValidUUID(input.objective_id)) {
      throw new Error(`[OKR] Invalid objective_id: ${input.objective_id}`);
    }
    if (input.key_result_id && !isValidUUID(input.key_result_id)) {
      throw new Error(`[OKR] Invalid key_result_id: ${input.key_result_id}`);
    }
    if (input.responsible_id && !isValidUUID(input.responsible_id)) {
      throw new Error(`[OKR] Invalid responsible_id: ${input.responsible_id}`);
    }
    if (input.accountable_id && !isValidUUID(input.accountable_id)) {
      throw new Error(`[OKR] Invalid accountable_id: ${input.accountable_id}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_tasks')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Task updated');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error updating task:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to update task');
      throw error;
    }
  }

  /**
   * Delete task
   */
  static async deleteTask(id: string): Promise<void> {
    if (!isValidUUID(id)) {
      throw new Error(`[OKR] Invalid task id: ${id}`);
    }

    try {
      const { error } = await (this.supabase as any)
        .from('okr_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Task removed');
    } catch (error: any) {
      console.error('[OKR] Error deleting task:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to remove task');
      throw error;
    }
  }

  /**
   * Reorder tasks
   */
  static async reorderTasks(
    objectiveId: string,
    orderedIds: string[]
  ): Promise<void> {
    if (!isValidUUID(objectiveId)) {
      throw new Error(`[OKR] Invalid objectiveId: ${objectiveId}`);
    }
    for (const taskId of orderedIds) {
      if (!isValidUUID(taskId)) {
        throw new Error(`[OKR] Invalid task id in orderedIds: ${taskId}`);
      }
    }

    try {
      const updates = orderedIds.map((id, index) => ({
        id,
        order_index: index
      }));

      for (const update of updates) {
        await (this.supabase as any)
          .from('okr_tasks')
          .update({ order_index: update.order_index })
          .eq('id', update.id);
      }

      toast.success('Tasks reordered');
    } catch (error: any) {
      console.error('[OKR] Error reordering tasks:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to reorder tasks');
      throw error;
    }
  }
}

// ============================================================================
// RISKS SERVICE
// ============================================================================

export class OKRRiskService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get risks for an objective
   */
  static async getRisksByObjective(objectiveId: string): Promise<OKRRisk[]> {
    if (!isValidUUID(objectiveId)) {
      throw new Error(`[OKR] Invalid objectiveId: ${objectiveId}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_risks')
        .select(`
          *,
          owner:profiles!owner_id(id, first_name, last_name, email)
        `)
        .eq('objective_id', objectiveId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching risks:', error?.message || error?.code || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Create new risk
   */
  static async createRisk(input: CreateOKRRiskDTO): Promise<OKRRisk> {
    if (!isValidUUID(input.objective_id)) {
      throw new Error(`[OKR] Invalid objective_id: ${input.objective_id}`);
    }
    if (input.owner_id && !isValidUUID(input.owner_id)) {
      throw new Error(`[OKR] Invalid owner_id: ${input.owner_id}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_risks')
        .insert([{
          ...input,
          status: 'identified'
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Risk added');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error creating risk:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to add risk');
      throw error;
    }
  }

  /**
   * Update risk
   */
  static async updateRisk(
    id: string,
    input: Partial<CreateOKRRiskDTO & { status: string }>
  ): Promise<OKRRisk> {
    if (!isValidUUID(id)) {
      throw new Error(`[OKR] Invalid risk id: ${id}`);
    }
    if (input.objective_id && !isValidUUID(input.objective_id)) {
      throw new Error(`[OKR] Invalid objective_id: ${input.objective_id}`);
    }
    if (input.owner_id && !isValidUUID(input.owner_id)) {
      throw new Error(`[OKR] Invalid owner_id: ${input.owner_id}`);
    }

    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_risks')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Risk updated');
      return data;
    } catch (error: any) {
      console.error('[OKR] Error updating risk:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to update risk');
      throw error;
    }
  }

  /**
   * Delete risk
   */
  static async deleteRisk(id: string): Promise<void> {
    if (!isValidUUID(id)) {
      throw new Error(`[OKR] Invalid risk id: ${id}`);
    }

    try {
      const { error } = await (this.supabase as any)
        .from('okr_risks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Risk removed');
    } catch (error: any) {
      console.error('[OKR] Error deleting risk:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to remove risk');
      throw error;
    }
  }

  /**
   * Get risk severity score (likelihood x impact)
   */
  static getRiskSeverity(likelihood: RiskLevel, impact: RiskLevel): number {
    const levels = { low: 1, medium: 2, high: 3 };
    return levels[likelihood] * levels[impact];
  }

  /**
   * Get risk priority color
   */
  static getRiskColor(likelihood: RiskLevel, impact: RiskLevel): string {
    const severity = this.getRiskSeverity(likelihood, impact);
    if (severity >= 6) return 'destructive'; // High risk
    if (severity >= 3) return 'warning'; // Medium risk
    return 'default'; // Low risk
  }
}
