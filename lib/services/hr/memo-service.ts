/**
 * HR Memo Service — T6.1
 *
 * Responsibilities
 *   1. Detect trigger events (leave-before-approval, monthly LOP threshold)
 *      and write rows into `hr_memo_eligibility_events`.
 *   2. Resolve unprocessed events into `hr_memos` rows (auto-issue).
 *   3. Lifecycle ops: acknowledge, dispute, resolve.
 *   4. Notification fan-out (WhatsApp template send to staff + supervisor).
 *
 * Policy source: `fn_get_hr_memo_triggers()` RPC — never read the policy table
 * directly. M6a seed not required at deploy; fn returns safe defaults.
 *
 * Termination linkage (T6.3): `fn_count_active_memos_for_termination(staff_id)`.
 * This service does NOT trigger termination — it only writes memos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type MemoType =
  | 'leave_before_approval'
  | 'monthly_lop_threshold'
  | 'unscheduled_absence'
  | 'manual';

export type MemoStatus = 'issued' | 'acknowledged' | 'disputed' | 'resolved';

export interface MemoTriggers {
  leave_before_approval_enabled: boolean;
  monthly_lop_threshold_count: number;
  monthly_lop_threshold_enabled: boolean;
  unscheduled_absence_enabled: boolean;
  memos_for_termination_threshold: number;
}

export interface HRMemoEligibilityEvent {
  id: string;
  staff_id: string;
  event_type: MemoType;
  event_detail: Record<string, unknown>;
  detected_at: string;
  detected_by_run_id: string | null;
  processed_into_memo_id: string | null;
  is_dismissed: boolean;
}

export interface HRMemo {
  id: string;
  staff_id: string;
  memo_type: MemoType;
  reason: string;
  triggered_by_event_id: string | null;
  issued_at: string;
  issued_by: string | null;
  auto_issued: boolean;
  status: MemoStatus;
  acknowledged_at: string | null;
  dispute_text: string | null;
  disputed_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  counts_toward_termination: boolean;
  created_at: string;
  updated_at: string;
}

export interface DetectionRunResult {
  run_id: string;
  events_written: number;
  memos_created: number;
  notifications_sent: number;
  errors: string[];
}

export class HRMemoService {
  constructor(private readonly supabase: SupabaseClient) {}

  // -------------------------------------------------------------------------
  // Policy access (single source of truth)
  // -------------------------------------------------------------------------
  async getTriggers(): Promise<MemoTriggers> {
    const { data, error } = await this.supabase.rpc('fn_get_hr_memo_triggers');
    if (error) {
      throw new Error(`fn_get_hr_memo_triggers failed: ${error.message}`);
    }
    // Defensive fallback if the RPC ever returns null (it shouldn't)
    if (!data || typeof data !== 'object') {
      return {
        leave_before_approval_enabled: true,
        monthly_lop_threshold_count: 2,
        monthly_lop_threshold_enabled: true,
        unscheduled_absence_enabled: false,
        memos_for_termination_threshold: 3,
      };
    }
    return data as MemoTriggers;
  }

  // -------------------------------------------------------------------------
  // Detection — called by /api/cron/hr-memo-auto-detector
  // -------------------------------------------------------------------------
  /**
   * Daily detection sweep. Writes eligibility events for:
   *   - leave_before_approval: staff with leaves marked 'taken' or status='approved'
   *     but where the start_date < approved_at (leave consumed before approval).
   *   - monthly_lop_threshold: staff with N+ LOP days in the current month.
   *
   * Implementation note: this uses the public.leave_approvals + institution_leaves
   * schema as the leave source. If those tables are missing or empty, the
   * detector returns 0 events without throwing — it is meant to be safe to
   * re-run on schedule.
   */
  async runDetection(runId: string): Promise<DetectionRunResult> {
    const triggers = await this.getTriggers();
    const errors: string[] = [];
    let eventsWritten = 0;
    let memosCreated = 0;
    let notificationsSent = 0;

    // ---- Detector 1: leave taken before approval (uses leave_approvals)
    if (triggers.leave_before_approval_enabled) {
      try {
        const before = await this.detectLeaveBeforeApproval(runId);
        eventsWritten += before;
      } catch (e) {
        errors.push(
          `leave_before_approval detector: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // ---- Detector 2: monthly LOP threshold (placeholder until LOP table lands)
    if (triggers.monthly_lop_threshold_enabled) {
      try {
        const lop = await this.detectMonthlyLopThreshold(
          runId,
          triggers.monthly_lop_threshold_count,
        );
        eventsWritten += lop;
      } catch (e) {
        errors.push(
          `monthly_lop_threshold detector: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // ---- Resolution: turn unprocessed events into memos
    try {
      const created = await this.resolveEventsIntoMemos(runId);
      memosCreated = created.memos;
      notificationsSent = created.notifications;
    } catch (e) {
      errors.push(
        `event resolution: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      run_id: runId,
      events_written: eventsWritten,
      memos_created: memosCreated,
      notifications_sent: notificationsSent,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // Detector — leave consumed before approval landed
  // -------------------------------------------------------------------------
  // Strategy: scan institution_leaves where status='approved' AND start_date <
  // approved_at::date AND requested_by NOT NULL. Each such row = one event for
  // requested_by. De-duplicates against existing events for the same
  // (staff_id, event_detail.leave_id).
  private async detectLeaveBeforeApproval(runId: string): Promise<number> {
    const { data: candidates, error } = await this.supabase
      .from('institution_leaves')
      .select('id, requested_by, start_date, approved_at, status, leave_name')
      .eq('status', 'approved')
      .not('requested_by', 'is', null)
      .not('approved_at', 'is', null);

    if (error) {
      // Likely cause: table absent or RLS denies. Silent for cron resiliency.
      return 0;
    }
    if (!candidates || candidates.length === 0) return 0;

    const flagged = candidates.filter((row) => {
      if (!row.approved_at || !row.start_date) return false;
      // start_date YYYY-MM-DD; approved_at is timestamptz
      const startDate = new Date(row.start_date as string);
      const approvedAt = new Date(row.approved_at as string);
      return startDate.getTime() < approvedAt.getTime();
    });
    if (flagged.length === 0) return 0;

    // Read existing events to skip duplicates
    const leaveIds = flagged.map((r) => r.id as string);
    const { data: existing } = await this.supabase
      .from('hr_memo_eligibility_events')
      .select('event_detail')
      .eq('event_type', 'leave_before_approval')
      .in(
        'event_detail->>leave_id',
        leaveIds,
      );
    const existingLeaveIds = new Set(
      (existing ?? [])
        .map((r) => (r.event_detail as Record<string, unknown>)?.leave_id)
        .filter(Boolean) as string[],
    );

    const fresh = flagged.filter((r) => !existingLeaveIds.has(r.id as string));
    if (fresh.length === 0) return 0;

    const rows = fresh.map((r) => ({
      staff_id: r.requested_by as string,
      event_type: 'leave_before_approval' as const,
      event_detail: {
        leave_id: r.id,
        leave_name: r.leave_name,
        start_date: r.start_date,
        approved_at: r.approved_at,
      },
      detected_by_run_id: runId,
    }));

    const { error: insertError, count } = await this.supabase
      .from('hr_memo_eligibility_events')
      .insert(rows, { count: 'exact' });

    if (insertError) {
      throw new Error(`event insert failed: ${insertError.message}`);
    }
    return count ?? rows.length;
  }

  // -------------------------------------------------------------------------
  // Detector — N+ LOPs in current month
  // -------------------------------------------------------------------------
  // Strategy: hr_attendance_records.is_lop=true count per staff for current
  // month. If hr_attendance_records doesn't exist or has no rows, returns 0.
  // De-duplicates against existing events keyed on (staff_id, YYYY-MM).
  private async detectMonthlyLopThreshold(
    runId: string,
    threshold: number,
  ): Promise<number> {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const monthStart = `${monthKey}-01`;

    // Aggregate LOP counts. We attempt the most common shape; on schema miss,
    // this returns silently with 0 events.
    const { data: rows, error } = await this.supabase
      .from('hr_attendance_records')
      .select('staff_id, is_lop, attendance_date')
      .eq('is_lop', true)
      .gte('attendance_date', monthStart);

    if (error || !rows) return 0;

    const counts = new Map<string, number>();
    for (const r of rows) {
      const sid = r.staff_id as string | null;
      if (!sid) continue;
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }

    const flagged: string[] = [];
    for (const [sid, n] of counts) {
      if (n >= threshold) flagged.push(sid);
    }
    if (flagged.length === 0) return 0;

    // De-duplicate against existing events for this month
    const { data: existing } = await this.supabase
      .from('hr_memo_eligibility_events')
      .select('staff_id, event_detail')
      .eq('event_type', 'monthly_lop_threshold')
      .in('staff_id', flagged);

    const alreadyDoneForMonth = new Set<string>();
    for (const e of existing ?? []) {
      const detail = e.event_detail as Record<string, unknown> | null;
      if (detail?.month === monthKey) {
        alreadyDoneForMonth.add(e.staff_id as string);
      }
    }

    const fresh = flagged.filter((sid) => !alreadyDoneForMonth.has(sid));
    if (fresh.length === 0) return 0;

    const insertRows = fresh.map((sid) => ({
      staff_id: sid,
      event_type: 'monthly_lop_threshold' as const,
      event_detail: {
        month: monthKey,
        lop_count: counts.get(sid),
        threshold,
      },
      detected_by_run_id: runId,
    }));

    const { error: insertError, count } = await this.supabase
      .from('hr_memo_eligibility_events')
      .insert(insertRows, { count: 'exact' });
    if (insertError) {
      throw new Error(`monthly LOP event insert: ${insertError.message}`);
    }
    return count ?? insertRows.length;
  }

  // -------------------------------------------------------------------------
  // Resolution — turn events into memos
  // -------------------------------------------------------------------------
  private async resolveEventsIntoMemos(
    _runId: string,
  ): Promise<{ memos: number; notifications: number }> {
    const { data: pending, error } = await this.supabase
      .from('hr_memo_eligibility_events')
      .select('id, staff_id, event_type, event_detail')
      .is('processed_into_memo_id', null)
      .eq('is_dismissed', false)
      .limit(500);

    if (error || !pending || pending.length === 0) {
      return { memos: 0, notifications: 0 };
    }

    let memos = 0;
    let notifications = 0;
    for (const event of pending) {
      try {
        const reason = this.composeReason(
          event.event_type as MemoType,
          (event.event_detail as Record<string, unknown>) ?? {},
        );

        const { data: memoRow, error: memoError } = await this.supabase
          .from('hr_memos')
          .insert({
            staff_id: event.staff_id,
            memo_type: event.event_type,
            reason,
            triggered_by_event_id: event.id,
            auto_issued: true,
            status: 'issued',
          })
          .select('id')
          .single();
        if (memoError) throw new Error(memoError.message);

        // Audit transition
        await this.supabase.from('hr_memo_state_transitions').insert({
          memo_id: memoRow.id,
          from_status: null,
          to_status: 'issued',
          actor_user_id: null,
          actor_role: 'cron',
          note: `auto-issued from event ${event.id}`,
        });

        await this.supabase
          .from('hr_memo_eligibility_events')
          .update({ processed_into_memo_id: memoRow.id })
          .eq('id', event.id);

        memos += 1;

        // Notify (best-effort, never blocks the loop)
        const notified = await this.notifyStaffAndSupervisor(
          event.staff_id as string,
          reason,
        );
        if (notified) notifications += 1;
      } catch {
        // swallow individual failures; cron must be resilient
      }
    }
    return { memos, notifications };
  }

  private composeReason(
    type: MemoType,
    detail: Record<string, unknown>,
  ): string {
    switch (type) {
      case 'leave_before_approval':
        return `Leave taken before approval. Leave "${detail.leave_name ?? 'unspecified'}" was consumed on ${detail.start_date ?? 'unknown date'} but approval was recorded later on ${detail.approved_at ?? 'unknown timestamp'}. Per HR policy, leaves must be approved before they are taken. Please acknowledge or dispute within 7 days.`;
      case 'monthly_lop_threshold':
        return `Loss-of-pay threshold breached. You have ${detail.lop_count ?? '?'} LOP day(s) recorded in ${detail.month ?? 'this month'} (threshold: ${detail.threshold ?? '?'}). Per HR policy this triggers a formal memo. Please acknowledge or dispute within 7 days.`;
      case 'unscheduled_absence':
        return `Unscheduled absence flagged. Please acknowledge or dispute within 7 days.`;
      case 'manual':
      default:
        return (detail.reason as string) ?? 'Manual memo issued by HR Admin.';
    }
  }

  // -------------------------------------------------------------------------
  // WhatsApp / notification fan-out (best-effort)
  // -------------------------------------------------------------------------
  // Uses the existing notifications table as the universal queue. WhatsApp
  // pipeline picks up via its own consumer. We intentionally do NOT call the
  // WhatsApp API directly from the cron path to avoid blocking on network.
  private async notifyStaffAndSupervisor(
    staffId: string,
    reason: string,
  ): Promise<boolean> {
    try {
      // SCHEMA FIX 2026-07-21: this selected `auth_user_id, supervisor_id`.
      // NEITHER column exists on `staff` — the auth link is `profile_id`, and
      // there is no supervisor column at all. Every call raised 42703, the
      // error was discarded, staffRow came back null and the method returned
      // false, so HR memo notifications have never been delivered to anyone.
      const { data: staffRow, error: staffError } = await this.supabase
        .from('staff')
        .select('profile_id, first_name, last_name')
        .eq('id', staffId)
        .maybeSingle();
      if (staffError) {
        console.error('[memo-service] staff lookup failed', staffError);
        return false;
      }
      if (!staffRow?.profile_id) return false;

      const recipients: string[] = [staffRow.profile_id as string];

      // Supervisor copy. The reporting line lives on
      // hr_staff_details.reports_to_staff_id, not on `staff`. It is populated
      // for 0 of 543 rows today, so this branch is a no-op until the org chart
      // is filled in — but it now points at the right column, so it starts
      // working the moment that happens instead of silently 42703-ing.
      const { data: detail } = await this.supabase
        .from('hr_staff_details')
        .select('reports_to_staff_id')
        .eq('staff_id', staffId)
        .maybeSingle();

      if (detail?.reports_to_staff_id) {
        const { data: sup } = await this.supabase
          .from('staff')
          .select('profile_id')
          .eq('id', detail.reports_to_staff_id)
          .maybeSingle();
        if (sup?.profile_id) recipients.push(sup.profile_id as string);
      }

      const title = 'HR memo issued';
      const body = reason.length > 240 ? reason.slice(0, 237) + '...' : reason;

      // Write ONE notifications row (recipient_id does not exist on
      // notifications), then link each recipient via user_notifications.
      // This is an auto-issued cron path with no acting user, so created_by
      // falls back to the first recipient (a valid profiles.id).
      const { data: notifRow, error: notifErr } = await this.supabase
        .from('notifications')
        .insert({
          title,
          body,
          category: 'hr_memo',
          created_by: recipients[0],
          targeting: { type: 'user', user_ids: recipients },
          metadata: { staff_id: staffId },
        })
        .select('id')
        .single();
      if (notifErr || !notifRow) {
        console.error('[memo-service] notifications insert failed', notifErr);
        return false;
      }

      const { error: linkErr } = await this.supabase.from('user_notifications').insert(
        recipients.map((rid) => ({ notification_id: notifRow.id, user_id: rid })),
      );
      if (linkErr) {
        console.error('[memo-service] user_notifications insert failed', linkErr);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle ops (UI-facing)
  // -------------------------------------------------------------------------
  async acknowledge(memoId: string, actorUserId: string): Promise<HRMemo> {
    const { data: before } = await this.supabase
      .from('hr_memos')
      .select('status')
      .eq('id', memoId)
      .single();

    const { data, error } = await this.supabase
      .from('hr_memos')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', memoId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await this.supabase.from('hr_memo_state_transitions').insert({
      memo_id: memoId,
      from_status: before?.status,
      to_status: 'acknowledged',
      actor_user_id: actorUserId,
      actor_role: 'staff',
    });
    return data as HRMemo;
  }

  async dispute(
    memoId: string,
    actorUserId: string,
    disputeText: string,
  ): Promise<HRMemo> {
    const { data: before } = await this.supabase
      .from('hr_memos')
      .select('status')
      .eq('id', memoId)
      .single();

    const { data, error } = await this.supabase
      .from('hr_memos')
      .update({
        status: 'disputed',
        dispute_text: disputeText,
        disputed_at: new Date().toISOString(),
      })
      .eq('id', memoId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await this.supabase.from('hr_memo_state_transitions').insert({
      memo_id: memoId,
      from_status: before?.status,
      to_status: 'disputed',
      actor_user_id: actorUserId,
      actor_role: 'staff',
      note: disputeText.slice(0, 240),
    });
    return data as HRMemo;
  }

  async resolve(
    memoId: string,
    actorUserId: string,
    resolutionNote: string,
    countsTowardTermination: boolean,
  ): Promise<HRMemo> {
    const { data: before } = await this.supabase
      .from('hr_memos')
      .select('status')
      .eq('id', memoId)
      .single();

    const { data, error } = await this.supabase
      .from('hr_memos')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: actorUserId,
        resolution_note: resolutionNote,
        counts_toward_termination: countsTowardTermination,
      })
      .eq('id', memoId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await this.supabase.from('hr_memo_state_transitions').insert({
      memo_id: memoId,
      from_status: before?.status,
      to_status: 'resolved',
      actor_user_id: actorUserId,
      actor_role: 'hr_admin',
      note: resolutionNote.slice(0, 240),
    });
    return data as HRMemo;
  }

  async issueManual(params: {
    staff_id: string;
    reason: string;
    issued_by: string;
  }): Promise<HRMemo> {
    const { data, error } = await this.supabase
      .from('hr_memos')
      .insert({
        staff_id: params.staff_id,
        memo_type: 'manual',
        reason: params.reason,
        issued_by: params.issued_by,
        auto_issued: false,
        status: 'issued',
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await this.supabase.from('hr_memo_state_transitions').insert({
      memo_id: data.id,
      from_status: null,
      to_status: 'issued',
      actor_user_id: params.issued_by,
      actor_role: 'hr_admin',
      note: 'manual issuance',
    });
    return data as HRMemo;
  }

  // -------------------------------------------------------------------------
  // Read helpers (used by routes)
  // -------------------------------------------------------------------------
  async listAll(limit = 100): Promise<HRMemo[]> {
    const { data, error } = await this.supabase
      .from('hr_memos')
      .select('*')
      .order('issued_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as HRMemo[];
  }

  async listForStaff(staffId: string): Promise<HRMemo[]> {
    const { data, error } = await this.supabase
      .from('hr_memos')
      .select('*')
      .eq('staff_id', staffId)
      .order('issued_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as HRMemo[];
  }

  async getById(memoId: string): Promise<HRMemo | null> {
    const { data, error } = await this.supabase
      .from('hr_memos')
      .select('*')
      .eq('id', memoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as HRMemo) ?? null;
  }
}
