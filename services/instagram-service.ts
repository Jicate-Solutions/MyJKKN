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
  /** profiles.id of the team member who runs this account; null = nobody named yet. */
  connected_by: string | null;
  /** Display name of that team member, when one is named. */
  connected_by_name: string | null;
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

/** Envelope + payload shapes returned by the /accounts/discover route. */
interface IgDiscoverRouteResponse {
  success: boolean;
  data: {
    discovered: Array<{ ig_user_id: string; username: string; already_synced: boolean }>;
    total: number;
    already_synced: number;
    available: number;
    pages_scanned: number;
  };
}

/** Envelope + payload shapes returned by the /accounts/sync route. */
interface IgSyncRouteResponse {
  success: boolean;
  data: {
    synced: number;
    failed: number;
    total: number;
    results: Array<{
      ig_user_id: string;
      username: string;
      status: 'upserted' | 'error';
      error?: string;
    }>;
  };
}

/**
 * Trigger account discovery — scans Meta API for new institutional accounts.
 * Calls GET /api/social/instagram/accounts/discover (the previous
 * POST /api/social/instagram/discover path never existed — 404).
 */
export async function discoverIgAccounts(): Promise<IgDiscoverResponse> {
  const res = await apiGet<IgDiscoverRouteResponse>(
    '/api/social/instagram/accounts/discover'
  );
  return {
    discovered: res.data.total,
    synced: res.data.already_synced,
    accounts: [],
    errors: [],
  };
}

/**
 * Sync discovered IG accounts into ig_accounts (all, or one by IG user id).
 * Calls POST /api/social/instagram/accounts/sync (the previous
 * POST /api/social/instagram/sync path never existed — 404).
 * super_admin may call with no institution context; per-account
 * institution_id resolves server-side via the fb_pages join.
 */
export async function syncIgMetrics(igUserId?: string): Promise<IgSyncResponse> {
  const res = await apiPost<IgSyncRouteResponse>(
    '/api/social/instagram/accounts/sync',
    igUserId ? { ig_user_ids: [igUserId] } : {}
  );
  return {
    synced: res.data.synced,
    errors: res.data.results
      .filter((r) => r.status === 'error')
      .map((r) => `${r.username || r.ig_user_id}: ${r.error ?? 'unknown error'}`),
  };
}

/**
 * Name (or clear, with null) the team member who runs an Instagram account.
 * Calls PATCH /api/social/instagram/accounts/[id]. Throws with the route's
 * own plain-language error so the caller can show it.
 */
/** A save that never answers must not leave the dialog stuck on "Saving…". */
export const IG_RUNNER_SAVE_TIMEOUT_MS = 15_000;

export async function setIgAccountRunner(
  accountId: string,
  personId: string | null,
): Promise<{ id: string; connected_by: string | null; connected_by_name: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IG_RUNNER_SAVE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/social/instagram/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected_by: personId }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('Saving took too long. Check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as
    | { success: boolean; error?: string; data?: { id: string; connected_by: string | null; connected_by_name: string | null } }
    | null;
  if (!res.ok || !json?.success || !json.data) {
    throw new Error(json?.error || `Could not save (${res.status})`);
  }
  return json.data;
}
