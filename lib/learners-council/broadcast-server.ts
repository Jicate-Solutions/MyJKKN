/**
 * Learners Council broadcast — server-side reading of the holding table.
 *
 * Both broadcast screens (the approver's queue and a sender's own list) read
 * the same rows through the same row-level-security lens, so the read lives
 * here once. The browser never writes through this module: every decision goes
 * to /api/learners-council/broadcast, which is a thin wrapper over the
 * SECURITY DEFINER routines that actually re-check who the caller is.
 *
 * TWO HOUSE RULES SHAPE THIS FILE.
 *
 * 1. A refused read is silent. Row-level security returns zero rows and no
 *    error, so "nothing came back" is ambiguous by construction. Every
 *    function here reports `readFailed` separately from an empty list, and the
 *    screens render the two differently — an empty queue and a queue you are
 *    not allowed to see must never look the same.
 *
 * 2. A number nobody can verify is worse than no number. The learner headcount
 *    is counted through the viewer's own client, so a viewer with a narrow
 *    visibility scope would silently under-count the blast radius of a message
 *    about to reach thousands. So the count is reported as null whenever it
 *    cannot be established (including a zero, which for an all-college council
 *    message means the count failed, not that nobody is there), and the colleges
 *    the message names — which come straight off the stored payload and depend
 *    on no visibility at all — are always shown as the primary fact.
 */

import { createClient } from '@/lib/supabase/server';
import { summariseTargeting } from './broadcast-reach';

/** One held request, with everything the screens need already resolved. */
export interface BroadcastRequestView {
  id: string;
  title: string;
  body: string;
  reach: string;
  status: string;
  decisionNote: string | null;
  autoSendAt: string;
  createdAt: string;
  decidedAt: string | null;
  requesterId: string;
  /** null when the sender's profile could not be read — never a made-up name. */
  requesterName: string | null;
  requesterCollege: string | null;
  /** Names of the colleges this message is addressed to, in payload order. */
  colleges: string[];
  /** Colleges named by id that we could not resolve to a name. */
  unnamedCollegeCount: number;
  /** null means "could not be established" — never render it as zero. */
  headcount: number | null;
  /** True when the payload narrows further, so the headcount is a ceiling. */
  headcountIsCeiling: boolean;
  /** False when the stored payload is a shape this code cannot read. */
  targetingRecognised: boolean;
}

export interface BroadcastListResult {
  rows: BroadcastRequestView[];
  /** True when the table read itself errored. Distinct from "no rows". */
  readFailed: boolean;
}

/** Who, if anyone, has been named as the approver — and can we even tell. */
export interface ApproverSetting {
  /** profiles.id of the named approver, or null when nobody is named. */
  approverId: string | null;
  approverName: string | null;
  approverEmail: string | null;
  /** Hours a request waits before it sends itself. */
  autoSendHours: number;
  /** True when the configuration could not be read at all. */
  configUnreadable: boolean;
}

const SELECT_COLUMNS =
  'id, title, body, targeting, reach, status, decision_note, auto_send_at, created_at, decided_at, requester_id';

/** The seeded fallback in the migration. Used only when the row cannot be read. */
const DEFAULT_AUTO_SEND_HOURS = 24;

/**
 * Read the approver configuration.
 *
 * `lc.broadcast.approver_user_id` is seeded as JSON null and is still null on
 * production, so null here is the EXPECTED case, not an error. The two are
 * nonetheless kept apart: `configUnreadable` says the lookup failed, while a
 * null id with `configUnreadable === false` says the Director has genuinely
 * not named anyone yet.
 *
 * ONE SUBTLETY WORTH KNOWING. fn_get_policy resolves scopes in order (user,
 * institution, role, global) whereas fn_lc_broadcast_decide reads the global
 * row only. Today just the global row exists, so the two agree. If a scoped row
 * were ever added they could disagree — and the failure is safe in the right
 * direction: this screen might show somebody the queue, but the routine still
 * refuses their decision and returns a sentence saying why, rather than
 * accepting it. What this value must never do is gate a page silently.
 */
