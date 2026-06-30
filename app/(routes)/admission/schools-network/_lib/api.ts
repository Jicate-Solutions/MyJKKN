/**
 * Schools Network — UI-local thin fetch wrapper over the API endpoints
 * defined in /tmp/schools-network-spec.md §7.
 *
 * NON-NEGOTIABLE META-PRINCIPLE: pre-write survey confirmed Agent B owns
 * `lib/services/schools-network/*` (the typed service layer that talks to
 * Supabase RPCs directly from server routes). This UI fetches over the wire
 * so it stays decoupled from B's service signatures during parallel review.
 *
 * Every function returns parsed JSON or throws with the server's error
 * message. React Query callers wrap these in useQuery / useMutation.
 */
import type {
  AssignOwnerInput,
  CreateContributionInput,
  CreateSchoolInput,
  CreateSessionInput,
  ProgramPartner,
  ProgramPartnerListResponse,
  ProgramPartnerRollup,
  School,
  SchoolDetailResponse,
  SchoolListResponse,
  SchoolsListFilters,
} from './types';

const BASE = '/api/schools-network';

function buildQuery(filters: SchoolsListFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.ownership) params.set('ownership', filters.ownership);
  if (filters.status) params.set('status', filters.status);
  if (filters.state) params.set('state', filters.state);
  if (filters.district) params.set('district', filters.district);
  if (filters.programPartnerId) params.set('programPartnerId', filters.programPartnerId);
  if (filters.jkknUserId) params.set('jkknUserId', filters.jkknUserId);
  if (filters.hasActiveOwner !== undefined) {
    params.set('hasActiveOwner', String(filters.hasActiveOwner));
  }
  params.set('limit', String(filters.limit ?? 25));
  params.set('offset', String(filters.offset ?? 0));
  return params.toString();
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return body as T;
}

/* ─── Schools ───────────────────────────────────────────── */

export function listSchools(filters: SchoolsListFilters): Promise<SchoolListResponse> {
  return call<SchoolListResponse>(`${BASE}/schools?${buildQuery(filters)}`);
}

export function getSchoolDetail(schoolId: string): Promise<SchoolDetailResponse> {
  return call<SchoolDetailResponse>(`${BASE}/schools/${schoolId}`);
}

export function createSchool(input: CreateSchoolInput): Promise<{ ok: true; id: string }> {
  return call(`${BASE}/schools`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateSchool(
  schoolId: string,
  input: Partial<CreateSchoolInput>
): Promise<{ ok: true }> {
  return call(`${BASE}/schools/${schoolId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/* ─── Sessions ──────────────────────────────────────────── */

export function logSession(
  schoolId: string,
  input: CreateSessionInput
): Promise<{ ok: true; id: string }> {
  return call(`${BASE}/schools/${schoolId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ─── Contributions ─────────────────────────────────────── */

export function logContribution(
  schoolId: string,
  input: CreateContributionInput
): Promise<{ ok: true; id: string }> {
  return call(`${BASE}/schools/${schoolId}/contributions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ─── Owners ────────────────────────────────────────────── */

export function assignOwner(
  schoolId: string,
  input: AssignOwnerInput
): Promise<{ ok: true; id: string }> {
  return call(`${BASE}/schools/${schoolId}/owners`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeOwner(ownerId: string): Promise<{ ok: true }> {
  return call(`${BASE}/owners/${ownerId}`, { method: 'DELETE' });
}

/* ─── Program partners ──────────────────────────────────── */

export function listPartners(opts: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ProgramPartnerListResponse> {
  const p = new URLSearchParams();
  if (opts.search) p.set('search', opts.search);
  if (opts.status) p.set('status', opts.status);
  p.set('limit', String(opts.limit ?? 25));
  p.set('offset', String(opts.offset ?? 0));
  return call<ProgramPartnerListResponse>(`${BASE}/program-partners?${p.toString()}`);
}

export function getPartnerRollup(
  partnerId: string
): Promise<{ ok: true; rollup: ProgramPartnerRollup; partner: ProgramPartner }> {
  return call(`${BASE}/program-partners/${partnerId}/rollup`);
}

export function getPartner(partnerId: string): Promise<{ ok: true; partner: ProgramPartner }> {
  return call(`${BASE}/program-partners/${partnerId}`);
}

/* ─── Sessions & contributions tab fetchers ─────────────── */

export function listSchoolSessions(
  schoolId: string,
  limit = 50
): Promise<{ ok: true; data: import('./types').SchoolSession[] }> {
  return call(`${BASE}/schools/${schoolId}/sessions?limit=${limit}`);
}

export function listSchoolContributions(
  schoolId: string,
  limit = 50
): Promise<{ ok: true; data: import('./types').SchoolContribution[] }> {
  return call(`${BASE}/schools/${schoolId}/contributions?limit=${limit}`);
}

/* ─── Master tables ─────────────────────────────────────── */

export function listSessionTypes(): Promise<{
  ok: true;
  data: import('./types').SchoolSessionType[];
}> {
  return call(`${BASE}/session-types`);
}

/* Re-export for caller ergonomics */
export type { School };
