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
  AiSessionStatus,
  AssignOwnerInput,
  CreateContactInput,
  CreateContributionInput,
  CreateSchoolInput,
  CreateSessionInput,
  PartnerSchool,
  ProgramPartner,
  ProgramPartnerListResponse,
  ProgramPartnerRollup,
  School,
  SchoolContactRole,
  SchoolDetailResponse,
  SchoolListResponse,
  SchoolsListFilters,
  StaffSearchRow,
  WebsiteStatus,
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

/**
 * All API routes under /api/schools-network use the canonical response
 * envelope from `lib/api/response.ts` — `successResponse<T>(data)` wraps
 * as `{ success: true, data: T }` and `errorResponse` writes
 * `{ success: false, error, code }`. Historically this client checked
 * `body.ok` (a shape that never existed on the server) and returned the
 * whole body cast to `T`, so consumers received `{ success, data }` and
 * tried `.data` again — which pulled the payload object where they
 * expected an array. That produced the "Q.map is not a function"
 * runtime crash on every list page. Fix: check `body.success`
 * (matching the server envelope) and hand callers the unwrapped `data`.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  };
  if (!res.ok || body?.success === false) {
    // errorResponse() puts the human-readable text in `message` and the
    // machine code (VALIDATION_ERROR, CONFLICT, …) in `error` — prefer the
    // text so toasts read like sentences, not codes.
    const err = new Error(
      body?.message || body?.error || `Request failed: ${res.status}`
    ) as Error & { status?: number };
    // Attach the HTTP status so callers can branch on it (e.g. 403 → access
    // denied) instead of regex-matching the message (advisory review LOW).
    err.status = res.status;
    throw err;
  }
  return (body?.data ?? body) as T;
}

/* ─── Schools ───────────────────────────────────────────── */

export function listSchools(filters: SchoolsListFilters): Promise<SchoolListResponse> {
  return call<SchoolListResponse>(`${BASE}/schools?${buildQuery(filters)}`);
}

export function getSchoolDetail(schoolId: string): Promise<SchoolDetailResponse> {
  return call<SchoolDetailResponse>(`${BASE}/schools/${schoolId}`);
}

