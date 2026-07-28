/**
 * HR Form-submission Notification Service.
 *
 * Wave 3 — M9 follow-up (workflow engine + WhatsApp). Server-only.
 *
 * Resolves approvers from a workflow step's `required_role`, then fans out
 * notifications across in-app + WhatsApp channels based on `notify_channels`.
 *
 * Channel wiring:
 *   - in_app   → notifications + user_notifications rows (same pattern as
 *                lib/services/staff/notification-service.ts).
 *   - whatsapp → lib/services/whatsapp/whatsapp-api-client.ts → sendTextMessage.
 *                Looks up recipient phone from profiles.phone_number.
 *                Silently no-ops if profile has no phone — does NOT throw.
 *   - email    → not yet wired (no SMTP infra in repo); falls through to
 *                in_app + console.warn so callers can see the gap.
 *   - sms      → not yet wired; same fallthrough behaviour.
 *
 * Templates come from platform_policies row `hr.forms.notification_templates`
 * (seeded by 20260614_hr_forms_notification_policy.sql). Director-editable.
 *
 * Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9 (follow-up)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_KEYS } from '@/lib/policies/keys';
import type {
  ApprovalWorkflowStep,
  HrForm,
  HrFormSubmission,
} from '@/types/hr-forms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Event identifiers used to look up templates in the policy object. */
export type NotificationEvent =
  | 'submitted_to_first_approver'
  | 'submitted_to_next_approver'
  | 'approved_to_submitter'
  | 'rejected_to_submitter'
  | 'approved_final_to_submitter';

interface TemplateEntry {
  in_app_title: string;
  in_app_body: string;
  whatsapp_body: string;
}

type TemplateMap = Record<NotificationEvent, TemplateEntry>;

/** Placeholder context for template rendering. */
export interface NotificationContext {
  form_title: string;
  submitter_name: string;
  step_label: string;
  actor_name: string;
  reason: string;
  submission_url: string;
}

/** Hardcoded fallback templates used if the policy row is missing or malformed. */
const FALLBACK_TEMPLATES: TemplateMap = {
  submitted_to_first_approver: {
    in_app_title: 'Form awaiting your approval',
    in_app_body:
      '{submitter_name} submitted {form_title}. You are the approver at step "{step_label}".',
    whatsapp_body:
      'Hi, {submitter_name} submitted the {form_title}. You are the approver at step "{step_label}". Please review on JKKN.',
  },
  submitted_to_next_approver: {
    in_app_title: 'Form moved to your approval queue',
    in_app_body:
      '{form_title} from {submitter_name} has advanced to step "{step_label}". Please review.',
    whatsapp_body:
      '{form_title} from {submitter_name} has advanced to step "{step_label}". Please review on JKKN.',
  },
  approved_to_submitter: {
    in_app_title: 'Form step approved',
    in_app_body:
      '{actor_name} approved step "{step_label}" of your {form_title}. It is moving to the next approver.',
    whatsapp_body:
      'Update: {actor_name} approved step "{step_label}" of your {form_title}. It is moving to the next approver.',
  },
  rejected_to_submitter: {
    in_app_title: 'Form rejected',
    in_app_body:
      '{actor_name} rejected your {form_title} at step "{step_label}". Reason: {reason}',
    whatsapp_body:
      'Your {form_title} was rejected at step "{step_label}" by {actor_name}. Reason: {reason}',
  },
  approved_final_to_submitter: {
    in_app_title: 'Form fully approved',
    in_app_body:
      'Your {form_title} has been approved through all steps. {actor_name} signed off on the final step.',
    whatsapp_body:
      'Good news — your {form_title} is fully approved. {actor_name} signed off on the final step.',
  },
};

// ---------------------------------------------------------------------------
// Template loading
// ---------------------------------------------------------------------------

async function loadTemplates(supabase: SupabaseClient): Promise<TemplateMap> {
  try {
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: POLICY_KEYS.HR_FORMS_NOTIFICATION_TEMPLATES,
      p_scope_id: null,
    });
    if (error || !data || typeof data !== 'object') {
      return FALLBACK_TEMPLATES;
    }
    // Merge policy values over fallbacks so missing events still render.
    const merged: TemplateMap = { ...FALLBACK_TEMPLATES };
    for (const event of Object.keys(merged) as NotificationEvent[]) {
      const entry = (data as Record<string, unknown>)[event];
      if (entry && typeof entry === 'object') {
        merged[event] = { ...merged[event], ...(entry as TemplateEntry) };
      }
    }
    return merged;
  } catch (err) {
    console.warn('[form-submission-notifications] template load failed', err);
    return FALLBACK_TEMPLATES;
  }
}

