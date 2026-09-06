import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/jkkn/institutions
 *
 * Reads institutions directly from the local `institutions` table using the
 * cookie-scoped (per-request) Supabase client, so the response reflects the
 * authenticated user's session. The `institutions_select` RLS policy grants
 * role `authenticated` read access to all institutions (qual `true`), so any
 * logged-in user receives the full active list and unauthenticated callers
 * get nothing.
 *
 * This replaces the previous self-proxy that fetched MyJKKN's own
 * /api/api-management/organizations/institutions with a Bearer JKKN_API_KEY.
 * That key is unset in production, so the old guard returned HTTP 500 and
 * every institution picker rendered empty. The direct DB read removes the
 * circular self-call and the JKKN_API_KEY dependency, and adds a 401 auth
 * gate the proxy lacked.
 *
 * Params: ?page (default 1), ?limit (default 20), ?search (optional),
 * ?isActive (optional). Response shape is preserved as
 * { data, metadata: { total, page, limit, totalPages } }.
 */

/**
 * Strip characters that are reserved syntax inside a PostgREST `.or()` filter
 * string (comma separates conditions; parentheses group; `*` is the ilike
 * wildcard; backslash escapes). Mirrors the sanitizeSearch helper in
 * app/api/cdc/bulletin/route.ts. Normal alphanumeric searches pass through.
 */
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*\\]/g, '').trim();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') ?? '1') || 1;
    const limit = Number(searchParams.get('limit') ?? '20') || 20;
    const search = searchParams.get('search');
    const isActive = searchParams.get('isActive');

    let query = supabase
      .from('institutions')
      .select(
        'id, name, counselling_code, category, institution_type, is_active, created_at, updated_at',
        { count: 'exact' }
      );

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    if (search) {
      const safeSearch = sanitizeSearch(search);
      if (safeSearch) {
        query = query.or(
          `name.ilike.%${safeSearch}%,counselling_code.ilike.%${safeSearch}%`
        );
      }
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.order('name', { ascending: true }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: 'Failed to load institutions', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: limit > 0 ? Math.ceil((count ?? 0) / limit) : 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to load institutions', details: message },
      { status: 500 }
    );
  }
}
