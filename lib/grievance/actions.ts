'use server';

// lib/grievance/actions.ts
// ============================================================================
// The handler pages' status write, moved server-side so the filer can be told
// (Director ruling, 30 Sep 2026: "the person who complained gets a message
// each time something changes").
//
// AUTHORITY: the update runs on the caller's own cookie session, so
// grievance_tickets RLS still decides who may write. One difference from the
// old browser write: this action first READS the row under the caller's RLS
// (to know what changed), and then asks the update to return the row. So the
// caller needs the SELECT policy as well as the UPDATE policy. Today every
// caller already needs SELECT to open the detail page this is used from, so in
// practice nobody who could resolve before is refused now.
// Only the filer's bell is sent with the service-role client — it writes a
// notification for somebody other than the caller.
//
// A server action, not an API route: an app/api/.../[id]/route.ts would cost 2
// of the ~34 routes left under Vercel's cap (scripts/ci/check-route-budget.sh).
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { notifyFilerOfChange } from './filer-updates';
import type { FilerUpdateAfter, FilerUpdateBefore } from './complaint-display';

const MODULE = 'grievance/actions';

const VALID_STATUSES = [
  'open',
  'in_progress',
  'pending_info',
  'resolved',
  'closed',
  'reopened',
] as const;
type Status = (typeof VALID_STATUSES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AFTER_SELECT =
  'id, ticket_number, status, assigned_to, is_anonymous, raised_by_id, resolution';

export interface UpdateGrievanceStatusResult {
  success: boolean;
  error?: string;
}

export async function updateGrievanceStatusAction(
  id: string,
  input: { status: string; resolution?: string }
): Promise<UpdateGrievanceStatusResult> {
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid complaint id.' };
  if (!VALID_STATUSES.includes(input.status as Status)) {
    return { success: false, error: `Unknown status: ${input.status}` };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'You are not signed in.' };

  // Read under the caller's own RLS: a complaint they cannot see is one they
  // cannot change, and the answer is the same refusal either way.
  const { data: before, error: beforeError } = await supabase
    .from('grievance_tickets')
    .select('status, assigned_to')
    .eq('id', id)
    .maybeSingle();
  if (beforeError) {
    logger.error(MODULE, 'Before-read failed', beforeError);
    return { success: false, error: 'Could not load the complaint. Try again.' };
  }
  if (!before) {
    return {
      success: false,
      error: 'This complaint does not exist, or you do not have permission to change it.',
    };
  }

  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === 'resolved') {
    patch.resolution = input.resolution ?? null;
    patch.resolved_at = new Date().toISOString();
    // From the session, not from the browser — the resolver is whoever is
    // signed in, which is what the client used to send as profile.id anyway.
    patch.resolved_by = user.id;
  }

  const { data: after, error: updateError } = await supabase
    .from('grievance_tickets')
    .update(patch)
    .eq('id', id)
    .select(AFTER_SELECT)
    .maybeSingle();

  if (updateError) {
    logger.error(MODULE, 'Status update failed', updateError);
    return { success: false, error: updateError.message };
  }
  if (!after) {
    // RLS let them read the row but not write it.
    return { success: false, error: 'You do not have permission to change this complaint.' };
  }

  // The function, not a client: making the service-role client can throw
  // (missing key), and by now the write has committed. notifyFilerOfChange
  // makes it inside its own try, so a lost bell never reads as a failed resolve.
  await notifyFilerOfChange(createServiceRoleClient, {
    before: before as FilerUpdateBefore,
    after: after as FilerUpdateAfter,
  });

  return { success: true };
}

export interface SendBackToNormalPathResult {
  success: boolean;
  error?: string;
  /** True when no handler could be found on the normal path either. */
  unassigned?: boolean;
}

/**
 * "Send back to the normal path" (Director ruling, 9 Oct 2026): a complaint
 * ticked "about the Joint MD" by mistake goes back to ordinary routing and the
 * tick is cleared. Every rule — only the Director named in
 * grievance.escalation.about_joint_md_profile_id, not a super admin, never the
 * Joint MD; who is logged; where it goes next — lives in
 * fn_grievance_send_back_to_normal_path (migration 20271010020000), called on
 * the caller's own session so auth.uid() is the person who clicked.
 */
export async function sendBackToNormalPathAction(
  id: string,
  note?: string
): Promise<SendBackToNormalPathResult> {
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid complaint id.' };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'You are not signed in.' };

  const { data, error } = await supabase.rpc('fn_grievance_send_back_to_normal_path', {
    p_ticket_id: id,
    p_note: note?.trim() ? note.trim().slice(0, 500) : undefined,
  });
  // 42501 = the database refused this person (or the complaint does not
  // exist — the same sentence on purpose). Its message is written for them.
  if (error?.code === '42501') {
    return { success: false, error: error.message };
  }
  if (error) {
    logger.error(MODULE, 'Send back to the normal path failed', error);
    return { success: false, error: 'Could not send this complaint back. Try again.' };
  }

  const result = (data ?? {}) as { success?: boolean; error?: string; assigned_to?: string | null };
  if (result.success !== true) {
    return { success: false, error: result.error ?? 'Could not send this complaint back.' };
  }
  return { success: true, unassigned: !result.assigned_to };
}
