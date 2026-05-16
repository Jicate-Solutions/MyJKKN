// lib/services/solutions/prospect-reminders-service.ts
// Solutions Hub Phase C2 — automated follow-up reminders.
//
// Reads overdue prospects via sh_get_overdue_prospects() and emits one
// Layer 0 work_item notification per assignee summarising N overdue
// prospects. Reuses the platform notification substrate exclusively —
// fn_create_dashboard_work_item() handles the notifications +
// user_notifications fan-out + idempotency check in one call.
//
// Idempotency: keyed on (assignee_id, YYYY-MM-DD UTC). One reminder per
// assignee per day, regardless of how many times the cron fires.
//
// Created 2026-05-02.

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface OverdueProspect {
  id: string;
  prospect_code: string;
  company_name: string;
  contact_person: string;
  assigned_to: string;
  next_action: string | null;
  next_action_date: string;
  days_overdue: number;
  pipeline_stage: string;
}

export interface ReminderResult {
  processed: number;
  notifications_created: number;
  assignees: number;
  skipped_idempotent: number;
  errors: string[];
}

/**
 * Fetch all currently overdue prospects in active pipeline stages.
 * Uses the SECURITY DEFINER RPC so RLS doesn't filter rows out.
 */
export async function getOverdueProspects(): Promise<OverdueProspect[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('sh_get_overdue_prospects');

  if (error) {
    throw new Error(`sh_get_overdue_prospects failed: ${error.message}`);
  }

  return (data ?? []) as OverdueProspect[];
}

/**
 * Group overdue prospects by assignee and emit one work_item notification
 * per assignee. Uses fn_create_dashboard_work_item() which:
 *   - Inserts into notifications with kind='work_item'
 *   - Sets is_layer_0 when priority='urgent' (>= 7 days overdue)
 *   - Fans out a user_notifications row to the target user
 *   - Skips silently on idempotency_key collision
 *
 * Returns counts for the cron route response payload.
 */
export async function generateReminderNotifications(): Promise<ReminderResult> {
  const supabase = createServiceRoleClient();
  const result: ReminderResult = {
    processed: 0,
    notifications_created: 0,
    assignees: 0,
    skipped_idempotent: 0,
    errors: [],
  };

  const overdue = await getOverdueProspects();
  result.processed = overdue.length;

  if (overdue.length === 0) {
    return result;
  }

  // Group by assignee_id
  const byAssignee = new Map<string, OverdueProspect[]>();
  for (const row of overdue) {
    const list = byAssignee.get(row.assigned_to) ?? [];
    list.push(row);
    byAssignee.set(row.assigned_to, list);
  }
  result.assignees = byAssignee.size;

  // YYYY-MM-DD UTC — stable idempotency window per cron day.
  const today = new Date().toISOString().slice(0, 10);

  for (const [assigneeId, prospects] of byAssignee.entries()) {
    const count = prospects.length;
    const maxDaysOverdue = prospects.reduce(
      (max, p) => (p.days_overdue > max ? p.days_overdue : max),
      0,
    );

    // Urgent if any prospect is >= 7 days overdue. Urgent priority makes
    // fn_create_dashboard_work_item() set is_layer_0=true (Attention Bar).
    const priority = maxDaysOverdue >= 7 ? 'urgent' : 'high';

    const title =
      count === 1
        ? `Follow-up overdue: ${prospects[0].company_name} (${prospects[0].days_overdue}d)`
        : `${count} prospects need follow-up (max ${maxDaysOverdue}d overdue)`;

    const bodyLines = prospects
      .slice(0, 5)
      .map(
        (p) =>
          `- ${p.company_name} (${p.prospect_code}) — ${p.next_action ?? 'no action set'} — ${p.days_overdue}d overdue`,
      );
    if (count > 5) {
      bodyLines.push(`- ...and ${count - 5} more`);
    }
    const body = bodyLines.join('\n');

    const idempotencyKey = `sol-c2-prospect-reminders:${assigneeId}:${today}`;

    const { data, error } = await supabase.rpc('fn_create_dashboard_work_item', {
      p_category: 'dashboard:solutions:prospect_overdue',
      p_priority: priority,
      p_title: title,
      p_body: body,
      p_action_config: {
        url: `/solutions/pipeline?filter=overdue&assigned_to=me`,
        prospect_count: count,
        max_days_overdue: maxDaysOverdue,
        prospect_ids: prospects.map((p) => p.id),
      },
      p_target_user: assigneeId,
      p_idempotency_key: idempotencyKey,
      p_deadline_hours: 24,
    });

    if (error) {
      result.errors.push(`assignee ${assigneeId}: ${error.message}`);
      console.error('[prospect-reminders] fn_create_dashboard_work_item failed:', {
        assigneeId,
        error,
      });
      continue;
    }

    // RPC returns 1 when inserted, 0 when idempotency-skipped.
    const inserted = typeof data === 'number' ? data : Number(data ?? 0);
    if (inserted > 0) {
      result.notifications_created += inserted;
    } else {
      result.skipped_idempotent += 1;
    }
  }

  return result;
}
