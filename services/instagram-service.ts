/**
 * Instagram Monitoring Service (Client-side)
 *
 * Wraps calls to /api/social/instagram/* routes.
 * NOTE: These routes are delivered by Agent γ (feat/ig-api-routes).
 * Until that PR merges, calls will return 404. The service interface
 * is fully typed so UI can compile and render empty/error states.
 *
 * Created: 2026-05-30 (Phase 3 - Admin UI)
 */

// ─── Shared Types ──────────────────────────────────────────────────────────

export type IgAccountStatus = 'active' | 'dormant' | 'disconnected' | 'error';
export type IgAccountType = 'institution' | 'department' | 'club' | 'event';

export interface IgAccount {
  id: string;
  username: string;
  instagram_user_id: string;
  institution_id: string;
  institution_name: string;
  department_id: string | null;
  department_name: string | null;
  account_type: IgAccountType;
  display_name: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  followers_count: number;
  following_count: number;
  media_count: number;
  health_score: number; // 0–100
  status: IgAccountStatus;
  last_post_at: string | null;
  last_polled_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IgMetricSnapshot {
  id: string;
  account_id: string;
  captured_at: string;
  followers_count: number;
  following_count: number;
  media_count: number;
  reach: number | null;
  impressions: number | null;
  profile_views: number | null;
}

export interface IgPost {
  id: string;
  account_id: string;
  instagram_media_id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  caption: string | null;
  media_url: string | null;
  permalink: string;
  like_count: number;
  comments_count: number;
  reach: number | null;
  impressions: number | null;
  engagement_rate: number | null;
  published_at: string;
}

export interface IgAuditLog {
  id: string;
  account_id: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface IgAccountDetail extends IgAccount {
  metric_snapshots: IgMetricSnapshot[];
  recent_posts: IgPost[];
  audit_logs: IgAuditLog[];
}

export interface IgAccountListFilters {
  status?: IgAccountStatus | 'all';
  institution_id?: string;
  account_type?: IgAccountType | 'all';
  search?: string;
}

export interface IgAccountListResponse {
  accounts: IgAccount[];
  total: number;
}

export interface IgDiscoverResponse {
  discovered: number;
  synced: number;
  accounts: IgAccount[];
  errors: string[];
}

export interface IgSyncResponse {
  synced: number;
  errors: string[];
}

// ─── Service ────────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${errorBody}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch paginated list of ig_accounts with optional filters. */
export async function fetchIgAccounts(
  filters: IgAccountListFilters = {},
): Promise<IgAccountListResponse> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.institution_id) params.set('institution_id', filters.institution_id);
  if (filters.account_type && filters.account_type !== 'all')
    params.set('account_type', filters.account_type);
  if (filters.search) params.set('search', filters.search);

  const qs = params.toString();
  return apiGet<IgAccountListResponse>(
    `/api/social/instagram/accounts${qs ? `?${qs}` : ''}`,
  );
}

/** Fetch single account with metrics history, recent posts, and audit log. */
export async function fetchIgAccountDetail(id: string): Promise<IgAccountDetail> {
  return apiGet<IgAccountDetail>(`/api/social/instagram/accounts/${id}`);
}

/**
 * Trigger account discovery — scans Meta API for new institutional accounts.
 * Delivered by Agent γ (POST /api/social/instagram/discover).
 */
export async function discoverIgAccounts(): Promise<IgDiscoverResponse> {
  return apiPost<IgDiscoverResponse>('/api/social/instagram/discover');
}

/**
 * Trigger a metric sync for all active accounts (or a specific one).
 * Delivered by Agent γ (POST /api/social/instagram/sync).
 */
export async function syncIgMetrics(accountId?: string): Promise<IgSyncResponse> {
  return apiPost<IgSyncResponse>('/api/social/instagram/sync', accountId ? { account_id: accountId } : {});
}
