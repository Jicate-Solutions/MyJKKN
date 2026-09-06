// =====================================================================
// Work-signals spine — shared types (Phase 1)
// =====================================================================
// Mirrors the jsonb contract of fn_work_signals_for(from, to). ONE canonical
// shape every surface reads, so the dashboard, My Pulse, the Facilitator board,
// the profile and accreditation packs can never disagree on a number again.
//
// Doctrine: presence/activity signals only. The self-scoped engine NEVER ranks
// or compares — comparison lives only in a separate, leadership-gated aggregate.

export type WorkSignalCategory =
  | 'presence'
  | 'feedback'
  | 'improvement'
  | 'coverage';

export type WorkSignalAttribution = 'single' | 'dual';

export type WorkSignalUnit = 'count' | 'ratio';

/** One signal for one person over the requested window. */
export interface WorkSignal {
  key: string;
  label: string;
  category: WorkSignalCategory;
  unit: WorkSignalUnit;
  attribution: WorkSignalAttribution;
  /** Primary value. For `dual` marking this is the ASSIGNED count (your classes
   *  that got marked, by anyone). For everything else, the single count. */
  value: number;
  /** Only present when `attribution === 'dual'`: the PERSONAL count (sessions
   *  you personally marked). `null` for single-attribution signals. */
  value_personal: number | null;
  /** Phase 1.1 deep-links: the page where this kind of work begins. A ZERO
   *  signal renders as a "start here" link to this route. `null` = no link. */
  action_route: string | null;
  /** Optional short CTA label for the deep-link (card falls back to "Start
   *  here"). `null` when the registry row has no custom label. */
  action_label: string | null;
}

/** Full engine response. `subject_matched === false` means the account could not
 *  be keyed (e.g. missing/mismatched email) — surface this explicitly, never a
 *  silent all-zero that reads like "did nothing". */
export interface WorkSignalsResult {
  window: { from: string; to: string };
  subject_matched: boolean;
  last_signal_at: string | null;
  signals: WorkSignal[];
}
