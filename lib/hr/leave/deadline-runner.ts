/**
 * HR staff harness, lane A — the two scheduled passes that enforce leave
 * deadlines. SERVER ONLY: every function takes a SERVICE-ROLE client, because
 * the approver lookups cross every institution and the functions they call
 * are granted to service_role alone.
 * Created 2026-10-01.
 *
 *   runLeaveEscalations    — hourly (app/api/cron/hr/leave-escalations)
 *   runCompOffExpiryNudges — daily  (app/api/cron/hr/comp-off-expiry-nudges)
 *
 * The decisions (who is overdue, who is told, which comp-off window) are in
 * deadline-harness.ts and unit-tested there. This file only reads, calls the
 * recording functions and sends. Recording happens BEFORE sending and is
 * idempotent in the database, so a crash mid-run can lose a notice but can
 * never send one twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import { todayIST } from '@/lib/hr/raise-effective-date';
import {
  buildEscalationNotices,
  capNoticesPerRecipient,
  COMP_OFF_AUTO_REJECT_PREFIX,
  compOffNudgeKind,
  daysBetweenISO,
  escalationKey,
  pickCompOffApprovers,
  pickCompOffClaimant,
  pickEscalationRecipients,
  goLiveFromPolicy,
  GO_LIVE_POLICY_KEY,
  selectOverdue,
  startedBeforeGoLive,
  type CompOffRecipientRow,
  type EscalationCandidate,
  type EscalationNotice,
  type EscalationRecipientRow,
} from '@/lib/hr/leave/deadline-harness';
import { ladderCoversDuty } from '@/lib/hr/leave/ladder-handoff';

const PAGE = 1000;
const IN_CHUNK = 200;

type LeaveCandidateRow = EscalationCandidate & {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
};

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** yyyy-MM-dd → "05 Oct 2026". A date-only value, so it is formatted in UTC. */
export function formatDayIN(iso: string): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(t));
}

/**
 * The go-live moment (the policy row the migration seeds). A read error, a
 * missing row or an unreadable value all answer `now` — fail closed, so nothing
 * that began waiting before this run is escalated or nudged.
 */
export async function readGoLiveAt(db: SupabaseClient, now: Date): Promise<Date> {
  try {
    const { data, error } = await db
      .from('platform_policies')
      .select('value')
      .eq('policy_key', GO_LIVE_POLICY_KEY)
      .eq('scope_type', 'global')
      .is('scope_id', null)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return goLiveFromPolicy((data as { value?: unknown } | null)?.value, now);
  } catch (err) {
    console.warn('[hr/leave-deadlines] could not read the go-live cutoff; using now', {
      error: String((err as { message?: unknown } | null)?.message ?? err),
    });
    return now;
  }
}

async function staffNames(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const part of chunks([...new Set(ids)], IN_CHUNK)) {
    const { data, error } = await db
      .from('staff')
      .select('id, first_name, last_name')
      .in('id', part);
    if (error) throw error;
    for (const s of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      names.set(s.id, name || 'A team member');
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Leave escalations
// ---------------------------------------------------------------------------

export interface LeaveEscalationResult {
  candidates: number;
  overdue: number;
  escalated: number;
  status_refused: number;
  already: number;
  moved: number;
  decided: number;
  locked: number;
  no_recipient: number;
  notified: number;
  overflow_notices: number;
  /** Escalations recorded but not announced: the HR chase ladder (duty L1) tells people instead. */
  ladder_covered: number;
  errors: string[];
}

async function loadLeaveCandidates(db: SupabaseClient): Promise<LeaveCandidateRow[]> {
  const out: LeaveCandidateRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('hr_leave_applications')
      .select(
        'id, employee_id, leave_type_id, status, current_step, approval_chain, created_at, start_date, end_date, superseded_by, final_decided_at'
      )
      .in('status', ['pending', 'escalated'])
      .is('superseded_by', null)
      .is('final_decided_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as LeaveCandidateRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function loadEscalatedSteps(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const part of chunks(ids, IN_CHUNK)) {
    const { data, error } = await db
      .from('hr_leave_deadline_nudges')
      .select('leave_application_id, step_index')
      .eq('kind', 'leave_escalation')
      .in('leave_application_id', part);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ leave_application_id: string; step_index: number }>) {
      keys.add(escalationKey(r.leave_application_id, r.step_index));
    }
  }
  return keys;
}

