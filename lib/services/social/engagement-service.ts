/**
 * Department Engagement Loop — client-safe fetch wrappers.
 *
 * Thin wrappers around /api/social/engagement/* for client components (the learner
 * dashboard card, the leaderboard, the member + owner loop surfaces). Every request
 * uses `cache: 'no-store'` (the loop is a live read) and every wrapper FAILS SOFT —
 * returns a { success:false, error } shape rather than throwing — so the UI renders
 * an inline error state instead of crashing. Mirrors lib/services/social/loop-service.
 */

import type {
  HandleFeedResponse,
  LeaderboardResponse,
  ContributionsResponse,
  RotaResponse,
  ConcernsResponse,
  ManagedHandlesResponse,
  SubmitContributionBody,
  ReviewContributionBody,
  AssignRotaBody,
  ReportConcernBody,
  ResolveConcernBody,
  SetBriefBody,
  RecentPostsResponse,
} from '@/lib/types/social-engagement';

async function getJson<T extends { success: boolean; error?: string }>(
  url: string,
  fallbackError: string
): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      return { success: false, error: data?.error ?? `${fallbackError} (HTTP ${res.status}).` } as T;
    }
    return data ?? ({ success: false, error: `Empty response — ${fallbackError}.` } as T);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : fallbackError } as T;
  }
}

async function sendJson<T extends { success: boolean; error?: string }>(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  fallbackError: string
): Promise<T> {
  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      return { success: false, error: data?.error ?? `${fallbackError} (HTTP ${res.status}).` } as T;
    }
    return data ?? ({ success: false, error: `Empty response — ${fallbackError}.` } as T);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : fallbackError } as T;
  }
}

// ── Reads ──
export function getHandleFeed(limit = 6): Promise<HandleFeedResponse> {
  return getJson<HandleFeedResponse>(
    `/api/social/engagement/handle?limit=${encodeURIComponent(String(limit))}`,
    'Failed to load your department handle'
  );
}

export function getLeaderboard(days = 30): Promise<LeaderboardResponse> {
  return getJson<LeaderboardResponse>(
    `/api/social/engagement/leaderboard?days=${encodeURIComponent(String(days))}`,
    'Failed to load the leaderboard'
  );
}

export function getContributions(deptAccountId?: string, actionable = false): Promise<ContributionsResponse> {
  const p = new URLSearchParams();
  if (deptAccountId) p.set('deptAccountId', deptAccountId);
  // actionable=true → the full submitted+approved working set (no page cap hides a pending item).
  if (actionable) p.set('actionable', 'true');
  const qs = p.toString() ? `?${p.toString()}` : '';
  return getJson<ContributionsResponse>(
    `/api/social/engagement/contributions${qs}`,
    'Failed to load contributions'
  );
}

export function getManagedHandles(): Promise<ManagedHandlesResponse> {
  return getJson<ManagedHandlesResponse>(
    '/api/social/engagement/manage',
    'Failed to load your handles'
  );
}

export function setBrief(body: SetBriefBody): Promise<ManagedHandlesResponse> {
  return sendJson<ManagedHandlesResponse>(
    '/api/social/engagement/manage',
    'PATCH',
    body,
    'Failed to save the brief'
  );
}

export function getRota(deptAccountId: string): Promise<RotaResponse> {
  return getJson<RotaResponse>(
    `/api/social/engagement/rota?deptAccountId=${encodeURIComponent(deptAccountId)}`,
    'Failed to load the rota'
  );
}

export function getConcerns(deptAccountId?: string): Promise<ConcernsResponse> {
  const qs = deptAccountId ? `?deptAccountId=${encodeURIComponent(deptAccountId)}` : '';
  return getJson<ConcernsResponse>(
    `/api/social/engagement/concerns${qs}`,
    'Failed to load concerns'
  );
}

/** Recent IG posts for a handle the caller manages — the owner picks one to
 *  attribute a posted contribution to (so recognition real-signal is truthful). */
export function getRecentPostsForHandle(deptAccountId: string): Promise<RecentPostsResponse> {
  return getJson<RecentPostsResponse>(
    `/api/social/engagement/recent-posts?deptAccountId=${encodeURIComponent(deptAccountId)}`,
    'Failed to load recent posts'
  );
}

// ── Writes ──
export function submitContribution(body: SubmitContributionBody): Promise<ContributionsResponse> {
  return sendJson<ContributionsResponse>(
    '/api/social/engagement/contributions',
    'POST',
    body,
    'Failed to submit your contribution'
  );
}

export function reviewContribution(body: ReviewContributionBody): Promise<ContributionsResponse> {
  return sendJson<ContributionsResponse>(
    '/api/social/engagement/contributions',
    'PATCH',
    body,
    'Failed to update the contribution'
  );
}

export function assignRota(body: AssignRotaBody): Promise<RotaResponse> {
  return sendJson<RotaResponse>('/api/social/engagement/rota', 'POST', body, 'Failed to assign the rota');
}

export function reportConcern(body: ReportConcernBody): Promise<ConcernsResponse> {
  return sendJson<ConcernsResponse>(
    '/api/social/engagement/concerns',
    'POST',
    body,
    'Failed to submit your concern'
  );
}

export function resolveConcern(body: ResolveConcernBody): Promise<ConcernsResponse> {
  return sendJson<ConcernsResponse>(
    '/api/social/engagement/concerns',
    'PATCH',
    body,
    'Failed to resolve the concern'
  );
}
