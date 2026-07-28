/**
 * MyJKKN RCLTP — shared service helpers (Phase B)
 * ----------------------------------------------------------------------------
 * Small, dependency-free utilities shared by every rcltp domain service so that
 * pagination shape and (critically) the two stub-error contracts stay IDENTICAL
 * across the layer. Do not inline these per service — the consistency is the point.
 */

import type { RcltpPaginationMetadata } from '@/types/rcltp';

export const RCLTP_DEFAULT_PAGE = 1;
export const RCLTP_DEFAULT_LIMIT = 20;
export const RCLTP_MAX_LIMIT = 100;

/** Clamp page/limit and compute the inclusive Supabase `.range(from, to)` window. */
export function rcltpRange(
  page: number = RCLTP_DEFAULT_PAGE,
  limit: number = RCLTP_DEFAULT_LIMIT
): { from: number; to: number; page: number; limit: number } {
  const safePage = Math.max(1, Math.floor(page) || RCLTP_DEFAULT_PAGE);
  const safeLimit = Math.min(
    RCLTP_MAX_LIMIT,
    Math.max(1, Math.floor(limit) || RCLTP_DEFAULT_LIMIT)
  );
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  return { from, to, page: safePage, limit: safeLimit };
}

/** Build the `{ page, limit, total, totalPages }` metadata block from a count. */
export function rcltpMetadata(
  count: number | null | undefined,
  page: number,
  limit: number
): RcltpPaginationMetadata {
  const total = count ?? 0;
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

/**
 * CLIENT → SERVER bridge for the Phase 3 student-affecting write routes.
 * Browser-only (uses a relative path resolved against the page origin; same-origin
 * cookies authenticate the call). POSTs JSON, unwraps the standard
 * `{ success, data }` envelope, and throws the server's message on failure
 * (including the honest "awaiting MyJKKN content" 501 from group-B gated routes).
 * Keeping this in one place means every rcltp service calls its route identically.
 */
export async function rcltpPostJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: { success?: boolean; data?: T; message?: string; error?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.success === false) {
    throw new Error(json?.message || json?.error || `RCLTP request failed (${res.status})`);
  }
  return json.data as T;
}

/**
 * Student-affecting writes are forbidden on the client by RLS (migration §6):
 * students have NO write policy on any rcltp_ table. Every such write MUST go
 * through a server-side service-role API route that verifies identity and sets
 * only permitted columns — otherwise a student could fabricate scores /
 * is_official / attempt_no / status. These stubs make that contract loud and
 * keep the client write surface honest until the Phase C routes exist.
 *
 * Returns `never` (always throws) so it is assignable to any declared return type.
 */
export function rcltpServerWriteRequired(route: string): never {
  throw new Error(
    `RCLTP: this student-affecting write must go through the server-side service-role route "${route}". ` +
      'Direct client writes are blocked by RLS (migration §6) so scores and integrity ' +
      'fields cannot be self-fabricated. (Phase C: implement the route, then wire this stub.)'
  );
}

/**
 * Logic that depends on content or formulas MyJKKN has not yet supplied:
 * the composite scoring formula, band placement, the 24-report catalog, the
 * 5,000-word VBB list, seed passages, and passage AI generation. Stubbed so the
 * plumbing typechecks now and fails loudly (never silently) if called early.
 *
 * Returns `never` (always throws) so it is assignable to any declared return type.
 */
export function rcltpAwaitingValidationContent(what: string): never {
  throw new Error(
    `RCLTP: "${what}" is deferred — awaiting MyJKKN content/spec ` +
      '(band cutoffs, composite-score formula, VBB wordlist, seed passages, or the 24-report catalog).'
  );
}
