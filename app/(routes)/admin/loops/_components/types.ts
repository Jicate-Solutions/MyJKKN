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
  /** True when the last run errored OR the routine went silent past its OWN
   *  cadence (derived from days_of_week: ~25h daily, ~7d weekly — see
   *  staleThresholdMs in lib/ai-routines/loop-governance.ts) — the card
   *  renders the last-run line red. Computed live by
   *  the page from the same row; the loop-watchdog cron is the half that
   *  notifies when nobody is looking (governance wires, 2026-07-11). */
  lastRunBad?: boolean;
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

// ── loop_registry / loop_edges / loop_audits (2026-07-10) ───────────────────
// The data-driven backbone behind the Tower's per-loop chips and the Wiring
// view. Distinct from `Gate`/`LoopCard` above (which describe the hand-curated
// four-gate cards on this page) — these mirror the new prod tables 1:1.
export type GateState = 'on' | 'off' | 'half';

export interface LoopRegistryRow {
  loop_key: string;
  name: string;
  stack_tier: number;
  loop_class: 'self_improving' | 'cadence' | 'accountability' | 'intake' | 'infrastructure';
  domain?: string | null;
  description?: string | null;
  gates: Record<'g' | 'a' | 'm' | 'f', GateState>;
  routine_id?: string | null;
  is_active?: boolean;
  owner_email?: string | null;
  counter_metric?: string | null;
  // ── Charter legs (Director-adopted rule, 2026-07-26) ───────────────────────
  // Five nullable columns landing in a sibling migration. A leg is written
  // ONLY with a receipt that it actually runs; any NULL leg means the row is
  // honestly a METER, not a loop. All optional here because the columns may
  // not exist in prod until that migration applies — a missing/undefined leg
  // must read exactly like NULL (= Meter), never crash the page.
  outcome_metric?: string | null;
  baseline_window?: string | null;
  intervention?: string | null;
  verdict_owner?: string | null;
  remeasure_window?: string | null;
}

export interface LoopConflictRow {
  conflict_key: string;
  title: string;
  loops: string[];
  description: string;
  arbiter_email: string;
  status: 'open' | 'ruled' | 'resolved';
  ruling?: string | null;
}

export interface LoopEdgeRow {
  from_key: string;
  to_key: string;
  what_flows: 'measured_outcomes' | 'decisions' | 'fuel' | 'escalations';
  note: string | null;
  is_draft: boolean;
}

export interface LoopAuditRow {
  loop_key: string;
  audited_at: string;
  layer: 'sim' | 'walk' | 'full';
  verdict: string | null;
}

// ── Cluster lens (C4, 2026-07-26) ────────────────────────────────────────────
// The CAC's horizontal slice: a hand-picked set of institutions (a discipline
// cluster) whose loop signals are aggregated and compared against the SAME
// aggregate one window earlier — the cluster's OWN baseline, never another
// cluster. There is no cluster→college mapping table; the URL query string IS
// the cluster (Phase 1), with committee rows surfacing only as picker presets.
export interface ClusterInstitutionOption {
  id: string;
  name: string;
  /** institutions.display_name — the live table's short label column (there is
   *  no short_name column; selecting one 400s the whole read, CFT 2026-07-26). */
  display_name?: string | null;
}

/** A picker preset read from accreditation_committees committee_type='cluster'
 *  rows (C1 lands that type value — zero rows today, and the picker renders no
 *  preset strip at all until they exist). */
export interface ClusterPreset {
  id: string;
  name: string;
  institutionIds: string[];
}

/** One aggregated cluster signal: the SAME count over two adjacent windows —
 *  `current` (the last N days) vs `baseline` (the N days before that). null =
 *  that count query failed and the cell renders hollow, never zero — the same
 *  swallow-to-null contract as the Tower's cnt(). */
export interface ClusterSignal {
  key: string;
  label: string;
  /** Plain-words line under the number — what one unit is. */
  plain: string;
  current: number | null;
  baseline: number | null;
}
