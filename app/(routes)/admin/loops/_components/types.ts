// Loop Control Tower — shared display types.
export type Gate = 'on' | 'off' | 'half';
export type LoopTone = 'live' | 'early' | 'sched' | 'dark' | 'intake';

export interface LoopMetric {
  v: string;
  k: string;
  tone?: 'good' | 'warn' | 'mute';
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
}

export interface LoopTier {
  title: string;
  gateLabel: string;
  blurb: string;
  loops: LoopCard[];
}
