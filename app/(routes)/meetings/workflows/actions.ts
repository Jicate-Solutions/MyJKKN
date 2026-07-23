'use server';

// app/(routes)/meetings/workflows/actions.ts
//
// Server actions for the Meeting Workflows admin pages (Module 4). Thin
// wrappers around MeetingWorkflowService executed with the RLS-scoped server
// client — RLS (migration 20260617000200) scopes every operation to the
// signed-in host (or admin / meetings.workflows.* permission holders).
//
// The native workflow tables aren't in generated types yet, so we cast the
// client to an untyped SupabaseClient (the same TS2589 workaround used by
// ../manage/actions.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  MeetingWorkflowService,
  type ActionInput,
  type MeetingWorkflow,
  type MeetingWorkflowWithActions,
  type ServiceResult,
  type WorkflowInput,
} from '@/lib/services/meetings/meeting-workflow-service';

async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export async function listWorkflowsAction(): Promise<ServiceResult<MeetingWorkflowWithActions[]>> {
  const client = await untypedClient();
  return MeetingWorkflowService.listWorkflows(client);
}

export async function getWorkflowAction(
  workflowId: string
): Promise<ServiceResult<MeetingWorkflowWithActions>> {
  const client = await untypedClient();
  return MeetingWorkflowService.getWorkflow(client, workflowId);
}

export async function createWorkflowAction(
  input: WorkflowInput
): Promise<ServiceResult<MeetingWorkflow>> {
  const client = await untypedClient();
  const result = await MeetingWorkflowService.createWorkflow(client, input);
  if (result.success) revalidatePath('/meetings/workflows');
  return result;
}

export async function updateWorkflowAction(
  workflowId: string,
  input: Partial<WorkflowInput>
): Promise<ServiceResult<MeetingWorkflow>> {
  const client = await untypedClient();
  const result = await MeetingWorkflowService.updateWorkflow(client, workflowId, input);
  if (result.success) {
    revalidatePath('/meetings/workflows');
    revalidatePath(`/meetings/workflows/${workflowId}`);
  }
  return result;
}

export async function deleteWorkflowAction(
  workflowId: string
): Promise<ServiceResult<{ id: string }>> {
  const client = await untypedClient();
  const result = await MeetingWorkflowService.deleteWorkflow(client, workflowId);
  if (result.success) revalidatePath('/meetings/workflows');
  return result;
}

/** Save a workflow's settings AND its full ordered action list in one call. */
export async function saveWorkflowAction(
  workflowId: string,
  settings: Partial<WorkflowInput>,
  actions: ActionInput[]
): Promise<ServiceResult<MeetingWorkflowWithActions>> {
  const client = await untypedClient();

  const settingsResult = await MeetingWorkflowService.updateWorkflow(client, workflowId, settings);
  if (!settingsResult.success) return { success: false, error: settingsResult.error };

  const actionsResult = await MeetingWorkflowService.replaceActions(client, workflowId, actions);
  if (!actionsResult.success) return { success: false, error: actionsResult.error };

  revalidatePath('/meetings/workflows');
  revalidatePath(`/meetings/workflows/${workflowId}`);
  return MeetingWorkflowService.getWorkflow(client, workflowId);
}
