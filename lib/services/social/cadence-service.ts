/**
 * Department Instagram Monthly Cadence — client-safe fetch wrappers.
 *
 * Thin wrappers around /api/social/cadence for use from client components
 * (the loop page's monthly-cadence section + the OKR department page card).
 * All requests use `cache: 'no-store'` — the cadence is a live read of the
 * latest ledger + ig_monthly_audit snapshot and must never be served stale.
 * Every wrapper fails soft: it returns a { success:false, error } shape rather
 * than throwing, so the UI renders an inline error instead of crashing.
 */

import type {
  CadenceListResponse,
  CadenceMutationResponse,
  OpenCadenceBody,
  RecordActionBody,
  CloseCadenceBody,
} from '@/lib/types/social-cadence';

/**
 * GET /api/social/cadence — list cadence cycles for an account (loop page) or a
 * department (OKR dashboard), plus the account's current-month reach + flags.
 * @param opts.accountId    uuid OR username; omit to default to jkknpharmacy.
 * @param opts.departmentId department uuid — returns that dept's cadence rows.
 */
export async function getCadences(opts?: {
  accountId?: string;
  departmentId?: string;
}): Promise<CadenceListResponse> {
  try {
    const params = new URLSearchParams();
    if (opts?.accountId && opts.accountId.trim()) params.set('accountId', opts.accountId.trim());
    if (opts?.departmentId && opts.departmentId.trim()) params.set('departmentId', opts.departmentId.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`/api/social/cadence${qs}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as CadenceListResponse | null;
    if (!res.ok) {
      return {
        success: false,
        error: data?.error ?? `Failed to load cadences (HTTP ${res.status}).`,
      };
    }
    return data ?? { success: false, error: 'Empty response from the cadence API.' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error loading cadences.',
    };
  }
}

async function mutate(
  body: OpenCadenceBody | RecordActionBody | CloseCadenceBody
): Promise<CadenceMutationResponse> {
  try {
    const res = await fetch('/api/social/cadence', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as CadenceMutationResponse | null;
    if (!res.ok) {
      return {
        success: false,
        error: data?.error ?? `Request failed (HTTP ${res.status}).`,
      };
    }
    return data ?? { success: false, error: 'Empty response from the cadence API.' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error.',
    };
  }
}

/** Open a dept-month cadence (snapshots baseline + creates/links a real is_okr project owned by the HOD). */
export function openCadence(body: Omit<OpenCadenceBody, 'op'>): Promise<CadenceMutationResponse> {
  return mutate({ op: 'open', ...body });
}

/** Record the action taken (+ optional LoopVoice feedback snapshot). */
export function recordCadenceAction(body: Omit<RecordActionBody, 'op'>): Promise<CadenceMutationResponse> {
  return mutate({ op: 'action', ...body });
}

/** Close a cadence with a one-line learning (computes re-measure + reach delta). */
export function closeCadence(body: Omit<CloseCadenceBody, 'op'>): Promise<CadenceMutationResponse> {
  return mutate({ op: 'close', ...body });
}
