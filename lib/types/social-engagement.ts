/**
 * Department Engagement Loop — shared types (the contract layer).
 *
 * The engagement loop turns a broadcast department Instagram handle into a
 * participatory loop: members SEE their handle's feed (real posts, deep-linked),
 * take a weekly CONTRIBUTOR turn, SUBMIT content the owner curates, and can raise
 * a CONCERN — while a within-college momentum LEADERBOARD recognises real signal.
 *
 * This file is the single contract between:
 *   - data layer   (the app/api/social/engagement route handlers)
 *   - service layer (lib/services/social/engagement-service.ts)  — client fetch wrappers
 *   - UI layer      (dashboard card, leaderboard page, member + owner surfaces)
 *
 * Signal rule (single source of truth, mirrored from lib/services/social/loop-service):
 *   realSignal = saves + shares + comments   ← likes are VANITY: surfaced for context,
 *                                               NEVER scored or ranked.
 */

// ── Handle identity (fn_social_my_dept_handle) — safe columns only, never credentials ──
export interface DeptHandle {
  dept_account_id: string;
  username: string;
  purpose_line: string | null;
  content_playbook: string | null;
  department_name: string | null;
  college_label: string | null;
  ig_account_id: string | null;
  metrics_source: string | null;
  posting_cadence_days: number | null;
  lifecycle_status: string | null;
}

// ── One post in the caller's dept feed (fn_social_my_dept_feed) ──
export interface FeedPost {
  post_id: string;
  media_type: string | null;
  caption: string | null;
  permalink: string | null;
  posted_at: string | null;
  saves: number;
  shares: number;
  comments: number;
  /** Vanity — shown greyed for context, never the headline. */
  likes: number;
  /** saves + shares + comments — the only number that counts. */
  real_signal: number;
}

/** Recognition tier for a leaderboard row. */
export type MomentumTier = 'rising' | 'steady' | 'quiet';

// ── One department on the within-college momentum board (fn_social_leaderboard_my_college) ──
export interface LeaderboardRow {
  dept_account_id: string;
  username: string;
  department_name: string | null;
  posts_recent: number;
  recent_signal: number;
  prior_signal: number;
  /** recent_signal − prior_signal. Positive = gaining momentum. */
  momentum_delta: number;
  /** recent_signal / posts_recent — per-post quality, not volume. */
  avg_real_signal: number | null;
  rank: number;
  tier: MomentumTier;
  /** The single biggest positive mover this window. */
  is_most_improved: boolean;
}

// ── Write-path rows ──────────────────────────────────────────────────────────
export type ContributionStatus = 'submitted' | 'approved' | 'posted' | 'declined';

export interface Contribution {
  id: string;
  dept_account_id: string;
  contributor_profile_id: string;
  contributor_name: string | null;
  title: string | null;
  caption: string | null;
  media_url: string | null;
  status: ContributionStatus;
  ig_post_id: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  thanked_at: string | null;
  created_at: string;
}

export type RotaStatus = 'assigned' | 'active' | 'done' | 'skipped';

export interface RotaEntry {
  id: string;
  dept_account_id: string;
  week_start: string;
  contributor_profile_id: string;
  contributor_name: string | null;
  status: RotaStatus;
  note: string | null;
  created_at: string;
}

export type ConcernStatus = 'open' | 'reviewing' | 'resolved';

export interface ConcernReport {
  id: string;
  dept_account_id: string;
  reporter_profile_id: string | null;
  post_ref: string | null;
  reason: string;
  status: ConcernStatus;
  resolution: string | null;
  created_at: string;
}

// ── Owner-facing: a handle the caller may curate (fn_social_managed_handles) ──
export interface ManagedHandle {
  dept_account_id: string;
  username: string;
  department_name: string | null;
  college_label: string | null;
  purpose_line: string | null;
  content_playbook: string | null;
  posting_cadence_days: number | null;
  lifecycle_status: string | null;
  metrics_source: string | null;
  is_owner: boolean;
}

export interface ManagedHandlesResponse {
  success: boolean;
  handles?: ManagedHandle[];
  error?: string;
}

export interface SetBriefBody {
  dept_account_id: string;
  purpose_line?: string;
  content_playbook?: string;
  posting_cadence_days?: number;
}

// ── API response shapes (all fail-soft: { success:false, error } instead of throwing) ──
export interface HandleFeedResponse {
  success: boolean;
  handle?: DeptHandle | null;
  feed?: FeedPost[];
  /** The caller's own rota turn this/next week, if any (loop hook). */
  myRota?: RotaEntry | null;
  /** Count of the caller's own contributions still awaiting review (loop hook). */
  myPendingContributions?: number;
  error?: string;
}

export interface LeaderboardResponse {
  success: boolean;
  rows?: LeaderboardRow[];
  /** The caller's own dept row, pulled out for "your department" highlighting. */
  mine?: LeaderboardRow | null;
  windowDays?: number;
  error?: string;
}

export interface ContributionsResponse {
  success: boolean;
  contributions?: Contribution[];
  /** Total rows matching the query (for pagination — the page may be capped below this). */
  total?: number;
  error?: string;
}

export interface RotaResponse {
  success: boolean;
  rota?: RotaEntry[];
  error?: string;
}

export interface ConcernsResponse {
  success: boolean;
  concerns?: ConcernReport[];
  error?: string;
}

// ── Write request bodies ──
export interface SubmitContributionBody {
  dept_account_id: string;
  title?: string;
  caption?: string;
  media_url?: string;
}

export interface ReviewContributionBody {
  id: string;
  status: Extract<ContributionStatus, 'approved' | 'declined' | 'posted'>;
  review_note?: string;
  /** Set thanked_at when approving/posting to fire the "thank you" (Appreciation). */
  thank?: boolean;
  /**
   * When marking 'posted', the ig_posts.id this contribution became. Links the
   * contribution to its real post so the recognition nudge can compute real-signal
   * (saves+shares+comments) truthfully. Ignored for approved/declined.
   */
  ig_post_id?: string;
}

// ── Owner post-attribution picker (fn_social_recent_posts_for_handle) ──
export interface RecentPost {
  post_id: string;
  caption: string | null;
  permalink: string | null;
  media_type: string | null;
  posted_at: string | null;
}

export interface RecentPostsResponse {
  success: boolean;
  posts?: RecentPost[];
  error?: string;
}

export interface AssignRotaBody {
  dept_account_id: string;
  week_start: string;
  contributor_profile_id: string;
  note?: string;
}

export interface ReportConcernBody {
  dept_account_id: string;
  reason: string;
  post_ref?: string;
  /** When true, submit with a NULL reporter so the owner can't see who raised it. */
  anonymous?: boolean;
}

export interface ResolveConcernBody {
  id: string;
  status: Extract<ConcernStatus, 'reviewing' | 'resolved'>;
  resolution?: string;
}
