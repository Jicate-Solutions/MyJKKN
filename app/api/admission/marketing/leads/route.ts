export const dynamic = 'force-dynamic';

// app/api/admission/marketing/leads/route.ts
// Server-side fetch endpoint for marketing leads database.
// Uses service role client to bypass RLS overhead that causes statement timeouts.
// Supports: GET ?action=leads|districts|stats|batches
//
// FIX (2026-08-02): the `districts`, `stats`, and `batches` actions previously
// fetched EVERY row for the institution and aggregated in JS. PostgREST caps
// un-ranged selects at 10,000 rows and still returns HTTP 200 — with 100,950
// rows in prod the aggregates were silently computed over <10% of the data
// (districts showed 1 of 4; batches showed 1 of 2 with total_records=10,000
// instead of 77,902; totalSchools said 131 instead of 893). All three actions
// now call ONE SQL aggregate RPC, get_marketing_leads_facets (SECURITY
// INVOKER, EXECUTE locked to service_role — see the migration of the same
// name), which computes exact facets over the full table in a single
// round-trip. Same disease and fix shape as PR #2762.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action') || 'leads';
  const institutionId = searchParams.get('institution_id');

  if (!institutionId) {
    return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    switch (action) {
      case 'leads': {
        const search = searchParams.get('search') || undefined;
        const district = searchParams.get('district') || undefined;
        const gender = searchParams.get('gender') || undefined;
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const sortBy = searchParams.get('sort_by') || 'created_at';
        const sortOrder = searchParams.get('sort_order') || 'desc';

        let query = supabase
          .from('marketing_leads_database')
          .select('*', { count: 'exact' })
          .eq('institution_id', institutionId);

        if (search) {
          query = query.or(
            `student_name.ilike.%${search}%,father_name.ilike.%${search}%,mobile_number.ilike.%${search}%,school_name.ilike.%${search}%,district.ilike.%${search}%`
          );
        }
        if (district) query = query.eq('district', district);
        if (gender) query = query.eq('gender', gender);

        query = query.order(sortBy, { ascending: sortOrder === 'asc' });
        const from = (page - 1) * limit;
        query = query.range(from, from + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return NextResponse.json({
          data: data || [],
          metadata: {
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
          },
        });
      }

      case 'districts': {
        // Exact distinct districts over the FULL table via SQL aggregate —
        // the old row-fetch was capped at 10k rows and returned 1 of 4
        // districts in prod.
        const { data: facets, error } = await supabase.rpc(
          'get_marketing_leads_facets',
          { p_institution_id: institutionId }
        );
        if (error) throw error;

        return NextResponse.json(facets?.districts || []);
      }

      case 'stats': {
        // ONE SQL aggregate round-trip over the full table. The previous
        // implementation used exact head-counts for totals/gender (correct)
        // but still fetched raw rows for the three DISTINCT computations,
        // which the 10k PostgREST cap silently truncated.
        const { data: facets, error } = await supabase.rpc(
          'get_marketing_leads_facets',
          { p_institution_id: institutionId }
        );
        if (error) throw error;

        return NextResponse.json({
          totalLeads: facets?.total_leads || 0,
          totalDistricts: facets?.total_districts || 0,
          totalSchools: facets?.total_schools || 0,
          genderBreakdown: {
            male: facets?.gender_male || 0,
            female: facets?.gender_female || 0,
            other: facets?.gender_other || 0,
          },
          totalUploads: facets?.total_uploads || 0,
        });
      }

      case 'batches': {
        // Per-batch rollup in SQL — the old row-fetch grouped only the first
        // 10k rows, so a 77,902-record batch reported total_records=10,000
        // and the second batch was invisible.
        const { data: facets, error } = await supabase.rpc(
          'get_marketing_leads_facets',
          { p_institution_id: institutionId }
        );
        if (error) throw error;

        return NextResponse.json(facets?.batches || []);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[admission/marketing-leads-db] API route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
