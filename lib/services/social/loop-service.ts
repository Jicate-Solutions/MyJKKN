/**
 * Social Loop Engine — client-safe fetch wrappers.
 *
 * Thin wrappers around /api/social/loop for use from client components
 * (the loop page + components owned by sibling agents). All requests use
 * `cache: 'no-store'` — the loop is a live read of the latest metric snapshots
 * and must never be served stale. Both wrappers fail soft: they return a
 * { success:false, error } shape rather than throwing, so the UI can render an
 * inline error state instead of crashing.
 */

import type {
  LoopResponse,
  PlaybookEntry,
  CloseCycleBody,
} from '@/lib/types/social-loop';

/**
 * GET /api/social/loop — fetch the current read + decide + playbook.
 * @param accountId  uuid OR username; omit to default to jkknpharmacy server-side.
 */
export async function getLoop(accountId?: string): Promise<LoopResponse> {
  try {
    const qs =
      accountId && accountId.trim().length > 0
        ? `?accountId=${encodeURIComponent(accountId.trim())}`
        : '';
    const res = await fetch(`/api/social/loop${qs}`, { cache: 'no-store' });

    // Parse the body whether or not the status is ok — the route returns a
    // structured { success, error } JSON on every failure path.
    const data = (await res.json().catch(() => null)) as LoopResponse | null;
    if (!res.ok) {
      return {
        success: false,
        error: data?.error ?? `Failed to load the loop (HTTP ${res.status}).`,
      };
    }
    return data ?? { success: false, error: 'Empty response from the loop API.' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error loading the loop.',
    };
  }
}

/**
 * POST /api/social/loop — close the current cycle with a one-line learning.
 * Returns the persisted playbook entry on success, or a structured error
 * (a 403 here means RLS blocked the write — the caller lacks social.manage).
 */
export async function closeCycle(
  body: CloseCycleBody
): Promise<{ success: boolean; entry?: PlaybookEntry; error?: string }> {
  try {
    const res = await fetch('/api/social/loop', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await res
      .json()
      .catch(() => null)) as { success: boolean; entry?: PlaybookEntry; error?: string } | null;

    if (!res.ok) {
      return {
        success: false,
        error: data?.error ?? `Failed to close the cycle (HTTP ${res.status}).`,
      };
    }
    return data ?? { success: false, error: 'Empty response closing the cycle.' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error closing the cycle.',
    };
  }
}
