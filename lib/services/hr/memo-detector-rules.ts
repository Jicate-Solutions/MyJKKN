/**
 * HR memo detector — switch + acknowledgement-nudge rules (pure, no I/O).
 *
 * The switch lives in ONE platform_policies row, `hr.memo_auto_detector`
 * (global scope), seeded by migration 20270613101223 with mode 'dry_run':
 *
 *   mode 'off'     — the run does no work at all (reads this row, returns).
 *   mode 'dry_run' — detects and previews; records ONE hr_memo_detector_runs
 *                    row listing the memos and nudges it WOULD create/send.
 *                    Creates no memo, no event, no nudge, sends nothing.
 *   mode 'live'    — creates memos and sends in-app notices + nudges.
 *
 * A missing row, a non-object value or an unknown mode all read as 'off', so
 * nothing can ever message anyone by accident. The cron route's ?dry_run=1
 * can only LOWER live to dry_run — it never raises 'off' to anything.
 */

export const MEMO_DETECTOR_POLICY_KEY = 'hr.memo_auto_detector';

export type MemoDetectorMode = 'off' | 'dry_run' | 'live';

export interface MemoDetectorSettings {
  mode: MemoDetectorMode;
  /** Days after issue with no acknowledgement/dispute before ONE reminder to the staff member. */
  staff_reminder_after_days: number;
  /** Days after that reminder before ONE notice to the reporting head. */
  hod_notice_after_days: number;
  /** A memo older than this never gets a first reminder (stops a flood of old memos on day one). */
  nudge_max_age_days: number;
}

export const DEFAULT_MEMO_DETECTOR_SETTINGS: MemoDetectorSettings = {
  mode: 'off',
  staff_reminder_after_days: 3,
  hod_notice_after_days: 3,
  nudge_max_age_days: 30,
};

function positiveInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseMemoDetectorSettings(raw: unknown): MemoDetectorSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_MEMO_DETECTOR_SETTINGS };
  }
  const o = raw as Record<string, unknown>;
  const mode: MemoDetectorMode =
    o.mode === 'dry_run' || o.mode === 'live' || o.mode === 'off' ? o.mode : 'off';
  const d = DEFAULT_MEMO_DETECTOR_SETTINGS;
  return {
    mode,
    staff_reminder_after_days: positiveInt(o.staff_reminder_after_days, d.staff_reminder_after_days),
    hod_notice_after_days: positiveInt(o.hod_notice_after_days, d.hod_notice_after_days),
    nudge_max_age_days: positiveInt(o.nudge_max_age_days, d.nudge_max_age_days),
  };
}

/** ?dry_run=1 lowers live to dry_run; it never switches an 'off' detector on. */
export function effectiveMode(
  configured: MemoDetectorMode,
  forceDryRun: boolean,
): MemoDetectorMode {
  if (configured === 'off') return 'off';
  if (forceDryRun) return 'dry_run';
  return configured;
}

export type NudgeKind = 'staff_reminder' | 'hod_notice';

export interface NudgeMemo {
  id: string;
  status: string;
  issued_at: string;
}

export type NudgeStatus = 'claimed' | 'sent' | 'no_recipient' | 'failed';

export interface RecordedNudge {
  /** hr_memo_nudges.id — needed to re-claim a failed or abandoned row. */
  id?: string;
  memo_id: string;
  nudge_kind: NudgeKind;
  /** When the row was last claimed (a re-claim moves it forward). */
  recorded_at: string;
  /** Older rows (and some tests) carry no status; they read as 'sent'. */
  status?: NudgeStatus | string;
  /** First claim. Retries stop RETRY_WINDOW_DAYS after it. */
  created_at?: string;
}

