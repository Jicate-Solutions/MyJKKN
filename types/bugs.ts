export type BugReportStatus =
  | 'new'
  | 'seen'
  | 'in_progress'
  | 'resolved'
  | 'wont_fix';

export interface BugReport {
  id: string;
  display_id: string;
  created_at: string;
  reporter_user_id: string;
  page_url: string;
  description: string;
  screenshot_url?: string | null;
  console_logs?: any[] | null;
  status: BugReportStatus;
  resolved_at?: string | null;
  metadata?: {
    browser?: string;
    os?: string;
    [key: string]: any;
  } | null;
  reporter?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
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
  } | null;
}
