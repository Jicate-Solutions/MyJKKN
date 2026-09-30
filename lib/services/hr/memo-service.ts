/**
 * HR Memo Service — T6.1
 *
 * Responsibilities
 *   1. Detect trigger events (leave-before-approval, monthly LOP threshold)
 *      and write rows into `hr_memo_eligibility_events`.
 *   2. Resolve unprocessed events into `hr_memos` rows (auto-issue).
 *   3. Lifecycle ops: acknowledge, dispute, resolve.
 *   4. Notification fan-out: in-app notices (bell + web push) to the staff
 *      member and supervisor. There is no WhatsApp send in this service.
 *   5. Acknowledgement nudges: ONE reminder to the staff member, then ONE
 *      notice to their reporting head (hr_memo_nudges).
 *
 * The whole detector is behind platform_policies 'hr.memo_auto_detector'
 * (off | dry_run | live) — see memo-detector-rules.ts and migration
 * 20270613101223 for how a super admin switches it on.
 *
 * Policy source: `fn_get_hr_memo_triggers()` RPC — never read the policy table
 * directly. M6a seed not required at deploy; fn returns safe defaults.
 *
 * Termination linkage (T6.3): `fn_count_active_memos_for_termination(staff_id)`.
 * This service does NOT trigger termination — it only writes memos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MEMO_DETECTOR_POLICY_KEY,
  dueNudges,
  effectiveMode,
  parseMemoDetectorSettings,
  type MemoDetectorMode,
  type MemoDetectorSettings,
  type NudgeKind,
  type RecordedNudge,
} from './memo-detector-rules';

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

export interface DetectedEvent {
  staff_id: string;
  event_type: MemoType;
  event_detail: Record<string, unknown>;
}

/**
 * What a run did (live) or would have done (dry_run). Stored verbatim in
 * hr_memo_detector_runs.details so a super admin can read a dry run before
 * switching the detector to live. Each list is capped at PREVIEW_CAP rows.
 */
export interface DetectionPreview {
  events: DetectedEvent[];
  memos: Array<{
    event_id: string | null;
    staff_id: string;
    memo_type: MemoType;
    /** false = the event's staff_id matches no staff row; no memo is ever created for it. */
    staff_found: boolean;
    /** in-app recipients the memo notice goes (or would go) to */
    notify_count: number;
  }>;
  nudges: Array<{
    memo_id: string;
    kind: NudgeKind;
    recipient_count: number;
    recipient_source: string;
  }>;
}

export interface DetectionRunResult {
  run_id: string;
  mode: MemoDetectorMode;
  events_written: number;
  memos_created: number;
  notifications_sent: number;
  nudges_sent: number;
  preview: DetectionPreview;
  errors: string[];
}

export interface ReportingHead {
  profile_ids: string[];
  source: 'reports_to' | 'department_head' | 'department_hod_role' | 'none';
  staff_name: string;
}