function renderTemplate(tpl: string, ctx: NotificationContext): string {
  return tpl
    .replace(/\{form_title\}/g, ctx.form_title)
    .replace(/\{submitter_name\}/g, ctx.submitter_name)
    .replace(/\{step_label\}/g, ctx.step_label)
    .replace(/\{actor_name\}/g, ctx.actor_name)
    .replace(/\{reason\}/g, ctx.reason)
    .replace(/\{submission_url\}/g, ctx.submission_url);
}

// ---------------------------------------------------------------------------
// Approver resolution
// ---------------------------------------------------------------------------

/**
 * Resolve profile IDs of users who hold the given role_key. RLS-aware: the
 * caller decides which SupabaseClient to pass. For service-role fan-out
 * (cron / API routes), pass createServiceRoleClient(); for end-user flows
 * leave it to the authenticated client.
 *
 * Returns deduped profile ids; empty array if the role doesn't exist or has
 * no assignments.
 */
export async function resolveApproversByRoleKey(
  supabase: SupabaseClient,
  roleKey: string,
  institutionId?: string | null,
): Promise<string[]> {
  if (!roleKey?.trim()) return [];

  // 1. Look up the role_id by role_key from custom_roles.
  const { data: role, error: roleErr } = await supabase
    .from('custom_roles')
    .select('id')
    .eq('role_key', roleKey)
    .maybeSingle();

  if (roleErr || !role?.id) return [];

  // 2. Fan out to user_roles → profile_id.
  // Institution-scope filter is best-effort: if user_roles has no institution_id
  // or the field is NULL on the row, include it (global assignment).
  const { data: assignments, error: assignErr } = await supabase
    .from('user_roles')
    .select('user_id, institution_id')
    .eq('role_id', role.id);
  if (assignErr || !assignments) return [];

  const uniq = new Set<string>();
  for (const row of assignments as Array<{ user_id: string; institution_id: string | null }>) {
    if (institutionId && row.institution_id && row.institution_id !== institutionId) {
      continue;
    }
    if (row.user_id) uniq.add(row.user_id);
  }
  return Array.from(uniq);
}

// ---------------------------------------------------------------------------
// Profile lookup helpers
// ---------------------------------------------------------------------------

interface ProfileLite {
  id: string;
  full_name: string | null;
  phone_number: string | null;
}

