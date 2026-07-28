export type BugReportStatus =
  | 'new'
  | 'seen'
  | 'in_progress'
  | 'resolved'
  | 'wont_fix'
  | 'duplicate';

export type BugReportCategory =
  | 'bug'
  | 'feature_request'
  | 'ui_design'
  | 'performance'
  | 'security'
  | 'other'
  | 'question';

/** AI-generated developer briefing stored at bug_reports.metadata.ai_triage
 *  (written by POST /api/bug-reports/[id]/ai-triage, produced on the ₹0 Max lane). */
export interface AiTriageBriefing {
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category_verdict: string;
  module_guess: string;
  root_cause: string;
  fix_steps: string[];
  confidence: 'low' | 'medium' | 'high';
  generated_at: string;
  job_id: string;
  lane: string;
}

/**
 * Tier 2 AI re-verification verdict (bug.reverify recipe). Recommendation only —
 * never resolves the bug or emails anyone. Persisted in
 * bug_reports.metadata.ai_reverify.
 */
export interface AiReverifyVerdict {
  verdict: 'likely_fixed' | 'still_broken' | 'inconclusive';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  what_would_confirm: string;
  reproducible: 'read' | 'write' | 'unknown';
  generated_at: string;
  job_id: string;
}

/**
 * AI duplicate check (bug.duplicate_check recipe). Judges whether this report
 * describes the SAME defect as an existing open report, by meaning rather than
 * string overlap — the gap fn_bug_cluster_scan's trigram floors leave open.
 * SUGGESTION ONLY: never sets duplicate_of, never resolves, never notifies.
 * Persisted in bug_reports.metadata.ai_duplicate_check.
 */
export interface AiDuplicateCheck {
  verdict: 'duplicate' | 'related' | 'distinct';
  /** Resolved back against the shortlist actually sent — null if unresolvable. */
  canonical_display_id: string | null;
  canonical_bug_id: string | null;
  /** Whether the proposed canonical is itself already in a group. */
  canonical_in_cluster?: boolean | null;
  canonical_similarity?: number | null;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  also_consider: { display_id: string; bug_id: string; relation: string }[];
  /** How many candidates the model compared against (0 = AI call skipped). */
  candidates_considered: number;
  /** True when a "duplicate" verdict named a canonical we could not resolve. */
  downgraded?: boolean;
  generated_at: string;
  job_id: string | null;
  lane: string;
}

/**
 * One AI-detected group (bug_clusters row) this report belongs to — the reverse
 * lookup the detail page previously had no way to make.
 */
export interface BugClusterMembership {
  id: string;
  status: 'proposed' | 'confirmed' | 'dismissed';
  member_count: number;
  seed_bug_id: string;
  /** True when THIS report is the group's seed. */
  is_seed: boolean;
  module_names: string[];
  first_seen_at: string;
  last_scan_at: string;
  diagnosis_status: 'requested' | 'running' | 'done' | 'error' | null;
  root_cause: string | null;
  single_fix_feasible: boolean | null;
  confidence: string | null;
  fix_status: 'requested' | 'running' | 'pr_opened' | 'error' | 'no_change' | null;
  fix_pr_url: string | null;
  fix_pr_number: number | null;
  verify_status: 'running' | 'done' | 'error' | null;
  verify_tally: {
    likely_fixed: number;
    still_broken: number;
    inconclusive: number;
    failed: number;
    pending: number;
  } | null;
  /** This report's own verdict from the group's verify pass, when present. */
  my_verify_verdict: 'likely_fixed' | 'still_broken' | 'inconclusive' | null;
}

export interface BugReport {
  id: string;
  display_id: string;
  created_at: string;
  reporter_user_id: string;
  page_url: string;
  module_name?: string | null;
  sub_module_name?: string | null;
  description: string;
  category?: BugReportCategory | null;
  screenshot_url?: string | null;
  attachment_urls?: string[] | null; // Array of additional image URLs
  console_logs?: any[] | null;
  status: BugReportStatus;
  resolved_at?: string | null;
  /** Canonical bug this report duplicates (self-FK). Non-null iff marked duplicate. */
  duplicate_of?: string | null;
  /** display_id (BUG-xxxxx) of the canonical bug, from bug_reports_with_details. */
  duplicate_of_display_id?: string | null;
  /** How many open/resolved reports point at THIS bug as their canonical. */
  duplicate_count?: number;
  similar_count?: number;
  metadata?: {
    browser?: string;
    os?: string;
    [key: string]: any;
  } | null;
  institution_id?: string | null;
  department_id?: string | null;
  reporter?: {
    id: string;
    full_name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
  institution_name?: string | null;
  department_name?: string | null;
  department_code?: string | null;
}

export interface BugReportLeaderboardEntry {
  user_id: string;
  user_name: string | null;
  avatar_url: string | null;
  total_bugs_count: number;
  resolved_bugs_count: number;
}

export interface DetailedBugReport extends BugReport {
  reporter: {
    id: string;
    full_name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
}

export interface BugReportMessage {
  id: string;
  bug_report_id: string;
  sender_user_id: string;
  message_text: string;
  message_type?: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  is_internal?: boolean;
  reply_to_message_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  edited_at?: string | null;
  is_deleted?: boolean;
  sender?: {
    id: string;
    full_name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
}

export interface BugReportParticipant {
  id: string;
  bug_report_id: string;
  user_id: string;
  role?: string;
  can_view_internal?: boolean;
  joined_at?: string | null;
  last_read_at?: string | null;
  is_active?: boolean;
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
}

export interface BugReportFilters {
  status?: BugReportStatus;
  category?: BugReportCategory;
  institution_id?: string;
  department_id?: string;
  reporter_user_id?: string;
  module_name?: string;
  sub_module_name?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export type BugReporterStatsSortField =
  | 'total_bugs'
  | 'resolved_count'
  | 'resolution_rate'
  | 'last_reported_at';

export interface BugReporterStats {
  reporter_user_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  avatar_url: string | null;
  total_bugs: number;
  resolved_count: number;
  pending_count: number;
  in_progress_count: number;
  wont_fix_count: number;
  resolution_rate: number;
  top_category: BugReportCategory | null;
  last_reported_at: string;
  institution_id: string | null;
  department_id: string | null;
}

export interface BugReporterStatsFilters {
  institution_id?: string;
  department_id?: string;
  sort_by?: BugReporterStatsSortField;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