export function createSchool(input: CreateSchoolInput): Promise<{ id: string }> {
  return call(`${BASE}/schools`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateSchool(
  schoolId: string,
  input: Partial<CreateSchoolInput>
): Promise<void> {
  return call(`${BASE}/schools/${schoolId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/* ─── Sessions ──────────────────────────────────────────── */

export function logSession(
  schoolId: string,
  input: CreateSessionInput
): Promise<{ id: string }> {
  return call(`${BASE}/schools/${schoolId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ─── Contributions ─────────────────────────────────────── */

export function logContribution(
  schoolId: string,
  input: CreateContributionInput
): Promise<{ id: string }> {
  return call(`${BASE}/schools/${schoolId}/contributions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ─── Contacts ──────────────────────────────────────────── */

export function createContact(
  schoolId: string,
  input: CreateContactInput
): Promise<{ id: string }> {
  return call(`${BASE}/schools/${schoolId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ─── Owners ────────────────────────────────────────────── */

/**
 * Debounced staff picker for the Assign-owner form. Returns [] for queries
 * shorter than 2 chars (the endpoint short-circuits there too), so callers
 * don't need their own min-length guard.
 */
export function searchStaff(q: string): Promise<{ rows: StaffSearchRow[] }> {
  return call<{ rows: StaffSearchRow[] }>(
    `${BASE}/staff-search?q=${encodeURIComponent(q)}`
  );
}

export function assignOwner(
  schoolId: string,
  input: AssignOwnerInput
): Promise<{ id: string }> {
  return call(`${BASE}/schools/${schoolId}/owners`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeOwner(ownerId: string): Promise<void> {
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

export function getPartnerRollup(partnerId: string): Promise<ProgramPartnerRollup> {
  return call(`${BASE}/program-partners/${partnerId}/rollup`);
}

export function getPartner(partnerId: string): Promise<ProgramPartner> {
  return call(`${BASE}/program-partners/${partnerId}`);
}

export function listPartnerSchools(
  partnerId: string
): Promise<{ rows: PartnerSchool[]; total: number }> {
  return call(`${BASE}/program-partners/${partnerId}/schools`);
}

export function updatePartnerSchoolStatus(
  partnerId: string,
  input: {
    schoolId: string;
    aiSessionStatus?: AiSessionStatus;
    websiteStatus?: WebsiteStatus;
    domainUrl?: string | null;
    brandingDone?: boolean;
    nanMudhalvan?: boolean;
  }
): Promise<{ programPartnerId: string; schoolId: string }> {
  return call(`${BASE}/program-partners/${partnerId}/schools`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/* ─── Sessions & contributions tab fetchers ─────────────── */

export function listSchoolSessions(
  schoolId: string,
  limit = 50
): Promise<{
  rows: import('./types').SchoolSession[];
  limit: number;
  offset: number;
}> {
  return call(`${BASE}/schools/${schoolId}/sessions?limit=${limit}`);
}

export function listSchoolContributions(
  schoolId: string,
  limit = 50
): Promise<{
  rows: import('./types').SchoolContribution[];
  limit: number;
  offset: number;
}> {
  return call(`${BASE}/schools/${schoolId}/contributions?limit=${limit}`);
}

/* ─── Master tables ─────────────────────────────────────── */

export function listSessionTypes(): Promise<{
  rows: import('./types').SchoolSessionType[];
}> {
  return call(`${BASE}/session-types`);
}

export function listPartnerTypes(): Promise<{
  rows: import('./types').ProgramPartnerType[];
}> {
  return call(`${BASE}/partner-types`);
}

export function listContactRoles(): Promise<{ rows: SchoolContactRole[] }> {
  return call<{ rows: SchoolContactRole[] }>(`${BASE}/contact-roles`);
}

export function createPartner(input: {
  name: string;
  typeId: string;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  status?: import('./types').ProgramPartnerStatus;
  notes?: string | null;
}): Promise<{ id: string }> {
  return call(`${BASE}/program-partners`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ─── Institutions lookup (platform-wide, outside this module's API) ── */

export interface InstitutionOption {
  id: string;
  name: string;
}

/**
 * GET /api/institutions — the existing platform-wide institutions lookup
 * already used by other admin forms (e.g. internships/vehicles). It predates
 * this module's `{ success, data }` envelope and returns `{ data, count }`,
 * so it deliberately bypasses `call()`.
 */
export async function listInstitutions(): Promise<InstitutionOption[]> {
  const res = await fetch('/api/institutions');
  if (!res.ok) throw new Error('Failed to load institutions');
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{ id: string; name: string }>;
  };
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr.map((row) => ({ id: row.id, name: row.name }));
}

/* Re-export for caller ergonomics */
export type { School };

/* ─── Feeder discovery (read-through, no copy) ──────────── */

export interface FeederRow {
  schoolName: string;
  enrolledCount: number;
  leadsCount: number;
  sources: string[];
  adoptedSchoolId: string | null;
  /** Active admission cycle the momentum columns are measured against. */
  cycleYear: number;
  /** Prior cycle actually compared (next-lower year with learners — not
   *  necessarily cycleYear − 1 if a year has no data). */
  priorCycleYear: number;
  /** Cohort-attributed learners enrolled in the active cycle (so far). */
  currentCycleEnrolled: number;
  /** Cohort-attributed learners enrolled in the prior cycle. */
  priorCycleEnrolled: number;
  /** currentCycleEnrolled − priorCycleEnrolled — the measured outcome.
   *  NULL when unmeasurable (no prior cohort year, or no sampled learners). */
  cycleDelta: number | null;
  /** How many of this school's learners carry admission-year data;
   *  undated learners are excluded from the delta. */
  cohortKnown: number;
}

export function listFeeders(opts: {
  search?: string;
  source?: string;
  adopted?: string;
  sort?: 'priority' | 'volume';
  /** JKKN program level of the learners counted: 'ug' → Feeder Schools,
   *  'pg' → Feeder Colleges, 'other' → the always-on Other-levels section
   *  (diploma/PhD/unrecorded), undefined → all levels + marketing leads.
   *  A feeder that fed multiple levels appears in each matching section. */
  level?: 'ug' | 'pg' | 'other';
  limit?: number;
  offset?: number;
}): Promise<{ rows: FeederRow[]; total: number; limit: number; offset: number }> {
  const p = new URLSearchParams();
  if (opts.search) p.set('search', opts.search);
  if (opts.source) p.set('source', opts.source);
  if (opts.adopted) p.set('adopted', opts.adopted);
  if (opts.sort) p.set('sort', opts.sort);
  if (opts.level) p.set('level', opts.level);
  p.set('limit', String(opts.limit ?? 25));
  p.set('offset', String(opts.offset ?? 0));
  return call(`${BASE}/feeders?${p.toString()}`);
}

/* ─── School learner roster (PII, tenant-scoped) ────────── */

export interface SchoolLearnerRow {
  learnerId: string;
  learnerName: string | null;
  registerNumber: string | null;
  programName: string | null;
  /** JKKN program level the learner joined ('ug' | 'pg'). */
  degreeType: string | null;
  /** Admission year, or null when not recorded (see yearKnown). */
  admissionYear: number | null;
  /** false → admission year not recorded; UI labels "Year not recorded". */
  yearKnown: boolean;
}

/**
 * The learners who came from one feeder school/college. Matched on the SAME
 * canonical name key as the feeder panel, so the roster length equals the
 * panel's enrolled_count — EXCEPT for institution-scoped viewers: this returns
 * PII, so it is tenant-scoped (role_has_institution_access). Admins / scope=all
 * see the full count; scope=own coordinators see only their institution's
 * slice (the UI notes the difference).
 */
export function listSchoolLearners(
  schoolName: string,
  opts?: {
    level?: 'ug' | 'pg' | 'other';
    /** Page size (server clamps 1..200; server default 25). */
    limit?: number;
    offset?: number;
  }
): Promise<{ rows: SchoolLearnerRow[]; total: number }> {
  const p = new URLSearchParams();
  p.set('school', schoolName);
  if (opts?.level) p.set('level', opts.level);
  if (opts?.limit !== undefined) p.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) p.set('offset', String(opts.offset));
  return call(`${BASE}/school-learners?${p.toString()}`);
}

/* ─── Feeder duplicate merge (Tidy duplicates tool, schools.edit) ────────── */

export interface FeederDupeSuggestion {
  fromKey: string;
  fromName: string;
  fromCount: number;
  toKey: string;
  toName: string;
  toCount: number;
  /** 0..1 trigram similarity of the two spellings. */
  similarity: number;
}

export interface FeederAliasLink {
  fromKey: string;
  fromName: string | null;
  toKey: string;
  toName: string | null;
  createdAt: string | null;
}

/**
 * The Tidy-duplicates payload: system-suggested likely-same-school pairs plus
 * the links already made (for the Unlink list). Both gated schools.edit.
 */
export function listFeederDupes(): Promise<{
  suggestions: FeederDupeSuggestion[];
  links: FeederAliasLink[];
}> {
  return call(`${BASE}/feeder-aliases`);
}

/** Link (merge) two feeder spellings — non-destructive, undoable. */
export function linkFeeders(input: {
  fromKey: string;
  toKey: string;
  fromName: string;
  toName: string;
}): Promise<void> {
  return call(`${BASE}/feeder-aliases`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Undo a merge for one linked spelling. */
export function unlinkFeeder(fromKey: string): Promise<void> {
  return call(`${BASE}/feeder-aliases?from=${encodeURIComponent(fromKey)}`, {
    method: 'DELETE',
  });
}
