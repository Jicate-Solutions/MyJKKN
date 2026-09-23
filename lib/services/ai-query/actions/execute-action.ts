/**
 * AI Assistant actions — the execution step after the person clicks Confirm.
 *
 * SERVER-ONLY. Called by app/api/ai-query/actions/[id]/confirm/route.ts, and
 * ONLY after fn_ai_claim_action_proposal has succeeded under the owner's own
 * session. The claim is the gate: it locked the row, re-checked expiry, the
 * owner's permission, every recipient's visibility and the daily limit, and
 * stamped confirmed_at so a second click is refused. Nothing in this file
 * re-decides WHETHER to send — it only sends and reports what happened.
 *
 * Channel choices (lane B spec asked to pick and say why):
 *  - In-app message → fanoutNotification (lib/services/_shared/notifications/
 *    notify.ts), the only sanctioned writer of user_notifications. An
 *    idempotency key tied to the proposal id means even a replayed execution
 *    cannot create a second bell item.
 *  - Email → the shared Resend client in lib/resend.ts. Neither module the
 *    spec named actually sends: lib/services/email/email-service.ts is a stub
 *    that returns "provider integration not yet implemented", and
 *    lib/services/email-service.ts is a browser-side fetch to the BoS email
 *    queue. Every working sender in the repo (bug-report, course-welcome,
 *    meeting-booking, online-meeting invites) goes through lib/resend.ts, so
 *    this does too. One email per recipient (Resend batch = one message per
 *    `to`), so nobody sees anybody else's address.
 *  - Task → TaskService.createTask + TaskService.assign (project_tasks, the PM
 *    module). meeting_action_items needs a meeting booking and event tasks need
 *    an event; a project task is the only "give a task to a person" record
 *    that stands on its own and appears on the assignee's board. It runs on the
 *    OWNER's session client, so the insert is made AS the owner under RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { TaskService } from '@/lib/services/projects/task-service';

export type ActionKind = 'in_app_message' | 'email' | 'create_task';

/** The shape fn_ai_claim_action_proposal returns under `proposal`. */
export interface ClaimedProposal {
  id: string;
  kind: ActionKind;
  title: string;
  body: string;
  task: { project_id: string; project_title?: string | null; due_date?: string | null } | null;
  recipient_ids: string[];
  recipient_count: number;
}

export interface ActionOwner {
  id: string;
  name: string;
  email: string | null;
}

export interface ExecutionOutcome {
  status: 'sent' | 'failed';
  result: Record<string, unknown>;
  error: string | null;
}

const EMAIL_BATCH_SIZE = 100; // Resend batch limit per call

// Imported lazily: a missing RESEND_API_KEY must fail THIS email, not the
// import of the route that also serves in-app messages and tasks.
async function getResend() {
  const mod = await import('@/lib/resend');
  return mod.resend;
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
}

/** Plain-text email body: the message, then who it is from and how to reply. */
export function buildEmailText(body: string, owner: ActionOwner): string {
  const footer = owner.email
    ? `Sent on behalf of ${owner.name} through MyJKKN. Reply to this email to reach ${owner.name} directly.`
    : `Sent on behalf of ${owner.name} through MyJKKN.`;
  return `${body}\n\n—\n${footer}`;
}

async function sendInApp(
  service: SupabaseClient,
  proposal: ClaimedProposal,
  owner: ActionOwner
): Promise<ExecutionOutcome> {
  const res = await fanoutNotification(service, {
    title: proposal.title,
    body: proposal.body,
    userIds: proposal.recipient_ids,
    createdBy: owner.id,
    category: 'general',
    kind: 'announcement',
    priority: 'normal',
    source: 'ai-assistant-action',
    metadata: { ai_action_proposal_id: proposal.id, sent_on_behalf_of: owner.id },
    idempotencyKey: `ai-action:${proposal.id}`,
  });
  if (res.skipped === 'no_recipients' || res.skipped === 'no_created_by') {
    return { status: 'failed', result: { notified: 0 }, error: 'Nobody to send to.' };
  }
  const delivered = res.skipped === 'idempotent' ? proposal.recipient_ids.length : res.notified;
  return {
    status: 'sent',
    result: { delivered, total: proposal.recipient_ids.length, notification_id: res.notificationId ?? null },
    error: null,
  };
}

