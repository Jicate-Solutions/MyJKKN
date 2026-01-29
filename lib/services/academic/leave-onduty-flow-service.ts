/**
 * Leave/OnDuty Approval Flow Service
 *
 * Handles approval flow configuration including:
 * - Creating and updating flows
 * - Flow matching for applications
 * - Flow validation
 * - Getting flows by institution
 *
 * @module services/academic/leave-onduty-flow-service
 * @created 2026-01-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveOndutyApprovalFlow,
  FlowCreationData,
  FlowFilters,
  CreateFlowInput,
  UpdateFlowInput,
  ValidationResult,
} from '@/types/leave-onduty';

// Helper to get untyped client for tables not yet in database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

export class LeaveOndutyFlowService {
  /**
   * Get applicable flow for an application context
   */
  static async getApplicableFlow(applicationContext: {
    institution_id: string;
    degree_id: string | null;
    department_id: string | null;
    program_id: string | null;
    semester_id: string | null;
    category: string;
    sub_category: string;
  }): Promise<LeaveOndutyApprovalFlow | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('get_applicable_approval_flow', {
      p_institution_id: applicationContext.institution_id,
      p_degree_id: applicationContext.degree_id,
      p_department_id: applicationContext.department_id,
      p_program_id: applicationContext.program_id,
      p_semester_id: applicationContext.semester_id,
      p_category: applicationContext.category,
      p_sub_category: applicationContext.sub_category,
    });

    if (error) {
      console.error('Error getting applicable flow:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new approval flow
   */
  static async createFlow(
    flowData: FlowCreationData,
    createdBy: string
  ): Promise<LeaveOndutyApprovalFlow> {
    const supabase = getSupabase();

    // Validate flow configuration
    const validation = this.validateFlowConfiguration(flowData);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid flow configuration');
    }

    const { data, error } = await supabase
      .from('leave_onduty_approval_flows')
      .insert({
        ...flowData,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create flow: ${error.message}`);
    }

    return data;
  }

  /**
   * Update an existing flow
   */
  static async updateFlow(
    flowId: string,
    updateData: UpdateFlowInput
  ): Promise<LeaveOndutyApprovalFlow> {
    const supabase = getSupabase();

    // If updating flow_steps, validate
    if (updateData.flow_steps) {
      const validation = this.validateFlowSteps(updateData.flow_steps);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid flow steps');
      }
    }

    const { data, error } = await supabase
      .from('leave_onduty_approval_flows')
      .update(updateData)
      .eq('id', flowId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update flow: ${error.message}`);
    }

    return data;
  }

  /**
   * Get flows by institution with filters
   * If institutionId is empty/null, returns all flows (for super admin)
   */
  static async getFlowsByInstitution(
    institutionId: string | null | undefined,
    filters?: FlowFilters
  ): Promise<LeaveOndutyApprovalFlow[]> {
    const supabase = getSupabase();

    let query = supabase
      .from('leave_onduty_approval_flows')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        creator:profiles(id, full_name)
      `
      )
      .order('created_at', { ascending: false });

    // Filter by institution if provided (super admin can view all by not providing institutionId)
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    // Apply filters
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters?.semester_id) {
      query = query.eq('semester_id', filters.semester_id);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch flows: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get flow by ID
   */
  static async getFlowById(flowId: string): Promise<LeaveOndutyApprovalFlow> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_approval_flows')
      .select(
        `
        *,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        creator:profiles(id, full_name)
      `
      )
      .eq('id', flowId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch flow: ${error.message}`);
    }

    return data;
  }

  /**
   * Deactivate a flow
   */
  static async deactivateFlow(flowId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_approval_flows')
      .update({ is_active: false })
      .eq('id', flowId);

    if (error) {
      throw new Error(`Failed to deactivate flow: ${error.message}`);
    }
  }

  /**
   * Activate a flow
   */
  static async activateFlow(flowId: string): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_approval_flows')
      .update({ is_active: true })
      .eq('id', flowId);

    if (error) {
      throw new Error(`Failed to activate flow: ${error.message}`);
    }
  }

  /**
   * Delete a flow
   */
  static async deleteFlow(flowId: string): Promise<void> {
    const supabase = getSupabase();

    // Check if flow is being used by any pending applications
    const { count } = await supabase
      .from('leave_onduty_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (count && count > 0) {
      throw new Error(
        'Cannot delete flow that is being used by pending applications. Deactivate instead.'
      );
    }

    const { error } = await supabase
      .from('leave_onduty_approval_flows')
      .delete()
      .eq('id', flowId);

    if (error) {
      throw new Error(`Failed to delete flow: ${error.message}`);
    }
  }

  /**
   * Validate flow configuration
   */
  static validateFlowConfiguration(flowData: FlowCreationData): ValidationResult {
    // Validate flow steps
    if (!flowData.flow_steps || flowData.flow_steps.length === 0) {
      return {
        valid: false,
        error: 'Flow must have at least one approval step',
      };
    }

    // Validate flow steps structure
    const stepsValidation = this.validateFlowSteps(flowData.flow_steps);
    if (!stepsValidation.valid) {
      return stepsValidation;
    }

    // Validate category
    if (!['leave', 'onduty', 'all'].includes(flowData.category)) {
      return {
        valid: false,
        error: 'Invalid category. Must be "leave", "onduty", or "all"',
      };
    }

    // Validate flow type
    if (!['sequential', 'parallel'].includes(flowData.flow_type)) {
      return {
        valid: false,
        error: 'Invalid flow type. Must be "sequential" or "parallel"',
      };
    }

    return { valid: true };
  }

  /**
   * Validate flow steps
   * Updated to work with custom roles from custom_roles table
   */
  private static validateFlowSteps(steps: any[]): ValidationResult {
    // Check for duplicate step orders
    const stepOrders = steps.map((s) => s.step_order);
    const uniqueOrders = new Set(stepOrders);
    if (stepOrders.length !== uniqueOrders.size) {
      return {
        valid: false,
        error: 'Duplicate step orders found. Each step must have a unique order.',
      };
    }

    // Validate each step
    for (const step of steps) {
      if (!step.step_order || step.step_order < 1) {
        return {
          valid: false,
          error: 'Step order must be a positive number',
        };
      }

      // Validate role_id (UUID from custom_roles table)
      if (!step.role_id || typeof step.role_id !== 'string' || step.role_id.trim().length === 0) {
        return {
          valid: false,
          error: 'Each step must have a valid role selected',
        };
      }

      // Validate role_name
      if (!step.role_name || typeof step.role_name !== 'string' || step.role_name.trim().length === 0) {
        return {
          valid: false,
          error: 'Each step must have a role name',
        };
      }

      // Validate approver_ids (must be array, can be empty initially but should have at least one user)
      if (!Array.isArray(step.approver_ids)) {
        return {
          valid: false,
          error: 'Approver IDs must be an array',
        };
      }

      if (step.approver_ids.length === 0) {
        return {
          valid: false,
          error: 'Each step must have at least one approver selected',
        };
      }

      if (typeof step.is_required !== 'boolean') {
        return {
          valid: false,
          error: 'is_required must be a boolean value',
        };
      }
    }

    // Ensure steps are ordered consecutively starting from 1
    const sortedOrders = [...stepOrders].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i + 1) {
        return {
          valid: false,
          error: 'Step orders must be consecutive starting from 1',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check for conflicting flows
   */
  static async checkConflictingFlows(
    institutionId: string,
    departmentId: string | null,
    semesterId: string | null,
    category: string,
    subCategory: string | null
  ): Promise<LeaveOndutyApprovalFlow[]> {
    const supabase = getSupabase();

    let query = supabase
      .from('leave_onduty_approval_flows')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('category', category)
      .eq('is_active', true);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      query = query.is('department_id', null);
    }

    if (semesterId) {
      query = query.eq('semester_id', semesterId);
    } else {
      query = query.is('semester_id', null);
    }

    if (subCategory) {
      query = query.eq('sub_category', subCategory);
    } else {
      query = query.is('sub_category', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking conflicts:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get flow statistics
   */
  static async getFlowStatistics(
    institutionId: string
  ): Promise<{
    total_flows: number;
    active_flows: number;
    by_type: { sequential: number; parallel: number };
    by_category: { leave: number; onduty: number; all: number };
  }> {
    const supabase = getSupabase();

    const { data: flows } = await supabase
      .from('leave_onduty_approval_flows')
      .select('*')
      .eq('institution_id', institutionId);

    if (!flows) {
      return {
        total_flows: 0,
        active_flows: 0,
        by_type: { sequential: 0, parallel: 0 },
        by_category: { leave: 0, onduty: 0, all: 0 },
      };
    }

    const activeFlows = flows.filter((f) => f.is_active);

    return {
      total_flows: flows.length,
      active_flows: activeFlows.length,
      by_type: {
        sequential: flows.filter((f) => f.flow_type === 'sequential').length,
        parallel: flows.filter((f) => f.flow_type === 'parallel').length,
      },
      by_category: {
        leave: flows.filter((f) => f.category === 'leave').length,
        onduty: flows.filter((f) => f.category === 'onduty').length,
        all: flows.filter((f) => f.category === 'all').length,
      },
    };
  }
}
