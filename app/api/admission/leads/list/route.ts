export const dynamic = 'force-dynamic';

// app/api/admission/leads/list/route.ts
// Server-side leads list endpoint — uses service role to bypass RLS overhead.
//
// The admission_leads table has complex cascading RLS policies:
//   admission_leads → user_roles (RLS) → profiles (RLS)
// This 3-level cascade exceeds the 8s authenticated role timeout.
// Using the service role with manual auth/permission checks is the standard
// pattern (same as marketing-leads-database-service).

import { NextRequest, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import { jsonNoStore } from '@/lib/api-helpers/no-store-response';
import { sanitizeSearch } from '@/lib/config/pagination';
import {
  resolveLeadAccess,
  applyLeadVisibility,
  leadViewDenialReason,
} from '@/lib/api-helpers/admission-lead-visibility';

// Retry only on undici / Node fetch transient failures (cold-start flakes on
// Windows + Turbopack). Postgres errors should surface immediately without retry.
function isTransientFetchError(err: unknown): boolean {
  const msg =
    (err as any)?.message ??
    (err as any)?.details ??
    (typeof err === 'string' ? err : '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR/i.test(String(msg));
}

async function retryOnFetchFailure<T>(fn: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let delay = 200;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (isLastAttempt || !isTransientFetchError(err)) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.floor(delay * 1.5);
    }
  }
  // Unreachable, satisfies TS
  throw new Error('retryOnFetchFailure: exhausted attempts');
}

