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

/** YYYY-MM-DD of an instant as the calendar reads in India (a memo issued at 01:00 IST is that day's memo). */
export function istDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Why an event that names no team member record is set aside instead of left pending. */
export const UNRESOLVABLE_EVENT_REASON =
  'auto-dismissed: this id matches no team member record, so no memo can ever be issued for it';

const OPEN_MEMO_PAGE = 1000;
const OPEN_MEMO_MAX_PAGES = 50;

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
      .order('detected_at', { ascending: true })
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

    // Live: an event that names no team member record can never become a memo.
    // Set it aside (dismissed, with the reason) so it does not sit pending for
    // ever, crowd real events out of the 500-row read, or reappear every run.
    if (live) {
      const unresolvable = candidates
        .filter((c) => c.event_id && !found.has(c.staff_id))
        .map((c) => c.event_id as string);
      for (const ids of chunk(unresolvable, 200)) {
        const { error: dismissErr } = await this.supabase
          .from('hr_memo_eligibility_events')
          .update({
            is_dismissed: true,
            dismissed_reason: UNRESOLVABLE_EVENT_REASON,
            dismissed_at: new Date().toISOString(),
          })
          .in('id', ids)
          .is('processed_into_memo_id', null);
        if (dismissErr) result.errors.push(`dismiss unresolvable events: ${dismissErr.message}`);
      }
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

      if (!event.event_id) continue; // live events are always stored first

      // Insert the memo FIRST, naming its event. A unique index on
      // hr_memos.triggered_by_event_id lets only ONE memo ever exist per
      // event, so two overlapping runs (the dispatcher plus a manual trigger,
      // or a retry) cannot issue it twice. Nothing is written before this
      // insert, so a run that dies at any point leaves no event stuck: either
      // the memo exists (and the next run links it below) or it does not
      // (and the event is still pending).
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

        if (memoError?.code === '23505') {
          // This event already has its memo: another run issued it, or an
          // earlier run inserted it and died (or lost the reply) before
          // marking the event. Point the event at that memo; send nothing.
          const { data: owner, error: ownerErr } = await this.supabase
            .from('hr_memos')
            .select('id')
            .eq('triggered_by_event_id', event.event_id)
            .maybeSingle();
          if (ownerErr || !owner) {
            throw new Error(`memo exists but could not be read: ${ownerErr?.message ?? 'no row'}`);
          }
          await this.linkEventToMemo(event.event_id, owner.id as string, result);
          continue;
        }
        if (memoError || !memoRow) throw new Error(memoError?.message ?? 'no memo row returned');

        await this.linkEventToMemo(event.event_id, memoRow.id as string, result);

        // Audit transition
        await this.supabase.from('hr_memo_state_transitions').insert({
          memo_id: memoRow.id,
          from_status: null,
          to_status: 'issued',
          actor_user_id: null,
          actor_role: 'cron',
          note: `auto-issued from event ${event.event_id}`,
        });

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

  /**
   * Mark an event as turned into this memo. Only an unmarked event is touched.
   * A failure is reported, not thrown: the memo already exists, and the next
   * run finds the event still pending, hits the unique memo and links it.
   */
  private async linkEventToMemo(
    eventId: string,
    memoId: string,
    result: DetectionRunResult,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('hr_memo_eligibility_events')
      .update({ processed_into_memo_id: memoId })
      .eq('id', eventId)
      .is('processed_into_memo_id', null);
    if (error) result.errors.push(`memo for event ${eventId}: link failed (next run retries): ${error.message}`);
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
    // Read EVERY open memo past the cutoff, a page at a time — a single capped
    // read silently dropped the oldest ones (and their head notices).
    const memos: Array<Record<string, unknown>> = [];
    for (let page = 0; page < OPEN_MEMO_MAX_PAGES; page++) {
      const from = page * OPEN_MEMO_PAGE;
      const { data: rows, error } = await this.supabase
        .from('hr_memos')
        .select('id, staff_id, status, issued_at')
        .eq('status', 'issued')
        .lte('issued_at', cutoff.toISOString())
        .order('issued_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + OPEN_MEMO_PAGE - 1);
      if (error) throw new Error(`open memos read failed: ${error.message}`);
      memos.push(...((rows ?? []) as Array<Record<string, unknown>>));
      if (!rows || rows.length < OPEN_MEMO_PAGE) break;
      if (page === OPEN_MEMO_MAX_PAGES - 1) {
        result.errors.push(`open memos: more than ${OPEN_MEMO_PAGE * OPEN_MEMO_MAX_PAGES}; the rest wait for the next run`);
      }
    }
    if (memos.length === 0) return;

    const recorded: RecordedNudge[] = [];
    for (const ids of chunk(memos.map((m) => m.id as string), 200)) {
      const { data: rows, error: nudgeErr } = await this.supabase
        .from('hr_memo_nudges')
        .select('id, memo_id, nudge_kind, recorded_at, status, created_at')
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
      const issuedOn = istDate(String(memo.issued_at));

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
        body =
          d.reminder_delivered === false
            ? `${head.staff_name} has not acknowledged or disputed an HR memo issued on ${issuedOn} (${days} days ago). A reminder could NOT be delivered to them in the app, so they may not know about it. Please tell them in person.`
            : `${head.staff_name} has not acknowledged or disputed an HR memo issued on ${issuedOn} (${days} days ago), and a reminder has already been sent. Please follow up with them.`;
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
      // A retry re-claims the failed / abandoned row only if it is still in
      // the exact state this run read, so two runs cannot both retry it.
      let claim: { id: string } | null = null;
      if (d.retry_of) {
        const { data: reclaimed, error: reclaimErr } = await this.supabase
          .from('hr_memo_nudges')
          .update({ status: 'claimed', run_id: runId, recorded_at: now.toISOString() })
          .eq('id', d.retry_of.id)
          .eq('status', d.retry_of.status)
          .eq('recorded_at', d.retry_of.recorded_at)
          .select('id');
        if (reclaimErr) {
          result.errors.push(`nudge re-claim ${d.kind} ${d.memo_id}: ${reclaimErr.message}`);
          continue;
        }
        const won = (reclaimed ?? []) as Array<{ id: string }>;
        if (won.length === 0) continue; // another run re-claimed it first
        claim = won[0];
      } else {
        const { data: inserted, error: claimErr } = await this.supabase
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
        if (claimErr || !inserted) {
          if (claimErr?.code !== '23505') {
            result.errors.push(`nudge claim ${d.kind} ${d.memo_id}: ${claimErr?.message ?? 'no row'}`);
          }
          continue;
        }
        claim = inserted as { id: string };
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
      // A retried nudge reuses its idempotency key. If an earlier attempt
      // already wrote the shared row (and maybe crashed before the fan-out or
      // before recording 'sent'), finish that delivery instead of failing on
      // the unique key or sending a second notice.
      if (params.idempotencyKey) {
        const { data: existing } = await this.supabase
          .from('notifications')
          .select('id')
          .eq('idempotency_key', params.idempotencyKey)
          .maybeSingle();
        if (existing?.id) return await this.linkRecipients(existing.id as string, params.recipients);
      }

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
        if (params.idempotencyKey && (notifErr as { code?: string } | null)?.code === '23505') {
          // Another run wrote it between our check and our insert.
          const { data: raced } = await this.supabase
            .from('notifications')
            .select('id')
            .eq('idempotency_key', params.idempotencyKey)
            .maybeSingle();
          if (raced?.id) return await this.linkRecipients(raced.id as string, params.recipients);
        }
        console.error('[memo-service] notifications insert failed', notifErr);
        return false;
      }

      return await this.linkRecipients(notifRow.id as string, params.recipients);
    } catch {
      return false;
    }
  }

  /**
   * One user_notifications row per recipient; rows already there are kept,
   * not duplicated. Names no conflict target, so it does not depend on a
   * unique constraint that no migration in this repo creates.
   */
  private async linkRecipients(notificationId: string, recipients: string[]): Promise<boolean> {
    const linked = async (): Promise<Set<string> | null> => {
      const { data, error } = await this.supabase
        .from('user_notifications')
        .select('user_id')
        .eq('notification_id', notificationId)
        .in('user_id', recipients);
      if (error) {
        console.error('[memo-service] user_notifications read failed', error);
        return null;
      }
      return new Set((data ?? []).map((r) => r.user_id as string));
    };

    const have = await linked();
    if (!have) return false;
    const missing = recipients.filter((rid) => !have.has(rid));
    if (missing.length === 0) return true;

    const { error: linkErr } = await this.supabase
      .from('user_notifications')
      .insert(missing.map((rid) => ({ notification_id: notificationId, user_id: rid })));
    if (!linkErr) return true;
    if ((linkErr as { code?: string }).code === '23505') {
      // Another run linked them between our read and our insert.
      const now = await linked();
      if (now && recipients.every((rid) => now.has(rid))) return true;
    }
    console.error('[memo-service] user_notifications insert failed', linkErr);
    return false;
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