export async function runLeaveEscalations(
  db: SupabaseClient,
  now: Date = new Date()
): Promise<LeaveEscalationResult> {
  const result: LeaveEscalationResult = {
    candidates: 0,
    overdue: 0,
    escalated: 0,
    status_refused: 0,
    already: 0,
    moved: 0,
    decided: 0,
    locked: 0,
    no_recipient: 0,
    notified: 0,
    overflow_notices: 0,
    ladder_covered: 0,
    errors: [],
  };

  const candidates = await loadLeaveCandidates(db);
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const done = await loadEscalatedSteps(db, candidates.map((c) => c.id));
  // Steps that began waiting before go-live are never escalated (no backlog flood).
  const goLiveAt = await readGoLiveAt(db, now);
  const overdue = selectOverdue(candidates, now, done, goLiveAt);
  result.overdue = overdue.length;
  if (overdue.length === 0) return result;

  const toNotify: Array<{ o: (typeof overdue)[number]; picked: ReturnType<typeof pickEscalationRecipients> }> = [];
  // The status flip and the ledger row stay exactly as they are: the escalation
  // is workflow, and the ladder's L1 duty reads that status. Only the messages
  // stand down when the ladder chases L1 itself, and then the ledger records
  // nobody as notified, because nobody was.
  const ladderHasL1 = await ladderCoversDuty(db, 'L1');

  for (const o of overdue) {
    try {
      const { data: rows, error: recErr } = await db.rpc('fn_hr_leave_escalation_recipients', {
        p_application_id: o.applicationId,
      });
      if (recErr) throw recErr;
      const picked = pickEscalationRecipients((rows ?? []) as EscalationRecipientRow[], {
        currentIsFinal: o.isFinalStep,
      });
      const notified = [...picked.approvers, ...picked.nextLevel];

      const { data: outcome, error: recordErr } = await db.rpc('fn_hr_leave_record_escalation', {
        p_application_id: o.applicationId,
        p_step_index: o.stepIndex,
        p_due_at: o.dueAt,
        p_notified: ladderHasL1 ? [] : notified,
      });
      if (recordErr) throw recordErr;

      switch (outcome as string) {
        case 'escalated':
        case 'status_refused':
          if (outcome === 'escalated') result.escalated++;
          else result.status_refused++;
          if (notified.length === 0) {
            result.no_recipient++;
            console.warn('[hr/leave-escalations] escalated with nobody reachable', {
              application: o.applicationId,
              step: o.stepIndex,
            });
          } else {
            toNotify.push({ o, picked });
          }
          break;
        case 'already':
          result.already++;
          break;
        case 'locked':
          result.locked++;
          break;
        case 'moved':
          result.moved++;
          break;
        default:
          result.decided++;
      }
    } catch (err) {
      result.errors.push(`${o.applicationId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (toNotify.length === 0) return result;

  if (ladderHasL1) {
    result.ladder_covered = toNotify.length;
    return result;
  }

  // Names for the notice text, fetched once for the whole run.
  const apps = toNotify.map(({ o }) => byId.get(o.applicationId)!);
  const names = await staffNames(db, apps.map((a) => a.employee_id));
  const typeNames = new Map<string, string>();
  for (const part of chunks([...new Set(apps.map((a) => a.leave_type_id))], IN_CHUNK)) {
    const { data, error } = await db
      .from('hr_leave_types')
      .select('id, leave_type_name')
      .in('id', part);
    if (error) throw error;
    for (const t of (data ?? []) as Array<{ id: string; leave_type_name: string | null }>) {
      typeNames.set(t.id, t.leave_type_name ?? 'leave');
    }
  }

  const notices: EscalationNotice[] = [];
  for (const { o, picked } of toNotify) {
    const app = byId.get(o.applicationId)!;
    notices.push(
      ...buildEscalationNotices(o, picked, {
        applicantName: names.get(app.employee_id) ?? 'A team member',
        leaveTypeName: typeNames.get(app.leave_type_id) ?? 'leave',
        startDate: formatDayIN(app.start_date),
        endDate: formatDayIN(app.end_date),
      })
    );
  }

  const { items, overflow } = capNoticesPerRecipient(notices);
  for (const n of items) {
    result.notified += await StaffNotificationService.notifyLeaveEscalated(
      db,
      n.applicationId,
      n.userId,
      n.title,
      n.message,
      { audience: n.audience }
    );
  }
  for (const [userId, more] of overflow) {
    result.overflow_notices += await StaffNotificationService.notifyLeaveEscalationOverflow(
      db,
      userId,
      more
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Comp-off expiry nudges and lapse notices
// ---------------------------------------------------------------------------

export interface CompOffNudgeResult {
  nudge_candidates: number;
  nudged_7d: number;
  nudged_2d: number;
  lapse_candidates: number;
  lapse_notices: number;
  already: number;
  stale: number;
  no_recipient: number;
  /** Approver nudges left to the HR chase ladder (duty L2). */
  ladder_covered: number;
  errors: string[];
}

/** How far back a lapse is still news. The nightly job runs every night, so this is several runs of slack. */
const LAPSE_LOOKBACK_DAYS = 3;

interface ClaimRow {
  id: string;
  employee_id: string;
  worked_date: string;
  expires_on: string;
  created_at: string;
}

function addDaysISO(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

async function loadSentKinds(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const sent = new Set<string>();
  for (const part of chunks(ids, IN_CHUNK)) {
    const { data, error } = await db
      .from('hr_leave_deadline_nudges')
      .select('comp_off_credit_id, kind')
      .in('comp_off_credit_id', part);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ comp_off_credit_id: string; kind: string }>) {
      sent.add(`${r.comp_off_credit_id}:${r.kind}`);
    }
  }
  return sent;
}

export async function runCompOffExpiryNudges(
  db: SupabaseClient,
  now: Date = new Date()
): Promise<CompOffNudgeResult> {
  const result: CompOffNudgeResult = {
    nudge_candidates: 0,
    nudged_7d: 0,
    nudged_2d: 0,
    lapse_candidates: 0,
    lapse_notices: 0,
    already: 0,
    stale: 0,
    no_recipient: 0,
    ladder_covered: 0,
    errors: [],
  };
  const today = todayIST(now);

  // Undecided claims whose credit expires within the next 7 days.
  const { data: pendingData, error: pendingErr } = await db
    .from('hr_comp_off_credits')
    .select('id, employee_id, worked_date, expires_on, created_at')
    .eq('status', 'pending')
    .eq('source', 'claim')
    .gte('expires_on', today)
    .lte('expires_on', addDaysISO(today, 7))
    .order('expires_on', { ascending: true });
  if (pendingErr) throw pendingErr;
  const pending = (pendingData ?? []) as ClaimRow[];
  result.nudge_candidates = pending.length;

  // Claims the nightly job closed in the last few days.
  const since = new Date(now.getTime() - LAPSE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: lapsedData, error: lapsedErr } = await db
    .from('hr_comp_off_credits')
    .select('id, employee_id, worked_date, expires_on, created_at')
    .eq('status', 'rejected')
    .eq('source', 'claim')
    .is('approved_by', null)
    .like('rejection_reason', `${COMP_OFF_AUTO_REJECT_PREFIX}%`)
    .gte('approved_at', since);
  if (lapsedErr) throw lapsedErr;
  const lapsed = (lapsedData ?? []) as ClaimRow[];
  result.lapse_candidates = lapsed.length;

  if (pending.length === 0 && lapsed.length === 0) return result;

  const sent = await loadSentKinds(db, [...pending, ...lapsed].map((c) => c.id));
  const names = await staffNames(db, [...pending, ...lapsed].map((c) => c.employee_id));
  // When the ladder chases L2, it nudges the approvers; the lapse notice to the claimant below is unchanged.
  const ladderHasL2 = pending.length > 0 && (await ladderCoversDuty(db, 'L2'));
  // Claims filed before go-live are never nudged (no backlog flood). The lapse
  // notice below is news of tonight's auto-reject, not a reminder, so it stays.
  const goLiveAt = pending.length > 0 ? await readGoLiveAt(db, now) : now;

  for (const c of pending) {
    const kind = compOffNudgeKind(c.expires_on, today);
    if (!kind) continue;
    if (startedBeforeGoLive(c.created_at, goLiveAt)) continue;
    if (ladderHasL2 && (kind === 'comp_off_expiry_7d' || kind === 'comp_off_expiry_2d')) {
      result.ladder_covered++;
      continue;
    }
    if (sent.has(`${c.id}:${kind}`)) {
      result.already++;
      continue;
    }
    try {
      const { data: rows, error } = await db.rpc('fn_hr_comp_off_nudge_recipients', {
        p_credit_id: c.id,
      });
      if (error) throw error;
      const approvers = pickCompOffApprovers((rows ?? []) as CompOffRecipientRow[]);
      if (approvers.length === 0) {
        // Not recorded: tomorrow's run tries again while the window is open.
        result.no_recipient++;
        continue;
      }
      const { data: outcome, error: recErr } = await db.rpc('fn_hr_comp_off_record_nudge', {
        p_credit_id: c.id,
        p_kind: kind,
        p_notified: approvers,
      });
      if (recErr) throw recErr;
      if (outcome === 'already') {
        result.already++;
        continue;
      }
      if (outcome !== 'recorded') {
        result.stale++;
        continue;
      }
      await StaffNotificationService.notifyCompOffExpiryNudge(
        db,
        c.id,
        approvers,
        names.get(c.employee_id) ?? 'A team member',
        formatDayIN(c.worked_date),
        formatDayIN(c.expires_on),
        daysBetweenISO(today, c.expires_on)
      );
      if (kind === 'comp_off_expiry_7d') result.nudged_7d++;
      else result.nudged_2d++;
    } catch (err) {
      result.errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const c of lapsed) {
    if (sent.has(`${c.id}:comp_off_lapsed`)) {
      result.already++;
      continue;
    }
    try {
      const { data: rows, error } = await db.rpc('fn_hr_comp_off_nudge_recipients', {
        p_credit_id: c.id,
      });
      if (error) throw error;
      const claimant = pickCompOffClaimant((rows ?? []) as CompOffRecipientRow[]);
      if (!claimant) {
        result.no_recipient++;
        continue;
      }
      const { data: outcome, error: recErr } = await db.rpc('fn_hr_comp_off_record_nudge', {
        p_credit_id: c.id,
        p_kind: 'comp_off_lapsed',
        p_notified: [claimant],
      });
      if (recErr) throw recErr;
      if (outcome === 'already') {
        result.already++;
        continue;
      }
      if (outcome !== 'recorded') {
        result.stale++;
        continue;
      }
      result.lapse_notices += await StaffNotificationService.notifyCompOffLapsed(
        db,
        c.id,
        claimant,
        formatDayIN(c.worked_date),
        formatDayIN(c.expires_on)
      );
    } catch (err) {
      result.errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
