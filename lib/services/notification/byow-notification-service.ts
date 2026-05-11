// lib/services/notification/byow-notification-service.ts
//
// Spec 3 H4 — BYOW stale-connection notification dispatcher.
//
// Called from the connection-pulse cron (lib/services/whatsapp/whatsapp-connection-pulse.ts)
// each time a connection transitions newly stale. Resolves recipients within
// the department's institution and inserts in-app notification rows
// (notifications + user_notifications fan-out) for each.
//
// Recipient resolution per spec §8 Round 2.4 (`wa_byow.disconnect_notify_roles`):
//   - profile.role IN ('admin','staff') resolves to LC role 'senior_learner_advisor'
//     (lib/learners-council/lc-roles.ts:38).
//   - profile.role = 'hod' is also explicitly named in the policy.
//
// Per-recipient sends are wrapped in try/catch — one bad recipient must not
// block the rest. Individual failures emit a Sentry capture under the
// `feature: 'byow_whatsapp'` taxonomy (Spec 0 cron taxonomy convergence).

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

const NOTIFY_ROLES = ['admin', 'staff', 'hod'] as const;
const RECONNECT_URL = '/admission/settings/whatsapp-numbers';
const NOTIFICATION_CATEGORY = 'byow_stale';

interface RecipientRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface DispatchByowStaleNotificationArgs {
  supabase: SupabaseClient;
  institutionId: string;
  departmentId: string;
  departmentName: string;
  phoneNumber: string | null;
  hoursSinceInbound: number;
}

export async function dispatchByowStaleNotification(
  args: DispatchByowStaleNotificationArgs
): Promise<void> {
  const {
    supabase,
    institutionId,
    departmentId,
    departmentName,
    phoneNumber,
    hoursSinceInbound,
  } = args;

  // Resolve recipients: admin/staff → senior_learner_advisor, plus hod.
  const { data: recipients, error: recipientsErr } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('role', NOTIFY_ROLES as unknown as string[])
    .eq('institution_id', institutionId);

  if (recipientsErr) {
    Sentry.captureException(recipientsErr, {
      tags: {
        feature: 'byow_whatsapp',
        subtype: 'notification_recipient_lookup_failure',
      },
      extra: { institutionId, departmentId },
    });
    return;
  }

  const rows = (recipients ?? []) as RecipientRow[];
  if (rows.length === 0) return;

  const title = `Department WhatsApp lost — ${departmentName}`;
  const phoneLabel = phoneNumber ?? 'connection';
  const body = `${phoneLabel} has had no inbound for ${hoursSinceInbound.toFixed(
    1
  )}h. Reconnect to avoid message loss.`;

  for (const recipient of rows) {
    try {
      // 1. Insert shared notification row.
      const { data: notification, error: insertErr } = await (supabase as any)
        .from('notifications')
        .insert({
          title,
          body,
          url: RECONNECT_URL,
          category: NOTIFICATION_CATEGORY,
          priority: 'high',
          kind: 'work_item',
          targeting: { user_ids: [recipient.id] },
          metadata: {
            source: 'byow.connection_pulse.stale',
            institution_id: institutionId,
            department_id: departmentId,
            department_name: departmentName,
            phone_number: phoneNumber,
            hours_since_inbound: hoursSinceInbound,
          },
        })
        .select('id')
        .single();

      if (insertErr || !notification) {
        throw insertErr ?? new Error('Notification insert returned no data');
      }

      // 2. Link to the recipient via user_notifications.
      const { error: linkErr } = await (supabase as any)
        .from('user_notifications')
        .insert({
          notification_id: notification.id,
          user_id: recipient.id,
        });

      if (linkErr) throw linkErr;
    } catch (e) {
      Sentry.captureException(e, {
        tags: {
          feature: 'byow_whatsapp',
          subtype: 'notification_send_failure',
        },
        extra: {
          recipient_id: recipient.id,
          institutionId,
          departmentId,
          departmentName,
        },
      });
      // Continue to next recipient — one bad row must not block the rest.
    }
  }
}
