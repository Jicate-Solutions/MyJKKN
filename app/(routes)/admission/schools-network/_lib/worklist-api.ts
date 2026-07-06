/**
 * Schools Network — Visit Worklist client (self-contained; does NOT touch the
 * shared `_lib/api.ts`). Thin fetch wrappers over /api/schools-network/worklist*
 * with the canonical `{ success, data }` envelope unwrap.
 */

export interface VisitWorklistRow {
  schoolId: string;
  schoolName: string;
  district: string | null;
  /** current-cycle − prior-cycle enrolled from this feeder. Negative = slipping.
   *  null when unmeasurable (no prior cohort year / no dated learners). */
  cycleDelta: number | null;
  /** Assigned coordinator's user id, or null when unassigned. */
  assignedTo: string | null;
  /** Assigned coordinator's display name (resolved server-side). */
  assignedToName: string | null;
  /** Max school_sessions.conducted_at, or null when never visited. */
  lastVisit: string | null;
  hasContribution: boolean;
  hasSession: boolean;
  /** Handled = a logged visit AND a follow-up contribution (BOTH required). */
  isDone: boolean;
  /** Slipping (cycleDelta<0) OR overdue (60+ days / never) — the nudge trigger. */
  nudgeEligible: boolean;
  lastNudgedAt: string | null;
}

export interface VisitWorklistResponse {
  rows: VisitWorklistRow[];
  total: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || (b && b.success === false))
    throw new Error(b?.message || b?.error || `Request failed: ${r.status}`);
  return (b?.data ?? b) as T;
}

const BASE = '/api/schools-network/worklist';

/** The full visit worklist (org-wide, no PII). schools.view gated server-side. */
export function getVisitWorklist(): Promise<VisitWorklistResponse> {
  return call<VisitWorklistResponse>(BASE);
}

/** Assign (or clear, with assignedTo=null) one school's visit coordinator. */
export function assignVisit(
  schoolId: string,
  assignedTo: string | null
): Promise<{ schoolId: string; assignedTo: string | null }> {
  return call(BASE, {
    method: 'POST',
    body: JSON.stringify({ schoolId, assignedTo }),
  });
}

/** Auto-fill every unassigned school (owner, then district inheritance). */
export function autoAssignVisits(): Promise<{ assigned: number }> {
  return call(`${BASE}/auto-assign`, { method: 'POST' });
}

/** A person eligible to be assigned as a school's visit owner. */
export interface AssignableOwner {
  id: string;
  fullName: string;
  email: string | null;
  roleLabel: string;
}

/**
 * The assign picker's source: only existing outreach coordinators / school
 * owners (Director ruling), NOT every staff member. Small list — fetched once
 * and filtered client-side. schools.edit gated server-side.
 */
export function getAssignableOwners(): Promise<{ owners: AssignableOwner[] }> {
  return call<{ owners: AssignableOwner[] }>(`${BASE}/owners`);
}
