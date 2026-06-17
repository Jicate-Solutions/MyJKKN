// lib/services/meetings/meeting-workflow-service.ts
//
// Meeting Workflows — Module 4 (Calendly "Workflows" parity). CRUD for the
// config tables meeting_workflows + meeting_workflow_actions, executed through
// the caller-supplied RLS client (server action / route handler). RLS
// (migration 20260617000200) scopes every operation: super_admin/admin, the
// meetings.workflows.* permission keys, or host_profile_id = auth.uid().
//
// The native workflow tables are not yet in the generated Supabase types, so
// callers pass an untyped SupabaseClient (the TS2589 class — see
// app/(routes)/meetings/manage/actions.ts for the same pattern).

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type WorkflowTrigger =
  | 'on_booked'
  | 'before_meeting'
  | 'after_meeting'
  | 'on_cancelled'
  | 'on_rescheduled';

export type WorkflowChannel = 'email' | 'whatsapp';

export interface MeetingWorkflowAction {
  id: string;
  workflow_id: string;
  order_index: number;
  channel: WorkflowChannel;
  subject: string | null;
  body_template: string;
  created_at: string;
}

export interface MeetingWorkflow {
  id: string;
  host_profile_id: string;
  name: string;
  trigger: WorkflowTrigger;
  offset_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingWorkflowWithActions extends MeetingWorkflow {
  actions: MeetingWorkflowAction[];
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WorkflowInput {
  name: string;
  trigger: WorkflowTrigger;
  offset_minutes?: number;
  is_active?: boolean;
}

export interface ActionInput {
  order_index: number;
  channel: WorkflowChannel;
  subject?: string | null;
  body_template: string;
}

const TRIGGERS: WorkflowTrigger[] = [
  'on_booked',
  'before_meeting',
  'after_meeting',
  'on_cancelled',
  'on_rescheduled',
];
const CHANNELS: WorkflowChannel[] = ['email', 'whatsapp'];

// ---------------------------------------------------------------------------
// Validation helpers (defensive — RLS + DB CHECKs are the hard gate; these give
// friendly errors before round-tripping to the DB).
// ---------------------------------------------------------------------------

function validateWorkflowInput(input: WorkflowInput): string | null {
  if (!input.name || !input.name.trim()) return 'Workflow name is required.';
  if (!TRIGGERS.includes(input.trigger)) return `Invalid trigger "${input.trigger}".`;
  const off = input.offset_minutes ?? 0;
  if (!Number.isInteger(off) || off < 0) return 'Offset minutes must be a non-negative whole number.';
  return null;
}

function validateActionInput(input: ActionInput): string | null {
  if (!CHANNELS.includes(input.channel)) return `Invalid channel "${input.channel}".`;
  if (!input.body_template || !input.body_template.trim()) return 'Message body is required.';
  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MeetingWorkflowService {
  /**
   * The current user's host_profile_id == auth.uid(). Workflows are owned by
   * the profile, so the host id IS the user id.
   */
  private static async currentUserId(client: SupabaseClient): Promise<string> {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) {
      throw new Error('You are signed out. Please sign in to MyJKKN and try again.');
    }
    return user.id;
  }

  /** List the signed-in host's workflows, each with its ordered actions. */
  static async listWorkflows(
    client: SupabaseClient
  ): Promise<ServiceResult<MeetingWorkflowWithActions[]>> {
    try {
      const hostId = await this.currentUserId(client);
      const { data: workflows, error } = await client
        .from('meeting_workflows')
        .select('*')
        .eq('host_profile_id', hostId)
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: error.message };

      const list = (workflows ?? []) as MeetingWorkflow[];
      if (list.length === 0) return { success: true, data: [] };

      const ids = list.map((w) => w.id);
      const { data: actions, error: aErr } = await client
        .from('meeting_workflow_actions')
        .select('*')
        .in('workflow_id', ids)
        .order('order_index', { ascending: true });
      if (aErr) return { success: false, error: aErr.message };

      const byWorkflow = new Map<string, MeetingWorkflowAction[]>();
      for (const a of (actions ?? []) as MeetingWorkflowAction[]) {
        const arr = byWorkflow.get(a.workflow_id) ?? [];
        arr.push(a);
        byWorkflow.set(a.workflow_id, arr);
      }

      return {
        success: true,
        data: list.map((w) => ({ ...w, actions: byWorkflow.get(w.id) ?? [] })),
      };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to list workflows.' };
    }
  }

  /** Fetch one workflow (+ actions) owned by / visible to the caller. */
  static async getWorkflow(
    client: SupabaseClient,
    workflowId: string
  ): Promise<ServiceResult<MeetingWorkflowWithActions>> {
    try {
      const { data: workflow, error } = await client
        .from('meeting_workflows')
        .select('*')
        .eq('id', workflowId)
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!workflow) return { success: false, error: 'Workflow not found.' };

      const { data: actions, error: aErr } = await client
        .from('meeting_workflow_actions')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('order_index', { ascending: true });
      if (aErr) return { success: false, error: aErr.message };

      return {
        success: true,
        data: {
          ...(workflow as MeetingWorkflow),
          actions: (actions ?? []) as MeetingWorkflowAction[],
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to load workflow.' };
    }
  }

  /** Create a workflow for the signed-in host. */
  static async createWorkflow(
    client: SupabaseClient,
    input: WorkflowInput
  ): Promise<ServiceResult<MeetingWorkflow>> {
    const validation = validateWorkflowInput(input);
    if (validation) return { success: false, error: validation };
    try {
      const hostId = await this.currentUserId(client);
      const { data, error } = await client
        .from('meeting_workflows')
        .insert({
          host_profile_id: hostId,
          name: input.name.trim(),
          trigger: input.trigger,
          offset_minutes: input.offset_minutes ?? 0,
          is_active: input.is_active ?? true,
        })
        .select('*')
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data: data as MeetingWorkflow };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to create workflow.' };
    }
  }

  /** Update mutable fields of a workflow. RLS enforces ownership. */
  static async updateWorkflow(
    client: SupabaseClient,
    workflowId: string,
    input: Partial<WorkflowInput>
  ): Promise<ServiceResult<MeetingWorkflow>> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) return { success: false, error: 'Workflow name cannot be empty.' };
      patch.name = input.name.trim();
    }
    if (input.trigger !== undefined) {
      if (!TRIGGERS.includes(input.trigger)) return { success: false, error: `Invalid trigger "${input.trigger}".` };
      patch.trigger = input.trigger;
    }
    if (input.offset_minutes !== undefined) {
      if (!Number.isInteger(input.offset_minutes) || input.offset_minutes < 0)
        return { success: false, error: 'Offset minutes must be a non-negative whole number.' };
      patch.offset_minutes = input.offset_minutes;
    }
    if (input.is_active !== undefined) patch.is_active = input.is_active;
    if (Object.keys(patch).length === 0) return { success: false, error: 'Nothing to update.' };

    try {
      const { data, error } = await client
        .from('meeting_workflows')
        .update(patch)
        .eq('id', workflowId)
        .select('*')
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data: data as MeetingWorkflow };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to update workflow.' };
    }
  }

  /** Delete a workflow (cascades to actions + runs via FK ON DELETE CASCADE). */
  static async deleteWorkflow(
    client: SupabaseClient,
    workflowId: string
  ): Promise<ServiceResult<{ id: string }>> {
    try {
      const { error } = await client.from('meeting_workflows').delete().eq('id', workflowId);
      if (error) return { success: false, error: error.message };
      return { success: true, data: { id: workflowId } };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to delete workflow.' };
    }
  }

  /**
   * Replace the full ordered action list for a workflow. The builder UI sends
   * the complete desired set; we delete-then-insert so order/removal is exact.
   * RLS scopes both legs to the parent workflow's host.
   */
  static async replaceActions(
    client: SupabaseClient,
    workflowId: string,
    actions: ActionInput[]
  ): Promise<ServiceResult<MeetingWorkflowAction[]>> {
    for (const a of actions) {
      const v = validateActionInput(a);
      if (v) return { success: false, error: v };
    }
    try {
      const { error: delErr } = await client
        .from('meeting_workflow_actions')
        .delete()
        .eq('workflow_id', workflowId);
      if (delErr) return { success: false, error: delErr.message };

      if (actions.length === 0) return { success: true, data: [] };

      const rows = actions.map((a, i) => ({
        workflow_id: workflowId,
        order_index: a.order_index ?? i,
        channel: a.channel,
        subject: a.channel === 'email' ? a.subject ?? null : null,
        body_template: a.body_template,
      }));
      const { data, error } = await client
        .from('meeting_workflow_actions')
        .insert(rows)
        .select('*')
        .order('order_index', { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, data: (data ?? []) as MeetingWorkflowAction[] };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to save actions.' };
    }
  }
}
