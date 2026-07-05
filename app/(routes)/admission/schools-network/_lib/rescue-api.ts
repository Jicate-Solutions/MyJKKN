/**
 * Schools Network — Shared-name feeder RESCUE (split by home pincode) client.
 *
 * Self-contained on purpose: kept OUT of the shared `_lib/api.ts` so this
 * feature can be reviewed / shipped without touching the merge tool's client.
 * Thin fetch wrappers over /api/schools-network/feeder-splits. Every function
 * returns the unwrapped `data` or throws with the server's message (React Query
 * callers wrap these in useQuery / useMutation).
 */

/** Canonical envelope unwrap — matches the module's other clients. Attaches the
 *  HTTP status to the thrown Error so callers can branch on 403 → admin-only. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // Abort a stalled request after 30s so a hung fetch doesn't strand a
  // retry:false query/mutation (and its confirm/unlink spinner) forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let r: Response;
  try {
    r = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    // Map the raw AbortError from the timeout to an actionable message.
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Request timed out — please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const b = (await r.json().catch(() => ({}))) as {
    success?: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  };
  if (!r.ok || (b && b.success === false)) {
    const err = new Error(
      b?.message || b?.error || `Request failed: ${r.status}`
    ) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return (b?.data ?? b) as T;
}

const BASE = '/api/schools-network/feeder-splits';

/* ─── Types ──────────────────────────────────────────────── */

/** A generic feeder worth splitting — one row, many real schools. */
export interface GenericFeeder {
  schoolName: string;
  learnerCount: number;
  /** Distinct home pincodes its learners span — the signal it's really many
   *  schools sharing a generic name. */
  distinctPincodes: number;
}

/** One pincode group of a generic feeder's learners. pincode=null → the
 *  'unknown location' bucket (no home pincode on file; not confirmable). */
export interface SplitCandidate {
  pincode: string | null;
  town: string | null;
  district: string | null;
  learnerCount: number;
  /** This pincode already belongs to a confirmed split for this feeder. */
  alreadyConfirmed: boolean;
}

/** A confirmed split — a real school carved out of a generic feeder. */
export interface ConfirmedSplit {
  id: string;
  genericKey: string;
  pincodes: string[];
  confirmedSchoolId: string | null;
  confirmedName: string | null;
  district: string | null;
  createdAt: string | null;
}

export interface RescueOverview {
  feeders: GenericFeeder[];
  splits: ConfirmedSplit[];
}

export interface ConfirmSplitInput {
  /** The generic feeder's name/key (the RPC normalises either form). */
  genericKey: string;
  /** Home pincodes to fold into this one school (>= 1). */
  pincodes: string[];
  name: string;
  district?: string | null;
  /** Optional: attribute to a JKKN institution (→ internal school). Omit for
   *  the normal external community-school case (org-wide). */
  institutionId?: string | null;
}

/* ─── Calls ──────────────────────────────────────────────── */

/** Generic feeders worth splitting + the splits already confirmed. */
export function listRescueOverview(): Promise<RescueOverview> {
  return call<RescueOverview>(BASE);
}

/** The pincode candidate groups for one generic feeder. */
export function listSplitCandidates(schoolName: string): Promise<{ candidates: SplitCandidate[] }> {
  return call<{ candidates: SplitCandidate[] }>(
    `${BASE}?school=${encodeURIComponent(schoolName)}`
  );
}

/** Confirm a group of pincodes as one real, adoptable school. */
export function confirmSplit(input: ConfirmSplitInput): Promise<{ id: string }> {
  return call<{ id: string }>(BASE, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Undo a confirmed split (cleans up the created school if untouched). */
export function unconfirmSplit(splitId: string): Promise<void> {
  return call<void>(`${BASE}?splitId=${encodeURIComponent(splitId)}`, {
    method: 'DELETE',
  });
}