const PREVIEW_CAP = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function pushCapped<T>(list: T[], item: T): void {
  if (list.length < PREVIEW_CAP) list.push(item);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

  /**
   * The detector's on/off/dry-run switch — platform_policies
   * 'hr.memo_auto_detector' read through fn_get_policy. Any failure reads as
   * 'off': a switch that cannot be read must never be treated as "on".
   */
  async getDetectorSettings(): Promise<MemoDetectorSettings> {
    const { data, error } = await this.supabase.rpc('fn_get_policy', {
      p_key: MEMO_DETECTOR_POLICY_KEY,
    });
    if (error) {
      throw new Error(`fn_get_policy(${MEMO_DETECTOR_POLICY_KEY}) failed: ${error.message}`);
    }
    return parseMemoDetectorSettings(data);
  }

  // -------------------------------------------------------------------------
  // Detection — called by /api/cron/hr-memo-auto-detector
  // -------------------------------------------------------------------------
  /**
   * Daily sweep: detect memo events, turn them into memos, send the
   * acknowledgement nudges, and record the run.
   *
   *   mode 'off'     — zero work: the switch is read and nothing else.
   *   mode 'dry_run' — every read happens; the ONLY write is one
   *                    hr_memo_detector_runs row describing what live would do.
   *   mode 'live'    — events, memos, notices and nudges are written.
   *
   * `forceDryRun` (the route's ?dry_run=1) lowers live to dry_run and never
   * switches an 'off' detector on.
   */
  async runDetection(
    runId: string,
    opts: { forceDryRun?: boolean; now?: Date } = {},
  ): Promise<DetectionRunResult> {
    const now = opts.now ?? new Date();
    const result: DetectionRunResult = {
      run_id: runId,
      mode: 'off',
      events_written: 0,
      memos_created: 0,
      notifications_sent: 0,
      nudges_sent: 0,
      preview: { events: [], memos: [], nudges: [] },
      errors: [],
    };

    let settings: MemoDetectorSettings;
    try {
      settings = await this.getDetectorSettings();
    } catch (e) {
      result.errors.push(`switch unreadable, treated as off: ${errText(e)}`);
      return result;
    }
    result.mode = effectiveMode(settings.mode, opts.forceDryRun === true);
    if (result.mode === 'off') return result;
    const live = result.mode === 'live';

    let triggers: MemoTriggers;
    try {
      triggers = await this.getTriggers();
    } catch (e) {
      result.errors.push(errText(e));
      await this.recordRun(result, now);
      return result;
    }

    // ---- Detectors (read-only; they return what they found)
    const fresh: DetectedEvent[] = [];
    if (triggers.leave_before_approval_enabled) {
      try {
        fresh.push(...(await this.findLeaveBeforeApproval()));
      } catch (e) {
        result.errors.push(`leave_before_approval detector: ${errText(e)}`);
      }
    }
    if (triggers.monthly_lop_threshold_enabled) {
      try {
        fresh.push(
          ...(await this.findMonthlyLopThreshold(triggers.monthly_lop_threshold_count, now)),
        );
      } catch (e) {
        result.errors.push(`monthly_lop_threshold detector: ${errText(e)}`);
      }
    }
    for (const ev of fresh) pushCapped(result.preview.events, ev);

    if (live && fresh.length > 0) {
      const { error: insertError, count } = await this.supabase
        .from('hr_memo_eligibility_events')
        .insert(
          fresh.map((ev) => ({ ...ev, detected_by_run_id: runId })),
          { count: 'exact' },
        );
      if (insertError) {
        result.errors.push(`event insert failed: ${insertError.message}`);
      } else {
        result.events_written = count ?? fresh.length;
      }
    }

    // ---- Resolution: events -> memos (dry run previews the fresh ones too)
    try {
      await this.resolveEventsIntoMemos(runId, live, live ? [] : fresh, settings, result);
    } catch (e) {
      result.errors.push(`event resolution: ${errText(e)}`);
    }

    // ---- Acknowledgement nudges
    try {
      await this.runAcknowledgementNudges(runId, live, now, settings, result);
    } catch (e) {
      result.errors.push(`acknowledgement nudges: ${errText(e)}`);
    }

    await this.recordRun(result, now);
    return result;
  }

  private async recordRun(result: DetectionRunResult, now: Date): Promise<void> {
    const { error } = await this.supabase.from('hr_memo_detector_runs').insert({
      run_id: result.run_id,
      mode: result.mode,
      ran_at: now.toISOString(),
      events_found: result.preview.events.length,
      events_written: result.events_written,
      memos_found: result.preview.memos.length,
      memos_created: result.memos_created,
      notifications_sent: result.notifications_sent,
      nudges_found: result.preview.nudges.length,
      nudges_sent: result.nudges_sent,
      details: result.preview,
      errors: result.errors,
    });
    if (error) result.errors.push(`run record failed: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Detector — leave consumed before approval landed
  // -------------------------------------------------------------------------
  // Strategy: scan institution_leaves where status='approved' AND start_date <
  // approved_at AND requested_by NOT NULL. Each such row = one event for
  // requested_by. De-duplicates against existing events for the same
  // (staff_id, event_detail.leave_id).
  //
  // KNOWN SOURCE PROBLEM (2026-10-01, lane F): institution_leaves holds
  // institution / department holidays, and requested_by is the PROFILE id of
  // whoever declared the holiday — not a staff.id. resolveEventsIntoMemos
  // therefore never creates a memo for these (staff_found=false) and the dry
  // run shows them as unresolvable. Re-pointing this detector at the real
  // staff-leave table is a separate decision for HR.
  private async findLeaveBeforeApproval(): Promise<DetectedEvent[]> {
    const { data: candidates, error } = await this.supabase
      .from('institution_leaves')
      .select('id, requested_by, start_date, approved_at, status, leave_name')
      .eq('status', 'approved')
      .not('requested_by', 'is', null)
      .not('approved_at', 'is', null);

    if (error) throw new Error(`institution_leaves read failed: ${error.message}`);
    if (!candidates || candidates.length === 0) return [];

    const flagged = candidates.filter((row) => {
      if (!row.approved_at || !row.start_date) return false;
      // start_date YYYY-MM-DD; approved_at is timestamptz
      const startDate = new Date(row.start_date as string);
      const approvedAt = new Date(row.approved_at as string);
      return startDate.getTime() < approvedAt.getTime();
    });
    if (flagged.length === 0) return [];

    // Read existing events to skip duplicates
    const leaveIds = flagged.map((r) => r.id as string);
    const { data: existing } = await this.supabase
      .from('hr_memo_eligibility_events')
      .select('event_detail')
      .eq('event_type', 'leave_before_approval')
      .in('event_detail->>leave_id', leaveIds);
    const existingLeaveIds = new Set(
      (existing ?? [])
        .map((r) => (r.event_detail as Record<string, unknown>)?.leave_id)
        .filter(Boolean) as string[],
    );

    return flagged
      .filter((r) => !existingLeaveIds.has(r.id as string))
      .map((r) => ({
        staff_id: r.requested_by as string,
        event_type: 'leave_before_approval' as const,
        event_detail: {
          leave_id: r.id,
          leave_name: r.leave_name,
          start_date: r.start_date,
          approved_at: r.approved_at,
        },
      }));
  }

  // -------------------------------------------------------------------------
  // Detector — N+ LOPs in current month
  // -------------------------------------------------------------------------
  // Strategy: hr_attendance_records.is_lop=true count per staff for current
  // month. De-duplicates against existing events keyed on (staff_id, YYYY-MM).
  //
  // KNOWN SOURCE PROBLEM (2026-10-01, lane F): hr_attendance_records has
  // employee_id + work_date and no staff_id / is_lop / attendance_date columns,
  // so this read fails. It used to fail silently (0 events); it now surfaces
  // in the run's errors so the dry run says so plainly.
  private async findMonthlyLopThreshold(
    threshold: number,
    now: Date,
  ): Promise<DetectedEvent[]> {
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${monthKey}-01`;

    const { data: rows, error } = await this.supabase
      .from('hr_attendance_records')
      .select('staff_id, is_lop, attendance_date')
      .eq('is_lop', true)
      .gte('attendance_date', monthStart);

    if (error) throw new Error(`hr_attendance_records read failed: ${error.message}`);
    if (!rows) return [];

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
    if (flagged.length === 0) return [];

    // De-duplicate against existing events for this month
    const { data: existing } = await this.supabase
      .from('hr_memo_eligibility_events')
      .select('staff_id, event_detail')
      .eq('event_type', 'monthly_lop_threshold')
      .in('staff_id', flagged);

    const alreadyDoneForMonth = new Set<string>();
    for (const e of existing ?? []) {
      const detail = e.event_detail as Record<string, unknown> | null;
      if (detail?.month === monthKey) alreadyDoneForMonth.add(e.staff_id as string);
    }

    return flagged
      .filter((sid) => !alreadyDoneForMonth.has(sid))
      .map((sid) => ({
        staff_id: sid,
        event_type: 'monthly_lop_threshold' as const,
        event_detail: { month: monthKey, lop_count: counts.get(sid), threshold },
      }));
  }

  // -------------------------------------------------------------------------
  // Resolution — turn events into memos
  // -------------------------------------------------------------------------
  private async resolveEventsIntoMemos(
    _runId: string,
    live: boolean,
    uninserted: DetectedEvent[],
    settings: MemoDetectorSettings,
    result: DetectionRunResult,
  ): Promise<void> {
    const { data: pending, error } = await this.supabase
      .from('hr_memo_eligibility_events')
      .select('id, staff_id, event_type, event_detail')
      .is('processed_into_memo_id', null)
      .eq('is_dismissed', false)
      .limit(500);
    if (error) throw new Error(`pending events read failed: ${error.message}`);

    const candidates: Array<DetectedEvent & { event_id: string | null }> = [
      ...(pending ?? []).map((e) => ({
        event_id: e.id as string,
        staff_id: e.staff_id as string,
        event_type: e.event_type as MemoType,
        event_detail: (e.event_detail as Record<string, unknown>) ?? {},
      })),
      ...uninserted.map((e) => ({ ...e, event_id: null })),
    ];
    if (candidates.length === 0) return;

    // A memo is only ever issued to a real staff row.
    const staffIds = Array.from(new Set(candidates.map((c) => c.staff_id)));
    const found = new Set<string>();
    for (const ids of chunk(staffIds, 200)) {
      const { data: rows, error: staffErr } = await this.supabase
        .from('staff')
        .select('id')
        .in('id', ids);
      if (staffErr) throw new Error(`team member lookup failed: ${staffErr.message}`);
      for (const r of rows ?? []) found.add(r.id as string);
    }

    for (const event of candidates) {
      const staffFound = found.has(event.staff_id);
      if (!live || !staffFound) {
        const recipients = staffFound ? await this.resolveMemoRecipients(event.staff_id) : [];
        pushCapped(result.preview.memos, {
          event_id: event.event_id,
          staff_id: event.staff_id,
          memo_type: event.event_type,
          staff_found: staffFound,
          notify_count: recipients.length,
        });
        continue;
      }

      try {
        const reason = this.composeReason(
          event.event_type,
          event.event_detail,
          settings.staff_reminder_after_days,
        );

        const { data: memoRow, error: memoError } = await this.supabase
          .from('hr_memos')
          .insert({
            staff_id: event.staff_id,
            memo_type: event.event_type,
            reason,
            triggered_by_event_id: event.event_id,
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
          note: `auto-issued from event ${event.event_id}`,
        });

        await this.supabase
          .from('hr_memo_eligibility_events')
          .update({ processed_into_memo_id: memoRow.id })
          .eq('id', event.event_id);

        result.memos_created += 1;

        // Notify (best-effort, never blocks the loop)
        const recipients = await this.resolveMemoRecipients(event.staff_id);
        pushCapped(result.preview.memos, {
          event_id: event.event_id,
          staff_id: event.staff_id,
          memo_type: event.event_type,
          staff_found: true,
          notify_count: recipients.length,
        });
        const sent = await this.sendInApp({
          recipients,
          title: 'HR memo issued',
          body: reason,
          url: '/hr/memos/my',
          metadata: { staff_id: event.staff_id, memo_id: memoRow.id },
        });
        if (sent) result.notifications_sent += 1;
      } catch (e) {
        result.errors.push(`memo for event ${event.event_id}: ${errText(e)}`);
      }
    }
  }

  private composeReason(
    type: MemoType,
    detail: Record<string, unknown>,
    respondWithinDays = 3,
  ): string {
    const respond = `Please acknowledge or dispute within ${respondWithinDays} days.`;
    switch (type) {
      case 'leave_before_approval':
        return `Leave taken before approval. Leave "${detail.leave_name ?? 'unspecified'}" was consumed on ${detail.start_date ?? 'unknown date'} but approval was recorded later on ${detail.approved_at ?? 'unknown timestamp'}. Per HR policy, leaves must be approved before they are taken. ${respond}`;
      case 'monthly_lop_threshold':
        return `Loss-of-pay threshold breached. You have ${detail.lop_count ?? '?'} LOP day(s) recorded in ${detail.month ?? 'this month'} (threshold: ${detail.threshold ?? '?'}). Per HR policy this triggers a formal memo. ${respond}`;
      case 'unscheduled_absence':
        return `Unscheduled absence flagged. ${respond}`;
      case 'manual':
      default:
        return (detail.reason as string) ?? 'Manual memo issued by HR Admin.';
    }
  }

  // -------------------------------------------------------------------------
  // Acknowledgement nudges — ONE reminder to the staff member, then ONE
  // notice to the reporting head. Idempotent on hr_memo_nudges
  // UNIQUE (memo_id, nudge_kind): the row is claimed BEFORE anything is sent,
  // so two overlapping runs can never send the same nudge twice.
  // -------------------------------------------------------------------------
  private async runAcknowledgementNudges(
    runId: string,
    live: boolean,
    now: Date,
    settings: MemoDetectorSettings,
    result: DetectionRunResult,
  ): Promise<void> {
    const cutoff = new Date(now.getTime() - settings.staff_reminder_after_days * DAY_MS);
    const { data: memos, error } = await this.supabase
      .from('hr_memos')
      .select('id, staff_id, status, issued_at')
      .eq('status', 'issued')
      .lte('issued_at', cutoff.toISOString())
      .order('issued_at', { ascending: false })
      .limit(1000);
    if (error) throw new Error(`open memos read failed: ${error.message}`);
    if (!memos || memos.length === 0) return;

    const recorded: RecordedNudge[] = [];
    for (const ids of chunk(memos.map((m) => m.id as string), 200)) {
      const { data: rows, error: nudgeErr } = await this.supabase
        .from('hr_memo_nudges')
        .select('memo_id, nudge_kind, recorded_at')
        .in('memo_id', ids);
      if (nudgeErr) throw new Error(`nudge record read failed: ${nudgeErr.message}`);
      for (const r of rows ?? []) recorded.push(r as RecordedNudge);
    }

    const memoById = new Map(memos.map((m) => [m.id as string, m]));
    const due = dueNudges(
      memos.map((m) => ({
        id: m.id as string,
        status: m.status as string,
        issued_at: m.issued_at as string,
      })),
      recorded,
      now,
      settings,
    );

    for (const d of due) {
      const memo = memoById.get(d.memo_id);
      if (!memo) continue;
      const staffId = memo.staff_id as string;
      const issuedOn = String(memo.issued_at).slice(0, 10);

      let recipients: string[];
      let source: string;
      let title: string;
      let body: string;
      let url: string | null;
      if (d.kind === 'staff_reminder') {
        const staffProfile = await this.staffProfileId(staffId);
        recipients = staffProfile ? [staffProfile] : [];
        source = staffProfile ? 'staff' : 'none';
        title = 'Reminder: please respond to your HR memo';
        body = `An HR memo issued to you on ${issuedOn} is still waiting for your response. Open My memos to acknowledge it, or dispute it with your reason.`;
        url = '/hr/memos/my';
      } else {
        const head = await this.resolveReportingHead(staffId);
        recipients = head.profile_ids;
        source = head.source;
        const days = Math.floor((now.getTime() - new Date(memo.issued_at as string).getTime()) / DAY_MS);
        title = `HR memo not answered: ${head.staff_name}`;
        body = `${head.staff_name} has not acknowledged or disputed an HR memo issued on ${issuedOn} (${days} days ago), and a reminder has already been sent. Please follow up with them.`;
        url = null;
      }

      pushCapped(result.preview.nudges, {
        memo_id: d.memo_id,
        kind: d.kind,
        recipient_count: recipients.length,
        recipient_source: source,
      });
      if (!live) continue;

      // Claim first. A duplicate key means another run already owns it.
      const { data: claim, error: claimErr } = await this.supabase
        .from('hr_memo_nudges')
        .insert({
          memo_id: d.memo_id,
          nudge_kind: d.kind,
          run_id: runId,
          status: 'claimed',
          recorded_at: now.toISOString(),
        })
        .select('id')
        .single();
      if (claimErr || !claim) {
        if (claimErr?.code !== '23505') {
          result.errors.push(`nudge claim ${d.kind} ${d.memo_id}: ${claimErr?.message ?? 'no row'}`);
        }
        continue;
      }

      let status: 'sent' | 'no_recipient' | 'failed' = 'no_recipient';
      if (recipients.length > 0) {
        const sent = await this.sendInApp({
          recipients,
          title,
          body,
          url,
          metadata: { memo_id: d.memo_id, staff_id: staffId, nudge_kind: d.kind },
          idempotencyKey: `hr_memo_nudge:${d.memo_id}:${d.kind}`,
        });
        status = sent ? 'sent' : 'failed';
      }
      if (status === 'sent') result.nudges_sent += 1;

      const { error: updErr } = await this.supabase
        .from('hr_memo_nudges')
        .update({ status, recipient_profile_ids: recipients, recipient_source: source })
        .eq('id', claim.id);
      if (updErr) result.errors.push(`nudge record update ${d.memo_id}: ${updErr.message}`);
    }
  }

  private async staffProfileId(staffId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('staff')
      .select('profile_id')
      .eq('id', staffId)
      .maybeSingle();
    return (data?.profile_id as string | null) ?? null;
  }

  /**
   * The staff member's reporting head, first match wins:
   *   1. hr_staff_details.reports_to_staff_id -> staff.profile_id
   *      (the memo module's own supervisor rule)
   *   2. departments.head_of_department_id for staff.department_id
   *      (the staff record's department head, a profiles.id)
   *   3. profiles with role 'hod' in that department (the roster the
   *      learner-risk notices use because (2) is rarely filled in)
   * The staff member is never their own reporting head.
   */
  async resolveReportingHead(staffId: string): Promise<ReportingHead> {
    const { data: staffRow } = await this.supabase
      .from('staff')
      .select('profile_id, first_name, last_name, department_id')
      .eq('id', staffId)
      .maybeSingle();
    const staffName =
      [staffRow?.first_name, staffRow?.last_name].filter(Boolean).join(' ') || 'A team member';
    const self = (staffRow?.profile_id as string | null) ?? null;
    const notSelf = (ids: Array<string | null | undefined>) =>
      Array.from(new Set(ids.filter((id): id is string => !!id && id !== self)));

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
      const ids = notSelf([sup?.profile_id as string | null]);
      if (ids.length > 0) return { profile_ids: ids, source: 'reports_to', staff_name: staffName };
    }

    const departmentId = (staffRow?.department_id as string | null) ?? null;
    if (departmentId) {
      const { data: dept } = await this.supabase
        .from('departments')
        .select('head_of_department_id')
        .eq('id', departmentId)
        .maybeSingle();
      const ids = notSelf([dept?.head_of_department_id as string | null]);
      if (ids.length > 0) return { profile_ids: ids, source: 'department_head', staff_name: staffName };

      const { data: hods } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('role', 'hod')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .limit(5);
      const hodIds = notSelf((hods ?? []).map((h) => h.id as string));
      if (hodIds.length > 0) {
        return { profile_ids: hodIds, source: 'department_hod_role', staff_name: staffName };
      }
    }
    return { profile_ids: [], source: 'none', staff_name: staffName };
  }

  // -------------------------------------------------------------------------
  // In-app notice fan-out (bell + web push via the user_notifications
  // trigger). There is NO WhatsApp send in this path.
  // -------------------------------------------------------------------------
  private async resolveMemoRecipients(staffId: string): Promise<string[]> {
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
        return [];
      }
      if (!staffRow?.profile_id) return [];

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
      return recipients;
    } catch {
      return [];
    }
  }

  private async sendInApp(params: {
    recipients: string[];
    title: string;
    body: string;
    url: string | null;
    metadata: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<boolean> {
    if (params.recipients.length === 0) return false;
    try {
      const body = params.body.length > 240 ? params.body.slice(0, 237) + '...' : params.body;

      // Write ONE notifications row (recipient_id does not exist on
      // notifications), then link each recipient via user_notifications.
      // This is an auto-issued cron path with no acting user, so created_by
      // falls back to the first recipient (a valid profiles.id).
      const { data: notifRow, error: notifErr } = await this.supabase
        .from('notifications')
        .insert({
          title: params.title,
          body,
          category: 'hr_memo',
          created_by: params.recipients[0],
          targeting: { type: 'user', user_ids: params.recipients },
          metadata: params.metadata,
          ...(params.url ? { url: params.url } : {}),
          ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
        })
        .select('id')
        .single();
      if (notifErr || !notifRow) {
        console.error('[memo-service] notifications insert failed', notifErr);
        return false;
      }

      const { error: linkErr } = await this.supabase.from('user_notifications').insert(
        params.recipients.map((rid) => ({ notification_id: notifRow.id, user_id: rid })),
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
