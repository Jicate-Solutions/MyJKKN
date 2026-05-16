'use client';

/**
 * useAttentionBar — TanStack Query wrapper around `/api/attention-bar/resolve`.
 *
 * Spec: specs/attention-bar-5-layer-system.md (Phase 2 — pill component).
 *
 * Why a hook (not a server component):
 *  - The pill must update on client-side route transitions (Next.js App Router
 *    soft-navigation). A pure server component re-renders only on full nav.
 *  - Phase 3 will plug a Supabase Realtime subscription into the same data
 *    shape; a single client hook gives us one place to invalidate the query
 *    when an urgent (Layer 0) notification fires.
 *
 * Caching strategy:
 *  - staleTime 30s — Layer 1/2 results don't change minute-to-minute.
 *  - refetchOnWindowFocus — user returning to tab might have new state.
 *  - refetchOnMount: false — within 30s window, trust the cache.
 *
 * The query key includes the page so each route mounts a separate cache slot
 * (no flicker of stale page-A action while page-B loads).
 */

import { useQuery } from '@tanstack/react-query';
import type { ResolvedAction } from '@/lib/attention-bar/types';

/**
 * Wire shape returned by `/api/attention-bar/resolve`.
 *
 * 2-half split layout seam (added 2026-04-28):
 *   - `primary`   — left/full-width pill action (cascade winner).
 *   - `secondary` — right-pill action; null until the follow-up resolver
 *                   PR populates it. While null, the bar renders a single
 *                   full-width pill (current production behaviour).
 *   - `resolved`  — backcompat alias for `primary`. New consumers should
 *                   read `primary` directly.
 */
export interface ResolveResponse {
  page: string;
  role: string;
  primary: ResolvedAction | null;
  secondary: ResolvedAction | null;
  /** @deprecated alias for `primary` — kept for backcompat with existing consumers */
  resolved: ResolvedAction | null;
}

const STALE_TIME_MS = 30_000;

async function fetchResolved(page: string): Promise<ResolveResponse> {
  const res = await fetch(
    `/api/attention-bar/resolve?page=${encodeURIComponent(page)}`,
    { cache: 'no-store', credentials: 'include' },
  );

  if (res.status === 401) {
    // Not authenticated — pill should render nothing. Return a synthesised
    // empty response so consumers can treat it like "no action". Both
    // `primary` and `secondary` are null; `resolved` mirrors `primary`.
    return { page, role: 'guest', primary: null, secondary: null, resolved: null };
  }

  if (!res.ok) {
    throw new Error(`Attention bar resolve failed: HTTP ${res.status}`);
  }

  return (await res.json()) as ResolveResponse;
}

export function useAttentionBar(page: string) {
  return useQuery<ResolveResponse>({
    queryKey: ['attention-bar', page],
    queryFn: () => fetchResolved(page),
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    // The endpoint returns 401 for unauthed users; we already swallow that
    // into a null-resolved response. Treat any other error as transient and
    // retry once before surrendering — the pill empty state is harmless.
    retry: 1,
  });
}
