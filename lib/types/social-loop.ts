/**
 * Social Loop Engine — shared types.
 *
 * The "loop" is the weekly READ → DECIDE → (act) → LEARN cycle a department runs
 * on its Instagram handle. This file is the contract between:
 *   - the data layer   (app/api/social/loop/route.ts)            ← GET + POST
 *   - the service layer (lib/services/social/loop-service.ts)    ← client fetch wrappers
 *   - the UI layer      (sibling agents' page + components)
 *
 * Loop math (single source of truth — mirrored exactly in route.ts):
 *   realSignal(post) = (saves||0) + (shares||0) + (comments||0)   ← likes are vanity,
 *                       returned for display but NEVER scored.
 *   barToBeat        = max realSignal across the window.
 *   formatLever      = window posts grouped by media_type; avg realSignal per type.
 */

/** One post in the loop window, scored on real signal (never likes). */
export interface LoopPost {
  id: string;
  ig_media_id: string | null;
  posted_at: string | null;
  media_type: string | null;
  /** Truncated server-side to <= 120 chars. */
  caption: string | null;
  permalink: string | null;
  // Latest-snapshot raw metrics (first-wins by snapshot_at desc).
  reach: number;
  impressions: number;
  engagement: number;
  saves: number;
  shares: number;
  comments: number;
  /** Vanity — surfaced but never scored. */
  likes: number;
  plays: number;
  /** (saves + shares + comments) — the only thing that's scored. */
  realSignal: number;
  /** 1 = highest realSignal in the window. */
  rank: number;
  /** True for the single post whose realSignal equals barToBeat. */
  isBarToBeat: boolean;
}

/** Per-media-type aggregate used to pick the next format. */
export interface FormatTypeStat {
  type: string;
  /** Number of window posts of this media_type. */
  n: number;
  /** Average realSignal across this type's posts. */
  avg: number;
  /** Average likes across this type's posts (vanity, for context only). */
  avgLikes: number;
}

/** The "which format wins" lever derived from the window. */
export interface FormatLever {
  byType: FormatTypeStat[];
  /** Highest-avg type, or null when the window is empty. */
  best: FormatTypeStat | null;
  /** Lowest-avg type, or null when the window is empty. */
  worst: FormatTypeStat | null;
  /** best.avg / max(worst.avg, 1) — how many x the best format out-earns the worst. */
  multiple: number;
}

/** Domain-resonance note: how many window posts carry the #apulse tag. */
export interface DomainNote {
  tagged: number;
  total: number;
  message: string;
}

/** The READ half of the loop — what the window is telling us. */
export interface LoopRead {
  posts: LoopPost[];
  formatLever: FormatLever;
  barToBeat: number;
  domainNote: DomainNote;
}

/** The DECIDE half of the loop — the instruction for the next cycle. */
export interface LoopDecide {
  formatInstruction: string;
  barToBeat: number;
  nextInstruction: string;
  domainHypothesis: string;
}

/** A closed cycle persisted to social_loop_playbook. */
export interface PlaybookEntry {
  id: string;
  account_id: string;
  cycle_no: number;
  week_start: string;
  /** Snapshot of the LoopRead at close time (jsonb). */
  read_summary: LoopRead | null;
  /** Snapshot of the LoopDecide at close time (jsonb). */
  decide: LoopDecide | null;
  learning: string | null;
  created_by: string | null;
  created_at: string;
}

/** The resolved account the loop is computed for. */
export interface LoopAccount {
  id: string;
  username: string | null;
  metrics_source: string | null;
}

/** Per-request config (policy-driven, fail-soft to code defaults). */
export interface LoopConfig {
  windowSize: number;
  cycleLengthDays: number;
}

/** GET /api/social/loop response shape. */
export interface LoopResponse {
  success: boolean;
  account?: LoopAccount;
  read?: LoopRead;
  decide?: LoopDecide;
  playbook?: PlaybookEntry[];
  config?: LoopConfig;
  /** metrics_source === 'graph' → engagement is readable. */
  readable?: boolean;
  /** Present only when !readable — explains why engagement reads 0. */
  notReadableMessage?: string;
  /** Present only on failure. */
  error?: string;
}

/** POST /api/social/loop request body — closes the current cycle. */
export interface CloseCycleBody {
  /** uuid or username; defaults to jkknpharmacy server-side. */
  accountId?: string;
  learning: string;
}