export interface DueNudge {
  memo_id: string;
  kind: NudgeKind;
  /** Set when this is a retry of a failed or abandoned claim, not a first send. */
  retry_of?: { id: string; status: string; recorded_at: string };
  /**
   * hod_notice only: whether the reminder actually reached the team member.
   * false = it could not be delivered (nobody to send it to, or every retry
   * failed), so the head must not be told "a reminder has already been sent".
   */
  reminder_delivered?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** A 'claimed' row older than this was abandoned by a run that crashed mid-send. */
export const STALE_CLAIM_HOURS = 6;
/** A failed or abandoned nudge is retried (once per run) for this long after its first claim. */
export const RETRY_WINDOW_DAYS = 2;

type Outcome = 'sent' | 'undelivered' | 'retry' | 'in_flight';

function outcomeOf(r: RecordedNudge, now: Date): Outcome {
  const status = r.status ?? 'sent';
  if (status === 'sent') return 'sent';
  if (status === 'no_recipient') return 'undelivered';
  const recordedMs = new Date(r.recorded_at).getTime();
  const firstMs = new Date(r.created_at ?? r.recorded_at).getTime();
  const abandoned = status === 'claimed' && now.getTime() - recordedMs >= STALE_CLAIM_HOURS * HOUR_MS;
  if (status === 'failed' || abandoned) {
    if (!r.id) return 'undelivered';
    return now.getTime() - firstMs <= RETRY_WINDOW_DAYS * DAY_MS ? 'retry' : 'undelivered';
  }
  // 'claimed' and recent: another run is sending it right now.
  return 'in_flight';
}

function retryOf(r: RecordedNudge): DueNudge['retry_of'] {
  return { id: r.id as string, status: String(r.status), recorded_at: r.recorded_at };
}

/**
 * Which nudges are due now. At most ONE of each kind per memo, ever:
 *   - staff_reminder: memo still 'issued' (not acknowledged, disputed or
 *     resolved), issued at least staff_reminder_after_days ago, no older
 *     than nudge_max_age_days, and no staff_reminder recorded yet.
 *   - hod_notice: memo still 'issued', the staff_reminder reached an outcome
 *     (sent, or could not be delivered) at least hod_notice_after_days ago,
 *     and no hod_notice recorded yet. A reminder that failed or was abandoned
 *     mid-send is retried first; the head is never told a reminder was sent
 *     when it was not.
 *   - a failed or abandoned nudge of either kind is retried, once per run,
 *     for RETRY_WINDOW_DAYS after its first claim.
 */
export function dueNudges(
  memos: NudgeMemo[],
  recorded: RecordedNudge[],
  now: Date,
  settings: MemoDetectorSettings,
): DueNudge[] {
  const byMemo = new Map<string, Map<NudgeKind, RecordedNudge>>();
  for (const r of recorded) {
    const m = byMemo.get(r.memo_id) ?? new Map<NudgeKind, RecordedNudge>();
    m.set(r.nudge_kind, r);
    byMemo.set(r.memo_id, m);
  }

  const due: DueNudge[] = [];
  for (const memo of memos) {
    if (memo.status !== 'issued') continue;
    const issued = new Date(memo.issued_at).getTime();
    if (!Number.isFinite(issued)) continue;
    const ageMs = now.getTime() - issued;
    const done = byMemo.get(memo.id);
    const reminder = done?.get('staff_reminder');

    if (!reminder) {
      if (
        ageMs >= settings.staff_reminder_after_days * DAY_MS &&
        ageMs <= settings.nudge_max_age_days * DAY_MS
      ) {
        due.push({ memo_id: memo.id, kind: 'staff_reminder' });
      }
      continue;
    }

    const reminderOutcome = outcomeOf(reminder, now);
    if (reminderOutcome === 'retry') {
      due.push({ memo_id: memo.id, kind: 'staff_reminder', retry_of: retryOf(reminder) });
      continue;
    }
    if (reminderOutcome === 'in_flight') continue;
    const reminder_delivered = reminderOutcome === 'sent';

    const hod = done?.get('hod_notice');
    if (hod) {
      if (outcomeOf(hod, now) === 'retry') {
        due.push({ memo_id: memo.id, kind: 'hod_notice', retry_of: retryOf(hod), reminder_delivered });
      }
      continue;
    }
    const sinceReminder = now.getTime() - new Date(reminder.recorded_at).getTime();
    if (sinceReminder >= settings.hod_notice_after_days * DAY_MS) {
      due.push({ memo_id: memo.id, kind: 'hod_notice', reminder_delivered });
    }
  }
  return due;
}