async function fetchProfilesLite(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, ProfileLite>> {
  const out = new Map<string, ProfileLite>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone_number')
    .in('id', ids);
  if (error || !data) return out;
  for (const p of data as ProfileLite[]) out.set(p.id, p);
  return out;
}

// ---------------------------------------------------------------------------
// Channel dispatchers
// ---------------------------------------------------------------------------

async function dispatchInApp(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<number> {
  if (userIds.length === 0) return 0;
  try {
    const { data: notif, error } = await supabase
      .from('notifications')
      .insert({
        title,
        body: message,
        category: 'hr_form',
        created_by: userIds[0],
        targeting: { type: 'user', user_ids: userIds },
        metadata: { source: 'hr_form_submission', ...metadata },
      })
      .select('id')
      .single();
    if (error || !notif?.id) {
      console.error('[form-submission-notifications] notifications insert failed', error);
      return 0;
    }
    const links = userIds.map((uid) => ({
      notification_id: notif.id,
      user_id: uid,
    }));
    const { error: linkErr } = await supabase.from('user_notifications').insert(links);
    if (linkErr) {
      console.error('[form-submission-notifications] user_notifications insert failed', linkErr);
      return 0;
    }
    return userIds.length;
  } catch (err) {
    console.error('[form-submission-notifications] in_app dispatch threw', err);
    return 0;
  }
}

async function dispatchWhatsApp(
  profiles: ProfileLite[],
  body: string,
): Promise<number> {
  if (profiles.length === 0) return 0;
  // Lazy import so non-WhatsApp paths don't pay the cost.
  let sendTextMessage: ((to: string, text: string) => Promise<unknown>) | null = null;
  try {
    const mod = await import('@/lib/services/whatsapp/whatsapp-api-client');
    sendTextMessage = mod.sendTextMessage as typeof sendTextMessage;
  } catch (err) {
    console.warn('[form-submission-notifications] whatsapp client import failed', err);
    return 0;
  }
  let sent = 0;
  for (const p of profiles) {
    if (!p.phone_number) continue;
    try {
      await sendTextMessage!(p.phone_number, body);
      sent += 1;
    } catch (err) {
      // Silent best-effort per channel; logging only.
      console.warn(
        `[form-submission-notifications] whatsapp send to ${p.phone_number} failed`,
        err,
      );
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Public dispatch entry point
// ---------------------------------------------------------------------------

export interface DispatchSummary {
  in_app_sent: number;
  whatsapp_sent: number;
  email_skipped: number;
  sms_skipped: number;
}

interface DispatchInput {
  supabase: SupabaseClient;
  event: NotificationEvent;
  recipientIds: string[];
  channels: Array<'whatsapp' | 'email' | 'in_app' | 'sms'>;
  context: NotificationContext;
  metadata?: Record<string, unknown>;
}

export async function dispatchFormNotification(
  input: DispatchInput,
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    in_app_sent: 0,
    whatsapp_sent: 0,
    email_skipped: 0,
    sms_skipped: 0,
  };
  if (input.recipientIds.length === 0) return summary;

  const templates = await loadTemplates(input.supabase);
  const tpl = templates[input.event];
  const title = renderTemplate(tpl.in_app_title, input.context);
  const body = renderTemplate(tpl.in_app_body, input.context);
  const waBody = renderTemplate(tpl.whatsapp_body, input.context);

  const profiles = await fetchProfilesLite(input.supabase, input.recipientIds);

  // In-app default — always fire when in_app is requested (or if no channels
  // configured, default to in-app so notifications still reach the user).
  const channels = input.channels.length > 0 ? input.channels : ['in_app'];

  if (channels.includes('in_app')) {
    summary.in_app_sent = await dispatchInApp(
      input.supabase,
      input.recipientIds,
      title,
      body,
      { event: input.event, ...input.metadata },
    );
  }
  if (channels.includes('whatsapp')) {
    summary.whatsapp_sent = await dispatchWhatsApp(
      Array.from(profiles.values()),
      waBody,
    );
  }
  if (channels.includes('email')) {
    // No SMTP wired yet — log a stub so consumers can see the gap.
    summary.email_skipped = input.recipientIds.length;
    console.warn(
      '[form-submission-notifications] email channel requested but no SMTP infra; skipping',
    );
  }
  if (channels.includes('sms')) {
    summary.sms_skipped = input.recipientIds.length;
    console.warn(
      '[form-submission-notifications] sms channel requested but no SMS infra; skipping',
    );
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Convenience wrappers wired to workflow events
// ---------------------------------------------------------------------------

/**
 * Notify the approver(s) at the active workflow step.
 *
 * - `event === 'submitted_to_first_approver'` when current_step was just set
 *   to 1 (fresh submission).
 * - `event === 'submitted_to_next_approver'` when advancing onto a non-first
 *   step.
 *
 * Returns the per-channel summary so caller can persist a delivery audit
 * trail if desired.
 */
export async function notifyApproversForStep(
  supabase: SupabaseClient,
  form: HrForm,
  submission: HrFormSubmission,
  step: ApprovalWorkflowStep,
  submitterName: string,
  event: 'submitted_to_first_approver' | 'submitted_to_next_approver',
  submissionUrl: string,
): Promise<DispatchSummary> {
  const approverIds = await resolveApproversByRoleKey(
    supabase,
    step.required_role,
    submission.institution_id,
  );

  return dispatchFormNotification({
    supabase,
    event,
    recipientIds: approverIds,
    channels: step.notify_channels ?? ['in_app', 'whatsapp'],
    context: {
      form_title: form.form_title,
      submitter_name: submitterName,
      step_label: step.label,
      actor_name: '',
      reason: '',
      submission_url: submissionUrl,
    },
    metadata: {
      submission_id: submission.id,
      form_id: form.id,
      step_order: step.order,
    },
  });
}

/**
 * Notify the submitter of an approval / rejection / final-approval event.
 */
export async function notifySubmitterOfAction(
  supabase: SupabaseClient,
  form: HrForm,
  submission: HrFormSubmission,
  step: ApprovalWorkflowStep | null,
  event: 'approved_to_submitter' | 'rejected_to_submitter' | 'approved_final_to_submitter',
  actorName: string,
  reason: string,
  submitterName: string,
  submissionUrl: string,
): Promise<DispatchSummary> {
  return dispatchFormNotification({
    supabase,
    event,
    recipientIds: [submission.submitted_by],
    channels: ['in_app', 'whatsapp'],
    context: {
      form_title: form.form_title,
      submitter_name: submitterName,
      step_label: step?.label ?? '',
      actor_name: actorName,
      reason,
      submission_url: submissionUrl,
    },
    metadata: {
      submission_id: submission.id,
      form_id: form.id,
      step_order: step?.order ?? null,
    },
  });
}
