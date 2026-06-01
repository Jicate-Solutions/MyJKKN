/**
 * Approval Workflows Service
 *
 * CRUD for project_approval_workflows and project_approval_requests.
 * - listWorkflows / getWorkflow / createWorkflow / updateWorkflow / deleteWorkflow
 * - listRequests / getRequest / createRequest / actOnRequest (approve / reject)
 *
 * Pattern: static class, SupabaseClient as first arg (matches RiskService).
 * Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F9.
 *
 * requested_by / decided_by are now wired via getCurrentActorId (profiles.id).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectApprovalWorkflow,
  ProjectApprovalRequest,
} from '@/types/projects';
import { getCurrentActorId } from '@/lib/services/projects/_actor';

// ─── Shared shape: a single step in the approval chain ──────────────────────

/** A single approver step stored inside the approval_chain JSONB array. */
export interface ApprovalStep {
  /** Display label, e.g. "Head of Department" */
  label: string;
  /** Role key or identifier, e.g. "hod" / "principal" */
  role: string;
  /** Optional display order; inferred from array index if absent. */
  order?: number;
}

// ─── Workflow input shapes ───────────────────────────────────────────────────

export interface WorkflowInsert {
  project_type_id?: string | null;
  name: string;
  trigger_action: string;
  approval_chain: ApprovalStep[];
  is_active?: boolean;
}

export interface WorkflowUpdate {
  project_type_id?: string | null;
  name?: string;
  trigger_action?: string;
  approval_chain?: ApprovalStep[];
  is_active?: boolean;
}

export interface WorkflowFilters {
  projectTypeId?: string | null;
  isActive?: boolean | null;
  triggerAction?: string | null;
}

// ─── Request input shapes ────────────────────────────────────────────────────

export interface RequestFilters {
  projectId?: string | null;
  workflowId?: string | null;
  status?: string | null;
  isEmergency?: boolean | null;
  escalationStatus?: string | null;
}

export interface RequestInsert {
  project_id: string;
  workflow_id?: string | null;
  trigger_action: string;
  snapshot_chain?: ApprovalStep[] | null;
  is_emergency?: boolean;
  escalation_status?: string;
}

export interface ActOnRequestInput {
  /** New status: 'approved' | 'rejected' | 'pending' */
  status: 'approved' | 'rejected' | 'pending';
  decision_notes?: string | null;
  /** If provided, advances current_step to this value. */
  next_step?: number | null;
}

// ─── Workflow Service ────────────────────────────────────────────────────────

export class ApprovalWorkflowService {
  static async listWorkflows(
    supabase: SupabaseClient,
    filters: WorkflowFilters = {}
  ): Promise<ProjectApprovalWorkflow[]> {
    let query = supabase
      .from('project_approval_workflows')
      .select('*')
      .order('name', { ascending: true });

    if (filters.projectTypeId !== undefined && filters.projectTypeId !== null) {
      query = query.eq('project_type_id', filters.projectTypeId);
    }
    if (filters.isActive !== undefined && filters.isActive !== null) {
      query = query.eq('is_active', filters.isActive);
    }
    if (filters.triggerAction) {
      query = query.eq('trigger_action', filters.triggerAction);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectApprovalWorkflow[];
  }

  static async getWorkflow(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectApprovalWorkflow | null> {
    const { data, error } = await supabase
      .from('project_approval_workflows')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectApprovalWorkflow | null;
  }

  static async createWorkflow(
    supabase: SupabaseClient,
    input: WorkflowInsert
  ): Promise<ProjectApprovalWorkflow> {
    const { data, error } = await supabase
      .from('project_approval_workflows')
      .insert({
        project_type_id: input.project_type_id ?? null,
        name: input.name,
        trigger_action: input.trigger_action,
        approval_chain: input.approval_chain as unknown as Record<string, unknown>,
        is_active: input.is_active ?? true,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectApprovalWorkflow;
  }

  static async updateWorkflow(
    supabase: SupabaseClient,
    id: string,
    input: WorkflowUpdate
  ): Promise<ProjectApprovalWorkflow> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.trigger_action !== undefined) patch.trigger_action = input.trigger_action;
    if (input.approval_chain !== undefined) {
      patch.approval_chain = input.approval_chain as unknown as Record<string, unknown>;
    }
    if (input.is_active !== undefined) patch.is_active = input.is_active;
    if ('project_type_id' in input) patch.project_type_id = input.project_type_id ?? null;

    const { data, error } = await supabase
      .from('project_approval_workflows')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectApprovalWorkflow;
  }

  static async deleteWorkflow(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('project_approval_workflows')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}

// ─── Approval Request Service ────────────────────────────────────────────────

export class ApprovalRequestService {
  static async listRequests(
    supabase: SupabaseClient,
    filters: RequestFilters = {}
  ): Promise<ProjectApprovalRequest[]> {
    let query = supabase
      .from('project_approval_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.workflowId) {
      query = query.eq('workflow_id', filters.workflowId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.isEmergency !== undefined && filters.isEmergency !== null) {
      query = query.eq('is_emergency', filters.isEmergency);
    }
    if (filters.escalationStatus) {
      query = query.eq('escalation_status', filters.escalationStatus);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectApprovalRequest[];
  }

  static async getRequest(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectApprovalRequest | null> {
    const { data, error } = await supabase
      .from('project_approval_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectApprovalRequest | null;
  }

  static async createRequest(
    supabase: SupabaseClient,
    input: RequestInsert
  ): Promise<ProjectApprovalRequest> {
    // requested_by → project_approval_requests.requested_by FK → profiles(id); no DB default
    const requestedBy = await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_approval_requests')
      .insert({
        project_id: input.project_id,
        workflow_id: input.workflow_id ?? null,
        trigger_action: input.trigger_action,
        snapshot_chain: input.snapshot_chain
          ? (input.snapshot_chain as unknown as Record<string, unknown>)
          : null,
        current_step: 0,
        is_emergency: input.is_emergency ?? false,
        escalation_status: input.escalation_status ?? 'none',
        status: 'pending',
        requested_by: requestedBy,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectApprovalRequest;
  }

  /**
   * Act on an approval request: approve or reject the current step.
   * Stamps decided_at; optionally advances current_step.
   * decided_by is null until auth helper is wired (see file NOTE).
   */
  static async actOnRequest(
    supabase: SupabaseClient,
    id: string,
    input: ActOnRequestInput
  ): Promise<ProjectApprovalRequest> {
    // decided_by → project_approval_requests.decided_by FK → profiles(id); no DB default
    const decidedBy = await getCurrentActorId(supabase);

    const patch: Record<string, unknown> = {
      status: input.status,
      decided_at: new Date().toISOString(),
      decision_notes: input.decision_notes ?? null,
      decided_by: decidedBy,
    };

    if (input.next_step !== null && input.next_step !== undefined) {
      patch.current_step = input.next_step;
    }

    const { data, error } = await supabase
      .from('project_approval_requests')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectApprovalRequest;
  }

  static async deleteRequest(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('project_approval_requests')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