export async function GET(request: NextRequest) {
  await connection();

  // 1. Authenticate the user (wrapped so undici cold-start flakes auto-retry)
  let user: any = null;
  try {
    const result = await retryOnFetchFailure(() => getAuthUser());
    if (result.error || !result.user) {
      return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    user = result.user;
  } catch (err) {
    console.error('[admission/leads/list] Auth fetch failed:', err);
    return jsonNoStore(
      { error: 'Authentication temporarily unavailable. Please retry.' },
      { status: 503 }
    );
  }

  // 2. Resolve the caller's lead-access scope in a SINGLE round-trip.
  //    fn_admission_lead_scope (SECURITY DEFINER) folds the former 5-query
  //    prelude — profiles + user_has_permission + allowlist + global-flag +
  //    admission_counselors — into one DB call, delegating to the same SQL
  //    helpers adm_leads_select RLS uses (single source of truth). The shared
  //    applyLeadVisibility() then scopes the query identically to the [id]
  //    detail route so the two can never diverge (BUG-003956).
  //    See lib/api-helpers/admission-lead-visibility.ts.
  const supabase = createServiceRoleClient();

  let access;
  try {
    access = await resolveLeadAccess(supabase, user.id);
  } catch (err) {
    console.error('[admission/leads/list] Scope resolution failed:', err);
    return jsonNoStore(
      { error: 'Authentication temporarily unavailable. Please retry.' },
      { status: 503 }
    );
  }

  if (!access.profileExists) {
    return jsonNoStore({ error: 'Profile not found' }, { status: 403 });
  }

  // Permission + defense-in-depth role allowlist gate (2026-05-11 lockdown):
  // needs admission.leads.view AND the role allowlist; super-admin bypasses both.
  const denial = leadViewDenialReason(access);
  if (denial) {
    return jsonNoStore({ error: denial }, { status: 403 });
  }

  // 3. Parse query parameters
  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const search = searchParams.get('search') || undefined;
  // Default sort = created_at DESC.
  // Previously defaulted to last_activity_at DESC, which is bumped on every
  // edit / source-capture and so re-floated the just-edited lead to the top
  // after each update. To a counselor watching one lead, the list appeared to
  // reshuffle / show "someone else's lead" between refetches
  // (BUG-004123/BUG-004121/BUG-004120/BUG-004119/BUG-004117/BUG-003960/BUG-003954).
  // created_at is immutable so the row's position is stable across edits.
  // The leads list client already sends sort_by=created_at by default; this
  // aligns the route default for any other caller (dashboard deep-links) that
  // omits sort_by. Callers wanting recency can still pass ?sort_by=last_activity_at.
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortOrder = searchParams.get('sort_order') || 'desc';
  const funnelStage = searchParams.get('funnel_stage') || undefined;
  const priority = searchParams.get('priority') || undefined;
  const source = searchParams.get('source') || undefined;
  const counselorId = searchParams.get('counselor_id') || undefined;
  const expoEventId = searchParams.get('expo_event_id') || undefined;
  const capturedBy = searchParams.get('captured_by') || undefined;
  const dateFrom = searchParams.get('date_from') || undefined;
  const dateTo = searchParams.get('date_to') || undefined;
  const institutionId = searchParams.get('institution_id') || undefined;
  const waOptIn = searchParams.get('wa_opt_in') || undefined;
  const programId = searchParams.get('program_id') || undefined;
  // ?stale_min_days=N — return leads with no contact in N+ days. Falls back to
  // last_activity_at, then created_at, when last_contact_at is null. Used by the
  // dashboard:rescue daily digest deep-link.
  const staleMinDaysRaw = searchParams.get('stale_min_days');
  const staleMinDays = staleMinDaysRaw ? Math.max(1, Math.min(365, parseInt(staleMinDaysRaw, 10))) : undefined;

  try {
    // Visibility scope was resolved above (access) in one round-trip;
    // applyLeadVisibility() inside buildQuery applies it identically to the
    // [id] detail route. No per-request scope queries or empty-result guards
    // are needed here — applyLeadVisibility fails closed (a non-strict,
    // non-global user with no institution matches a sentinel UUID = zero rows).

    // Query factory — produces a fresh, identically-filtered query each call so
    // it can be re-issued for the out-of-range page clamp (PostgREST 416, see
    // the pagination section). supabase-js builders are single-use once awaited.
    const buildQuery = () => {
      let query = supabase
        .from('admission_leads')
        .select(`
          id,
          institution_id,
          full_name,
          first_name,
          last_name,
          email,
          phone,
          funnel_stage,
          stage,
          source,
          is_hot_lead,
          is_priority,
          score,
          score_category,
          date_of_birth,
          gender,
          address_line1,
          city,
          state,
          parent_name,
          parent_phone,
          program_id,
          alternative_programs,
          interested_programs,
          preferred_channel,
          counselor_id,
          assigned_counselor_id,
          expo_event_id,
          created_at,
          updated_at,
          counselor:admission_counselors(id, name, email),
          institution:institutions(id, name)
        `, { count: 'exact' });

      // Visibility scoping — institution clamp (additive) + strict-counselor
      // ownership OR + referral exclusion — all centralised in applyLeadVisibility
      // (lib/api-helpers/admission-lead-visibility.ts) so the LIST and the [id]
      // DETAIL route can never diverge (BUG-003956). excludeReferral=true: the
      // list hides referral leads from counselors; detail keeps owned referrals.
      query = applyLeadVisibility(query, access, {
        explicitInstitutionId: institutionId,
        excludeReferral: true,
      });

      // 6. Apply filters
      if (funnelStage) {
        const safe = funnelStage.replace(/[^a-z_]/g, '');
        if (safe) {
          query = query.or(`stage.eq.${safe},funnel_stage.eq.${safe}`);
        }
      }

      if (priority) {
        if (priority === 'hot') {
          query = query.eq('is_hot_lead', true);
        } else if (priority === 'warm') {
          query = query.eq('is_priority', true).eq('is_hot_lead', false);
        } else if (priority === 'cold') {
          query = query.eq('is_hot_lead', false).eq('is_priority', false);
        }
      }

      if (source) {
        query = query.eq('source', source);
      }

      if (counselorId) {
        query = query.eq('counselor_id', counselorId);
      }

      if (expoEventId) {
        query = query.eq('expo_event_id', expoEventId);
      }

      if (capturedBy) {
        query = query.eq('captured_by', capturedBy);
      }

      if (waOptIn === 'true') {
        query = query.eq('wa_opt_in', true);
      }

      // Filter by program — match against ALL three program-id storage columns
      // since the 2026-04-21 split:
      //   - program_id (single uuid, primary)            → `eq`
      //   - alternative_programs (uuid[], multi-select) → `cs` (array contains)
      //   - interested_programs (legacy uuid[])         → `cs` (pre-split rows)
      // The `.or(...)` chain emits one PostgREST `or=(...)` clause so the user
      // sees every lead that lists this program in any of the three columns.
      // UUIDs are safe to interpolate (alphanumeric + dashes only — no escape
      // hazards in the PostgREST OR syntax).
      if (programId) {
        query = query.or(
          [
            `program_id.eq.${programId}`,
            `alternative_programs.cs.{${programId}}`,
            `interested_programs.cs.{${programId}}`,
          ].join(','),
        );
      }

      if (search) {
        const sanitized = sanitizeSearch(search);
        if (sanitized) {
          query = query.or(
            `full_name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
          );
        }
      }

      // Date-wise filter on created_at. The DataTable toolbar sends date-only
      // strings (YYYY-MM-DD); Postgres would cast those to midnight UTC, which
      // (a) excludes leads created during the end date and (b) shifts the day
      // boundary 5h30m off what IST users see in the UI. So date-only values
      // are anchored to IST day boundaries; full ISO timestamps (other API
      // callers) pass through unchanged.
      const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
      if (dateFrom) {
        const from = DATE_ONLY.test(dateFrom) ? `${dateFrom}T00:00:00+05:30` : dateFrom;
        query = query.gte('created_at', from);
      }
      if (dateTo) {
        const to = DATE_ONLY.test(dateTo) ? `${dateTo}T23:59:59.999+05:30` : dateTo;
        query = query.lte('created_at', to);
      }

      // Stale filter — leads with no contact in N+ days. PostgREST has no direct
      // COALESCE-comparison primitive, so emulate it with an OR over three
      // mutually-exclusive branches: last_contact_at first, then last_activity_at
      // when contact is null, then created_at when both are null. Cutoff is
      // computed in JS so the comparison is a literal timestamp PostgREST accepts.
      if (staleMinDays && staleMinDays > 0) {
        const cutoff = new Date(Date.now() - staleMinDays * 24 * 60 * 60 * 1000).toISOString();
        query = query.or(
          `last_contact_at.lt.${cutoff},` +
          `and(last_contact_at.is.null,last_activity_at.lt.${cutoff}),` +
          `and(last_contact_at.is.null,last_activity_at.is.null,created_at.lt.${cutoff})`
        );
      }

      // 7. Sorting.
      // Stable secondary sort key (id) so rows sharing the same sortBy value
      // (e.g. identical last_activity_at after a batch capture) keep a fixed
      // relative order across refetches instead of reshuffling. Without it,
      // editing one lead re-floats it and the list appears to "change" or show
      // someone else's lead between refreshes.
      // BUG-004123/BUG-004121/BUG-004120/BUG-004119/BUG-004117/BUG-003960/BUG-003954
      return query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .order('id', { ascending: true });
    };

    // 8. Pagination with last-page clamp. A stale ?page=N past the (possibly
    // just-filtered) result count makes PostgREST answer 416 "Requested Range
    // Not Satisfiable" (BUG-003967). On that error we re-issue at page 1 so the
    // table renders rather than throwing; metadata.totalPages still reports the
    // true bound so the client's pager self-corrects.
    const requestedPage = Math.max(1, page);
    const from = (requestedPage - 1) * limit;
    let { data, error, count } = await retryOnFetchFailure(() =>
      buildQuery().range(from, from + limit - 1),
    );
    const isRangeError =
      !!error &&
      (String((error as any)?.code) === 'PGRST103' ||
        /range not satisfiable/i.test(String((error as any)?.message)));
    if (isRangeError) {
      ({ data, error, count } = await retryOnFetchFailure(() =>
        buildQuery().range(0, limit - 1),
      ));
    }

    if (error) throw error;

    // 9. Resolve program IDs to names server-side so the client never renders
    //    raw UUIDs while a client-side map loads.
    //
    //    Three columns can hold program IDs since the 2026-04-21 split:
    //      - program_id (uuid)            : the primary "Interested Program"
    //      - alternative_programs (uuid[]): backup picks (multi-select)
    //      - interested_programs (uuid[]) : LEGACY column, kept for ~350 pre-
    //                                       split rows; no new writes go here
    //
    //    Earlier this endpoint only read `interested_programs`, so every lead
    //    created since the split (including all gate-entry captures) had an
    //    empty Interested Courses cell. Now we union all three sources, dedupe
    //    via Set, batch-resolve the names, and emit them in primary-then-alts
    //    order so the table's "show first 2 + N more" UI puts the primary first.
    const rows = data || [];
    const programIdSet = new Set<string>();
    for (const r of rows as any[]) {
      if (typeof r.program_id === 'string' && r.program_id) programIdSet.add(r.program_id);
      if (Array.isArray(r.alternative_programs)) {
        r.alternative_programs.forEach((id: string) => id && programIdSet.add(id));
      }
      if (Array.isArray(r.interested_programs)) {
        r.interested_programs.forEach((id: string) => id && programIdSet.add(id));
      }
    }
    const programIds = [...programIdSet];

    let programNameMap = new Map<string, string>();
    if (programIds.length) {
      const { data: programs } = await retryOnFetchFailure(() =>
        supabase
          .from('programs')
          .select('id, program_name')
          .in('id', programIds)
      );
      (programs || []).forEach((p: any) => {
        if (p?.id && p?.program_name) programNameMap.set(p.id, p.program_name);
      });
    }

    const enriched = rows.map((r: any) => {
      // Build the per-lead name list in display order:
      //   primary (program_id) → alternatives (alternative_programs[])
      //   → legacy (interested_programs[], for pre-split rows only)
      // Dedupe within the lead so a primary that was also marked as an alt
      // doesn't render twice.
      const seen = new Set<string>();
      const names: string[] = [];
      const push = (id: string | null | undefined) => {
        if (!id || seen.has(id)) return;
        const name = programNameMap.get(id);
        if (!name) return;
        seen.add(id);
        names.push(name);
      };
      push(r.program_id);
      if (Array.isArray(r.alternative_programs)) {
        r.alternative_programs.forEach(push);
      }
      if (Array.isArray(r.interested_programs)) {
        r.interested_programs.forEach(push);
      }
      return { ...r, interested_program_names: names };
    });

    return jsonNoStore({
      data: enriched,
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error('[admission/leads/list] API route error:', err);
    // Postgrest errors are plain objects (not Error instances), so we must dig
    // into common message-bearing fields before falling back to a generic string.
    const message =
      (err as any)?.message ||
      (err as any)?.details ||
      (err as any)?.hint ||
      (err as any)?.error_description ||
      (typeof err === 'string' ? err : null) ||
      'Internal server error';

    // Surface a 503 for transient fetch failures so the client knows it's safe
    // to retry, instead of treating it as a permanent 500 bug.
    const status = isTransientFetchError(err) ? 503 : 500;

    return jsonNoStore({ error: message }, { status });
  }
}
