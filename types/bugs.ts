export type BugReportStatus =
  | 'new'
  | 'seen'
  | 'in_progress'
  | 'resolved'
  | 'wont_fix';

export type BugReportCategory =
  | 'bug'
  | 'feature_request'
  | 'ui_design'
  | 'performance'
  | 'security'
  | 'other';

export interface BugReport {
  id: string;
  display_id: string;
  created_at: string;
  reporter_user_id: string;
  page_url: string;
  description: string;
  category?: BugReportCategory | null;
  screenshot_url?: string | null;
  console_logs?: any[] | null;
  status: BugReportStatus;
  resolved_at?: string | null;
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
  page?: number;
  limit?: number;
}