export async function getApproverSetting(): Promise<ApproverSetting> {
  const supabase = await createClient();

  // p_scope_id is passed explicitly as null, matching lib/policies/get-policy.ts.
  // The routine defaults it, but naming it keeps the call unambiguous to
  // PostgREST's overload resolution — the same shape already proven in
  // production rather than a shorter one that has never run there.
  //
  // Called directly instead of through getPolicy() for one reason: that helper
  // returns null both for "no approver named" and for "the lookup failed", and
  // this screen has to tell those two apart. Reporting "nobody is named" when
  // the truth is "we could not check" would be a fabrication.
  const [approverResult, hoursResult] = await Promise.all([
    supabase.rpc('fn_get_policy', { p_key: 'lc.broadcast.approver_user_id', p_scope_id: null }),
    supabase.rpc('fn_get_policy', { p_key: 'lc.broadcast.auto_send_hours', p_scope_id: null }),
  ]);

  const configUnreadable = Boolean(approverResult.error);
  if (approverResult.error) {
    console.error('[lc/broadcast] approver policy read failed:', approverResult.error.message);
  }
  if (hoursResult.error) {
    console.error('[lc/broadcast] auto-send policy read failed:', hoursResult.error.message);
  }

  const rawHours = hoursResult.data;
  const autoSendHours =
    typeof rawHours === 'number' && Number.isFinite(rawHours) && rawHours > 0
      ? rawHours
      : DEFAULT_AUTO_SEND_HOURS;

  const rawApprover = approverResult.data;
  const approverId = typeof rawApprover === 'string' && rawApprover.length > 0 ? rawApprover : null;

  if (!approverId) {
    return { approverId: null, approverName: null, approverEmail: null, autoSendHours, configUnreadable };
  }

  const { data: approver, error: approverLookupError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', approverId)
    .maybeSingle();

  if (approverLookupError) {
    console.error('[lc/broadcast] approver profile read failed:', approverLookupError.message);
  }

  return {
    approverId,
    approverName: approver?.full_name ?? null,
    approverEmail: approver?.email ?? null,
    autoSendHours,
    configUnreadable,
  };
}

/**
 * List broadcast requests the signed-in person is allowed to see.
 *
 * @param options.requesterId  restrict to one person's own submissions
 * @param options.pendingOnly  restrict to requests still awaiting a decision
 */
export async function listBroadcastRequests(options: {
  requesterId?: string;
  pendingOnly?: boolean;
}): Promise<BroadcastListResult> {
  const supabase = await createClient();

  let query = supabase
    .from('lc_broadcast_requests')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (options.requesterId) query = query.eq('requester_id', options.requesterId);
  if (options.pendingOnly) query = query.eq('status', 'pending');

  const { data, error } = await query;

  if (error) {
    console.error('[lc/broadcast] request list failed:', error.message);
    return { rows: [], readFailed: true };
  }

  const raw = (data ?? []) as Record<string, any>[];
  if (raw.length === 0) return { rows: [], readFailed: false };

  const summaries = raw.map((row) => summariseTargeting(row.targeting));

  const institutionIds = new Set<string>();
  for (const summary of summaries) {
    for (const id of summary.institutionIds) institutionIds.add(id);
  }

  const requesterIds = new Set<string>();
  for (const row of raw) {
    if (typeof row.requester_id === 'string') requesterIds.add(row.requester_id);
  }

  const [requesters, institutionNames, headcounts] = await Promise.all([
    loadRequesters(supabase, [...requesterIds]),
    loadInstitutionNames(supabase, [...institutionIds]),
    countLearnersByInstitution(supabase, [...institutionIds]),
  ]);

  // A sender's own college is an institution too, and it may not appear in any
  // targeting payload — resolve those names in one extra pass rather than
  // showing the approver a raw identifier.
  const requesterInstitutionIds = [...requesters.values()]
    .map((r) => r.institutionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && !institutionNames.has(id));

  if (requesterInstitutionIds.length > 0) {
    const extra = await loadInstitutionNames(supabase, requesterInstitutionIds);
    for (const [id, name] of extra) institutionNames.set(id, name);
  }

  const rows: BroadcastRequestView[] = raw.map((row, index) => {
    const summary = summaries[index];
    const requester = requesters.get(row.requester_id);

    const colleges: string[] = [];
    let unnamedCollegeCount = 0;
    for (const id of summary.institutionIds) {
      const name = institutionNames.get(id);
      if (name) colleges.push(name);
      else unnamedCollegeCount += 1;
    }

    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      body: String(row.body ?? ''),
      reach: String(row.reach ?? ''),
      status: String(row.status ?? ''),
      decisionNote: row.decision_note ?? null,
      autoSendAt: String(row.auto_send_at ?? ''),
      createdAt: String(row.created_at ?? ''),
      decidedAt: row.decided_at ?? null,
      requesterId: String(row.requester_id ?? ''),
      requesterName: requester?.fullName ?? null,
      requesterCollege: requester?.institutionId
        ? (institutionNames.get(requester.institutionId) ?? null)
        : null,
      colleges,
      unnamedCollegeCount,
      headcount: sumHeadcount(summary.institutionIds, headcounts),
      headcountIsCeiling: summary.isNarrowed,
      targetingRecognised: summary.recognised,
    };
  });

  return { rows, readFailed: false };
}

