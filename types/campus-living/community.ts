/**
 * Types for the hostel community noticeboard.
 *
 * Backs:
 *   /campus-living/community             — posts list + create
 *   /campus-living/community/settings    — visibility & display config
 *
 * Tables: hostel_community_posts (added 2026-05-20), hostel_community_config
 * (added pre-2026-05-20; existing).
 */

export type HostelCommunityPostType =
  | 'announcement'
  | 'event'
  | 'poll'
  | 'discussion';

export interface HostelCommunityPost {
  id: string;
  institution_id: string;
  block_id: string | null;
  post_type: HostelCommunityPostType;
  title: string;
  body: string;
  is_pinned: boolean;
  is_published: boolean;
  event_date: string | null;
  poll_options: unknown | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHostelCommunityPostDTO {
  institution_id: string;
  post_type: HostelCommunityPostType;
  title: string;
  body: string;
  block_id?: string | null;
  is_pinned?: boolean;
  is_published?: boolean;
  event_date?: string | null;
  author_id?: string | null;
}

/**
 * hostel_community_config row — one per institution. Controls which content
 * types render on the community page and how many of each.
 */
export interface HostelCommunityConfig {
  id: string;
  institution_id: string;
  show_lc_events: boolean;
  show_lc_announcements: boolean;
  show_lc_polls: boolean;
  event_scope_filter: string[];
  max_events_shown: number;
  max_announcements_shown: number;
  max_polls_shown: number;
  created_at: string;
  updated_at: string;
}

export type HostelCommunityConfigUpsert = Partial<
  Omit<HostelCommunityConfig, 'id' | 'institution_id' | 'created_at' | 'updated_at'>
>;

/** Community category as it actually exists on prod — caste categories, not
 * post-topic categories. Surfaced here only for the small admin sub-tile on
 * the settings page so admins can see what the table actually contains. */
export interface CommunityCategory {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/** PM task row mirroring hostel_pm_tasks columns surveyed via
 * information_schema on 2026-05-20. */
export type HostelPmTaskStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'pending_verification'
  | 'resolved'
  | 'closed'
  | 'reopened';

export type HostelPmTaskCategory =
  | 'electrical'
  | 'plumbing'
  | 'civil'
  | 'pest_control'
  | 'cleaning'
  | 'internet'
  | 'water_supply'
  | 'furniture'
  | 'safety'
  | 'other';

export type HostelPmTaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface HostelPmTask {
  id: string;
  institution_id: string;
  schedule_id: string;
  block_id: string | null;
  due_date: string;
  title: string;
  category: HostelPmTaskCategory;
  priority: HostelPmTaskPriority;
  assigned_to_name: string | null;
  assigned_to_phone: string | null;
  checklist: unknown | null;
  status: HostelPmTaskStatus;
  completed_by: string | null;
  completed_at: string | null;
  completion_notes: string | null;
  photo_urls: string[] | null;
  cost_actual: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompleteHostelPmTaskDTO {
  completion_notes?: string | null;
  photo_urls?: string[] | null;
  cost_actual?: number | null;
}
