// =============================================================================
// UniSocial 360 — Phase 1: Social Media Monitoring Hub Types
// =============================================================================

// ─── Enums (match Postgres sm_* enums) ───────────────────────────────────────

export type SmPlatform =
  | 'instagram' | 'youtube' | 'facebook' | 'linkedin'
  | 'google_business' | 'twitter'
  | 'pinterest' | 'snapchat'
  | 'threads' | 'reddit' | 'tumblr' | 'quora';

export type SmContentType =
  | 'image_post' | 'video_post' | 'carousel' | 'reel' | 'story'
  | 'youtube_video' | 'youtube_short'
  | 'tweet' | 'thread' | 'article'
  | 'gmb_update' | 'gmb_offer' | 'gmb_event';

export type SmPostStatus =
  | 'draft' | 'pending_review' | 'approved' | 'scheduled'
  | 'publishing' | 'published' | 'failed' | 'rejected' | 'deleted';

export type SmApprovalTier = 'fast' | 'careful' | 'strict';

export type SmHealthStatus = 'green' | 'yellow' | 'red' | 'dormant';


// ─── Database Entities ───────────────────────────────────────────────────────

export interface SmAccount {
  id: string;
  institution_id: string;
  department_id: string | null;
  platform: SmPlatform;
  platform_account_id: string | null;
  username: string;
  display_name: string | null;
  profile_url: string | null;
  profile_pic_url: string | null;
  bio: string | null;
  website_url: string | null;
  account_type: string | null;
  is_verified: boolean;
  is_connected: boolean;
  health_status: SmHealthStatus;
  health_score: number;
  last_post_at: string | null;
  last_snapshot_at: string | null;
  metadata: Record<string, unknown>;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SmAccountCredential {
  id: string;
  account_id: string;
  credential_type: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  platform_user_id: string | null;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  needs_reconnect: boolean;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SmSnapshot {
  id: string;
  institution_id: string;
  account_id: string;
  snapshot_date: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  total_likes: number;
  total_comments: number;
  total_views: number;
  engagement_rate: number;
  avg_likes_per_post: number;
  avg_comments_per_post: number;
  follower_growth: number;
  follower_growth_pct: number;
  posts_last_7_days: number;
  posts_last_30_days: number;
  health_score: number;
  health_status: SmHealthStatus;
  source: 'auto_api' | 'manual_entry';
  raw_data: Record<string, unknown>;
  created_at: string;
}

export interface SmPostMetric {
  id: string;
  institution_id: string;
  account_id: string;
  platform_post_id: string;
  post_type: SmContentType | null;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  views_count: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  posted_at: string | null;
  is_pinned: boolean;
  hashtags: string[] | null;
  mentions: string[] | null;
  metadata: Record<string, unknown>;
  snapshot_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmManualEntry {
  id: string;
  account_id: string;
  entry_date: string;
  followers_count: number | null;
  likes_count: number | null;
  posts_count: number | null;
  notes: string | null;
  entered_by: string;
  created_at: string;
}

export interface SmCronLog {
  id: string;
  institution_id: string;
  cron_type: 'snapshot' | 'token_refresh' | 'sla_check' | 'leaderboard' | 'review_sync';
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'partial';
  accounts_processed: number;
  accounts_succeeded: number;
  accounts_failed: number;
  errors: unknown[];
  duration_seconds: number | null;
  triggered_by: 'cron' | 'manual' | 'api';
  metadata: Record<string, unknown>;
  created_at: string;
}


// ─── DTOs (Data Transfer Objects) ────────────────────────────────────────────

export interface CreateSmAccountDto {
  institution_id: string;
  department_id?: string;
  platform: SmPlatform;
  username: string;
  display_name?: string;
  profile_url?: string;
  account_type?: string;
}

export interface UpdateSmAccountDto {
  display_name?: string;
  profile_url?: string;
  profile_pic_url?: string;
  bio?: string;
  website_url?: string;
  account_type?: string;
  is_verified?: boolean;
  is_connected?: boolean;
  health_status?: SmHealthStatus;
  health_score?: number;
  last_post_at?: string;
  last_snapshot_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateManualEntryDto {
  account_id: string;
  entry_date: string;
  followers_count?: number;
  likes_count?: number;
  posts_count?: number;
  notes?: string;
}


// ─── Filter Types ────────────────────────────────────────────────────────────

export interface SmAccountFilters {
  institution_id: string;
  platform?: SmPlatform;
  health_status?: SmHealthStatus;
  department_id?: string;
  is_connected?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SmSnapshotFilters {
  account_id?: string;
  institution_id: string;
  start_date?: string;
  end_date?: string;
  source?: 'auto_api' | 'manual_entry';
  page?: number;
  limit?: number;
}

export interface SmPostMetricFilters {
  account_id?: string;
  institution_id: string;
  post_type?: SmContentType;
  start_date?: string;
  end_date?: string;
  sort_by?: 'engagement_rate' | 'likes_count' | 'comments_count' | 'posted_at';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}


// ─── Response Wrappers ───────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type SmAccountListResponse = PaginatedResponse<SmAccount>;
export type SmSnapshotListResponse = PaginatedResponse<SmSnapshot>;
export type SmPostMetricListResponse = PaginatedResponse<SmPostMetric>;


// ─── Dashboard Types ─────────────────────────────────────────────────────────

export interface SmDashboardOverview {
  totalAccounts: number;
  connectedAccounts: number;
  healthBreakdown: Record<SmHealthStatus, number>;
  platformBreakdown: Record<SmPlatform, number>;
  totalFollowers: number;
  avgEngagementRate: number;
  topPosts: SmPostMetric[];
  recentSnapshots: SmSnapshot[];
}

export interface SmAccountWithLatestSnapshot extends SmAccount {
  latest_snapshot?: SmSnapshot;
}

export interface SmEngagementTrend {
  date: string;
  engagement_rate: number;
  followers_count: number;
  posts_count: number;
}


// ─── Health Score Computation ────────────────────────────────────────────────

export interface HealthScoreInput {
  daysSinceLastPost: number;
  engagementRate: number;
  avgEngagementRate: number;
  followerGrowthPct: number;
  postsLast7Days: number;
  postsLast30Days: number;
}

export function computeHealthScore(input: HealthScoreInput): { score: number; status: SmHealthStatus } {
  let score = 0;

  // Posting frequency (40 points)
  if (input.daysSinceLastPost <= 3) score += 40;
  else if (input.daysSinceLastPost <= 7) score += 30;
  else if (input.daysSinceLastPost <= 14) score += 15;
  else if (input.daysSinceLastPost <= 30) score += 5;

  // Engagement quality (35 points)
  if (input.avgEngagementRate > 0) {
    const ratio = input.engagementRate / input.avgEngagementRate;
    if (ratio >= 1.5) score += 35;
    else if (ratio >= 1.0) score += 25;
    else if (ratio >= 0.5) score += 15;
    else score += 5;
  }

  // Growth (15 points)
  if (input.followerGrowthPct > 5) score += 15;
  else if (input.followerGrowthPct > 2) score += 10;
  else if (input.followerGrowthPct > 0) score += 5;

  // Consistency (10 points)
  if (input.postsLast30Days >= 12) score += 10;
  else if (input.postsLast30Days >= 8) score += 7;
  else if (input.postsLast30Days >= 4) score += 4;

  // Determine status
  let status: SmHealthStatus;
  if (input.daysSinceLastPost > 30) status = 'dormant';
  else if (score >= 70) status = 'green';
  else if (score >= 40) status = 'yellow';
  else status = 'red';

  return { score: Math.min(score, 100), status };
}


// ─── Constants ───────────────────────────────────────────────────────────────

export const PLATFORM_LABELS: Record<SmPlatform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  google_business: 'Google Business',
  twitter: 'X (Twitter)',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  threads: 'Threads',
  reddit: 'Reddit',
  tumblr: 'Tumblr',
  quora: 'Quora',
};

export const PLATFORM_COLORS: Record<SmPlatform, string> = {
  instagram: '#E1306C',
  youtube: '#FF0000',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  google_business: '#4285F4',
  twitter: '#000000',
  pinterest: '#E60023',
  snapchat: '#FFFC00',
  threads: '#000000',
  reddit: '#FF4500',
  tumblr: '#36465D',
  quora: '#B92B27',
};

export const HEALTH_STATUS_LABELS: Record<SmHealthStatus, string> = {
  green: 'Active',
  yellow: 'Warning',
  red: 'Critical',
  dormant: 'Dormant',
};

export const HEALTH_STATUS_COLORS: Record<SmHealthStatus, string> = {
  green: '#22C55E',
  yellow: '#EAB308',
  red: '#EF4444',
  dormant: '#6B7280',
};

export const CONTENT_TYPE_LABELS: Record<SmContentType, string> = {
  image_post: 'Image Post',
  video_post: 'Video Post',
  carousel: 'Carousel',
  reel: 'Reel',
  story: 'Story',
  youtube_video: 'YouTube Video',
  youtube_short: 'YouTube Short',
  tweet: 'Tweet',
  thread: 'Thread',
  article: 'Article',
  gmb_update: 'GMB Update',
  gmb_offer: 'GMB Offer',
  gmb_event: 'GMB Event',
};