interface RequesterInfo {
  fullName: string | null;
  institutionId: string | null;
}

async function loadRequesters(
  supabase: any,
  ids: string[]
): Promise<Map<string, RequesterInfo>> {
  const map = new Map<string, RequesterInfo>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, institution_id')
    .in('id', ids);

  if (error) {
    // Not fatal: the screens render "name not available" rather than inventing
    // one. The decision itself never depends on this lookup.
    console.error('[lc/broadcast] sender profile read failed:', error.message);
    return map;
  }

  for (const row of data ?? []) {
    map.set(row.id, { fullName: row.full_name ?? null, institutionId: row.institution_id ?? null });
  }
  return map;
}

async function loadInstitutionNames(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('institutions')
    .select('id, name, display_name')
    .in('id', ids);

  if (error) {
    console.error('[lc/broadcast] college name read failed:', error.message);
    return map;
  }

  for (const row of data ?? []) {
    const name = row.display_name || row.name;
    if (name) map.set(row.id, name);
  }
  return map;
}

/**
 * How many learners each named college holds.
 *
 * Mirrors the predicate the delivery route actually uses: an active profile
 * whose role is the learner role key, in that college. 'student' below is the
 * literal value stored in profiles.role — a database value, not wording.
 *
 * A per-college count that errors is recorded as null so the caller can refuse
 * to add it up, rather than quietly reporting a smaller total.
 */
async function countLearnersByInstitution(
  supabase: any,
  ids: string[]
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (ids.length === 0) return map;

  const results = await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .eq('is_active', true)
        .eq('institution_id', id);

      if (error) {
        console.error('[lc/broadcast] headcount read failed for one college:', error.message);
        return [id, null] as const;
      }
      return [id, typeof count === 'number' ? count : null] as const;
    })
  );

  for (const [id, value] of results) map.set(id, value);
  return map;
}

/**
 * Add up the per-college counts, refusing to answer if any part is missing.
 *
 * A total of zero is also refused. An all-college council broadcast that would
 * genuinely reach nobody does not happen; a zero here means the count did not
 * work, and printing "0 learners" beside an Approve button would be the most
 * dangerous possible reassurance.
 */
function sumHeadcount(ids: string[], counts: Map<string, number | null>): number | null {
  if (ids.length === 0) return null;
  let total = 0;
  for (const id of ids) {
    const value = counts.get(id);
    if (typeof value !== 'number') return null;
    total += value;
  }
  return total > 0 ? total : null;
}