async function sendEmails(
  service: SupabaseClient,
  proposal: ClaimedProposal,
  owner: ActionOwner
): Promise<ExecutionOutcome> {
  if (!process.env.RESEND_API_KEY) {
    return { status: 'failed', result: { delivered: 0 }, error: 'Email is not set up on this server. Nothing was sent.' };
  }

  // Addresses are read here, server-side, with the service client — they are
  // never stored on the proposal and never returned to the browser.
  const { data: rows, error } = await service
    .from('profiles')
    .select('id, email')
    .in('id', proposal.recipient_ids);
  if (error) throw error;

  const addresses = (rows ?? [])
    .map((r: { id: string; email: string | null }) => ({ id: r.id, email: (r.email ?? '').trim() }))
    .filter((r) => r.email.length > 0);
  const missing = proposal.recipient_ids.length - addresses.length;

  const resend = await getResend();
  const text = buildEmailText(proposal.body, owner);
  let delivered = 0;
  const failures: string[] = [];

  for (let i = 0; i < addresses.length; i += EMAIL_BATCH_SIZE) {
    const chunk = addresses.slice(i, i + EMAIL_BATCH_SIZE);
    const payload = chunk.map((a) => ({
      from: fromAddress(),
      to: a.email,
      subject: proposal.title,
      text,
      ...(owner.email ? { replyTo: owner.email } : {}),
    }));
    try {
      const { error: sendErr } = await resend.batch.send(payload, {
        idempotencyKey: `ai-action-${proposal.id}-${i / EMAIL_BATCH_SIZE}`,
      });
      if (sendErr) failures.push(sendErr.message ?? 'Email provider refused the batch');
      else delivered += chunk.length;
    } catch (e) {
      failures.push(e instanceof Error ? e.message : 'Email provider error');
    }
  }

  const total = proposal.recipient_ids.length;
  const result = { delivered, total, without_address: missing };
  if (delivered === 0) {
    return { status: 'failed', result, error: failures[0] ?? 'No email could be sent.' };
  }
  return {
    status: 'sent',
    result,
    error: failures.length > 0 || missing > 0 ? `${total - delivered} of ${total} could not be emailed.` : null,
  };
}

async function createTask(
  userClient: SupabaseClient,
  service: SupabaseClient,
  proposal: ClaimedProposal,
  owner: ActionOwner
): Promise<ExecutionOutcome> {
  if (!proposal.task?.project_id || proposal.recipient_ids.length !== 1) {
    return { status: 'failed', result: {}, error: 'This task is missing its project or its person.' };
  }
  const assigneeProfileId = proposal.recipient_ids[0];
  const { data: staff, error: staffErr } = await service
    .from('staff')
    .select('id')
    .eq('profile_id', assigneeProfileId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (staffErr) throw staffErr;
  if (!staff?.id) {
    return { status: 'failed', result: {}, error: 'That person is not a staff member, so no task was created.' };
  }

  // AS the owner: the owner's session client, so RLS sees the owner.
  const task = await TaskService.createTask(userClient, {
    project_id: proposal.task.project_id,
    title: proposal.title,
    description: proposal.body,
    owner_staff_id: staff.id as string,
    due_date: proposal.task.due_date ?? null,
    metadata: { source: 'ai-assistant-action', ai_action_proposal_id: proposal.id, requested_by: owner.id },
  });
  // The task already exists with its owner set; a failed assignee row must not
  // turn a created task into a "failed" card (the person would retry and get
  // a second task), so it is reported alongside the success instead.
  let assignError: string | null = null;
  try {
    await TaskService.assign(userClient, task.id, staff.id as string, 'responsible', owner.id);
  } catch (e) {
    assignError = e instanceof Error ? e.message : 'Could not add the person to the task list';
  }

  return {
    status: 'sent',
    result: { delivered: 1, total: 1, task_id: task.id, project_id: task.project_id },
    error: assignError ? `Task created, but adding the person as assignee failed: ${assignError}` : null,
  };
}

/**
 * Execute a proposal that the owner has just confirmed (claim already done).
 * Never throws: any unexpected error becomes a `failed` outcome so the route
 * can always record what happened.
 */
export async function executeClaimedAction(args: {
  proposal: ClaimedProposal;
  owner: ActionOwner;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
}): Promise<ExecutionOutcome> {
  const { proposal, owner, userClient, serviceClient } = args;
  try {
    switch (proposal.kind) {
      case 'in_app_message':
        return await sendInApp(serviceClient, proposal, owner);
      case 'email':
        return await sendEmails(serviceClient, proposal, owner);
      case 'create_task':
        return await createTask(userClient, serviceClient, proposal, owner);
      default:
        return { status: 'failed', result: {}, error: 'Unknown kind of action.' };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Unexpected error';
    return { status: 'failed', result: {}, error: message };
  }
}
