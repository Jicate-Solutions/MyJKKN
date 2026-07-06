// Loop Control Tower — shared display types.
export type Gate = 'on' | 'off' | 'half';
export type LoopTone = 'live' | 'early' | 'sched' | 'dark' | 'intake';

export interface LoopMetric {
  v: string;
  k: string;
  tone?: 'good' | 'warn' | 'mute';
}

/** One concrete piece of the loop's real output — a recent, DISTINCT item it
 *  produced. Lets the health view show the ACTUAL work (not just a count) so a
 *  reader can eyeball what worked and see whose profile it reflects. */
export interface LoopExample {
  /** Short label for the thing acted on (e.g. a course code). */
  ref: string;
  /** Whose work it reflects — the profile to look at to verify (a faculty email,
   *  or a "course-level" sentinel when the loop ran at course scope). */
  who: string;
  /** A one-line, human-readable excerpt of what the loop actually produced. */
  text: string;
  /** Optional small tag (e.g. 'what-worked' / 'coaching' / a date). */
  tag?: string;
}

export interface LoopCard {
  id: string;
  name: string;
  subid?: string;
  plain: string;
  cfg?: string;
  status: string;
  tone: LoopTone;
  gates: [Gate, Gate, Gate, Gate];
  metrics: LoopMetric[];
  note: string;
  noteTag?: string;
  /** Real last-run status from ai_routine_schedules.last_status (the dispatcher
   *  now records the routine's own result summary, not just the HTTP code).
   *  Absent for on-demand / direct-cron loops with no dispatcher schedule row. */
  lastRun?: string;
  /** Deep-link to the routine's row on /admin/ai-routines when it's dispatcher-
   *  managed — so "configure" is one click from the health view. */
  configHref?: string;
  /** Real recent outputs of the loop (deduplicated to DISTINCT items), shown so
   *  a reader can verify the work concretely instead of trusting a raw count. */
  examples?: LoopExample[];
  /** A "see this for yourself" link — where the loop's effect is actually
   *  visible (e.g. the admin surface for this loop's domain). */
  verifyHref?: string;
  verifyLabel?: string;
}

export interface LoopTier {
  title: string;
  gateLabel: string;
  blurb: string;
  loops: LoopCard[];
}
