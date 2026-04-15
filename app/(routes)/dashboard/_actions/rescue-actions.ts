/**
 * Dashboard v2 — Broadcast Rescue Server Actions
 *
 * Called from <form action={...}> in decision-queue-item.tsx (rescue type).
 * Two flows:
 *   - Director initiates broadcast  → initiateRescueBroadcast (fans out to counselors)
 *   - Counselor claims broadcast   → claimRescueBroadcast (SELECT FOR UPDATE race)
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.3, §7.3
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Director action: Broadcast rescue for a cold lead
// ============================================================================
export async function initiateRescueBroadcast(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '');
  const userNotificationId = String(formData.get('userNotificationId') ?? '');
  const isEmergencyRaw = formData.get('isEmergency') as string | null;
  const isEmergency = isEmergencyRaw === 'true' || isEmergencyRaw === 'on';
  const message = (formData.get('message') as string) || null;
  const scopeRaw = formData.get('scope') as string | null;
  const scope = scopeRaw ? JSON.parse(scopeRaw) : {};

  if (!leadId) {
    console.warn('[dashboard/rescue] initiate missing lead_id');
    return;
  }

  try {
    const supabase = await createClient();

    // Step 1: initiate the broadcast
    const { data: broadcastData, error: broadcastError } = await supabase.rpc(
      'fn_rescue_broadcast_initiate',
      {
        p_lead_id: leadId,
        p_scope: scope,
        p_message: message,
        p_is_emergency: isEmergency
      }
    );

    if (broadcastError) {
      console.error('[dashboard/rescue] initiate error:', broadcastError);
      return;
    }

    console.log('[dashboard/rescue] broadcast initiated', broadcastData);

    // Step 2: acknowledge Director's own queue item
    if (userNotificationId) {
      await supabase.rpc('fn_dashboard_queue_action', {
        p_user_notification_id: userNotificationId,
        p_action: 'approve',
        p_note: `Broadcast initiated: ${JSON.stringify(broadcastData)}`,
        p_delegate_to: null,
        p_snooze_minutes: null,
        p_idempotency_key: `${userNotificationId}:broadcast:initiated`
      });
    }

    revalidatePath('/dashboard');
  } catch (err) {
    console.error('[dashboard/rescue] unexpected initiate error:', err);
  }
}

// ============================================================================
// Counselor action: Claim a broadcast (first-to-commit wins via SELECT FOR UPDATE)
// ============================================================================
export async function claimRescueBroadcast(formData: FormData): Promise<void> {
  const broadcastId = String(formData.get('broadcastId') ?? '');
  const userNotificationId = String(formData.get('userNotificationId') ?? '');

  if (!broadcastId) {
    console.warn('[dashboard/rescue] claim missing broadcast_id');
    return;
  }

  try {
    const supabase = await createClient();

    const { data: claimData, error: claimError } = await supabase.rpc(
      'fn_rescue_broadcast_claim',
      { p_broadcast_id: broadcastId }
    );

    if (claimError) {
      console.error('[dashboard/rescue] claim error:', claimError);
      return;
    }

    console.log('[dashboard/rescue] claim result', claimData);

    // If claim won, user_notification already marked acked by the RPC.
    // If claim lost, leave the user_notification — it'll expire naturally (expires_at set by RPC).
    if (userNotificationId) {
      await supabase.rpc('fn_dashboard_queue_action', {
        p_user_notification_id: userNotificationId,
        p_action: 'acknowledge',
        p_note: `Claim attempt: ${JSON.stringify(claimData)}`,
        p_delegate_to: null,
        p_snooze_minutes: null,
        p_idempotency_key: `${userNotificationId}:claim:attempted`
      });
    }

    revalidatePath('/dashboard');
  } catch (err) {
    console.error('[dashboard/rescue] unexpected claim error:', err);
  }
}
