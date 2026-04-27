export const dynamic = 'force-dynamic';

// app/api/admission/leads/list/route.ts
// Server-side leads list endpoint — uses service role to bypass RLS overhead.
//
// The admission_leads table has complex cascading RLS policies:
//   admission_leads → user_roles (RLS) → profiles (RLS)
// This 3-level cascade exceeds the 8s authenticated role timeout.
// Using the service role with manual auth/permission checks is the standard
// pattern (same as marketing-leads-database-service).

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import { sanitizeSearch } from '@/lib/config/pagination';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    user = result.user;
  } catch (err) {
    console.error('[admission/leads/list] Auth fetch failed:', err);
    return NextResponse.json(
      { error: 'Authentication temporarily unavailable. Please retry.' },
      { status: 503 }
    );
  }

  // 2. Check the user has admission lead view access via the dynamic
  //    permission system. Replaces the previous hardcoded allowlist
  //    (super_admin / institution_scope='all' / role_key in admission/counselor)
  //    so any custom role granted admission.leads.view works.
  const supabase = createServiceRoleClient();

  const { data: profile } = await retryOnFetchFailure(() =>
    supabase
      .from('profiles')
      .select('id, role, institution_id, is_super_admin')
      .eq('id', user.id)
      .single()
  );

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const isSuperAdmin = !!profile.is_super_admin || profile.role === 'super_admin';

  let canViewLeads = isSuperAdmin;
  if (!canViewLeads) {
    const { data: permResult } = await retryOnFetchFailure(() =>
      supabase.rpc('user_has_permission', {
        user_id: user.id,
        permission_key: 'admission.leads.view'
      })
    );
    canViewLeads = !!permResult;
  }

  if (!canViewLeads) {
    return NextResponse.json(
      { error: 'Forbidden: admission.leads.view permission required' },
      { status: 403 }
    );
  }

  // Cross-institution access flag drives the "show all institutions vs scope
  // to own" branch below. True when super_admin OR any of the user's roles is
  // institution_scope='all' OR the user's effective admission module scope is
  // 'all_institutions' (per-module override).
  let isAdmissionGlobalUser = isSuperAdmin;
  if (!isAdmissionGlobalUser) {
    const { data: scopedRoles } = await retryOnFetchFailure(() =>
      supabase
        .from('user_roles')
        .select('custom_roles!inner(institution_scope, module_scopes)')
        .eq('user_id', user.id)
    );
    isAdmissionGlobalUser = (scopedRoles || []).some((ur: any) => {
      const cr = ur.custom_roles;
      if (!cr) return false;
      if (cr.institution_scope === 'all') return true;
      const moduleScope = (cr.module_scopes ?? {})['admission'];
      return moduleScope === 'all_institutions';
    });
  }

  // 3. Parse query parameters
  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const search = searchParams.get('search') || undefined;
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
    // 4. Build the query with service role (no RLS overhead)
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
        interested_programs,
        preferred_channel,
        counselor_id,
        expo_event_id,
        created_at,
        updated_at,
        counselor:admission_counselors(id, name, email),
        institution:institutions(id, name)
      `, { count: 'exact' });

    // 5. Apply institution scoping (manual RLS replacement)
    // Super admins and admission global users can see all institutions.
    // Counselors and other users are scoped to their own institution.
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    } else if (!isAdmissionGlobalUser) {
      if (!profile.institution_id) {
        // User has no institution assigned — return empty result
        return NextResponse.json({
          data: [],
          metadata: { total: 0, page, limit, totalPages: 0 },
        });
      }
      query = query.eq('institution_id', profile.institution_id);
    }

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

    // Filter by program — `interested_programs` is a uuid[] column.
    // `.contains()` translates to the PostgreSQL `@>` array-contains operator,
    // so this returns rows whose interested_programs array includes programId.
    if (programId) {
      query = query.contains('interested_programs', [programId]);
    }

    if (search) {
      const sanitized = sanitizeSearch(search);
      if (sanitized) {
        query = query.or(
          `full_name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
        );
      }
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
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

    // 7. Sorting and pagination
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await retryOnFetchFailure(() => query);

    if (error) throw error;

    // 8. Resolve program IDs on `interested_programs` to names server-side so
    //    the client never renders raw UUIDs while a client-side map loads.
    //    `interested_programs` is a uuid[] / text[] column — Supabase can't
    //    auto-join it, so we batch-fetch the names here and inject them.
    const rows = data || [];
    const programIds = Array.from(
      new Set(
        rows.flatMap((r: any) =>
          Array.isArray(r.interested_programs) ? r.interested_programs : []
        )
      )
    ) as string[];

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

    const enriched = rows.map((r: any) => ({
      ...r,
      interested_program_names: Array.isArray(r.interested_programs)
        ? r.interested_programs
            .map((id: string) => programNameMap.get(id))
            .filter(Boolean)
        : [],
    }));

    return NextResponse.json({
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

    return NextResponse.json({ error: message }, { status });
  }
}
