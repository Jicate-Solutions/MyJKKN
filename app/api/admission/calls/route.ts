export const dynamic = 'force-dynamic';

// app/api/admission/calls/route.ts
// GET /api/admission/calls — List call logs with filters

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { TelephonyService, type CallLogFilters, type CallStatus, type CallDisposition, type CallDirection } from '@/lib/services/telephony/telephony-service';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  getCounselorScope,
  buildLeadVisibilityOr,
} from '@/lib/api-helpers/admission-counselor-scope';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = request.nextUrl;
    // institution_id is optional — omitting it returns all institutions (super admins).
    const institution_id = searchParams.get('institution_id') || undefined;

    const admissionOnlyParam = searchParams.get('admission_only');
    const filters: CallLogFilters = {
      institution_id,
      counselor_id: searchParams.get('counselor_id') || undefined,
      lead_id: searchParams.get('lead_id') || undefined,
      status: (searchParams.get('status') as CallStatus) || undefined,
      disposition: (searchParams.get('disposition') as CallDisposition) || undefined,
      direction: (searchParams.get('direction') as CallDirection) || undefined,
      from_date: searchParams.get('from') || searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to') || searchParams.get('to_date') || undefined,
      has_notes: searchParams.get('has_notes') === 'true' ? true : searchParams.get('has_notes') === 'false' ? false : undefined,
      admission_only: admissionOnlyParam === 'false' ? false : true, // default to true
      search: searchParams.get('search') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sort_by: searchParams.get('sort_by') || undefined,
      sort_order: (searchParams.get('sort_order') as 'asc' | 'desc') || undefined,
    };

    const supabase = createServiceRoleClient();

    // Counselor source-scoping — mirrors the admission_call_logs RLS in
    // 20260509130000_admission_leads_source_scoped_rls.sql. Strict counselors
    // see only call logs for leads they can see (assigned-to-them OR via
    // their currently-assigned source mappings). The service-role bypass on
    // the leads endpoint applies here too, so we replicate the rule manually.
    const scope = await getCounselorScope(supabase, user.id);
    if (scope.isStrictCounselor) {
      const orClause = buildLeadVisibilityOr(scope, user.id);
      if (!orClause) {
        // Strict counselor with zero accessible leads → empty result.
        return NextResponse.json({
          success: true,
          data: [],
          metadata: { total: 0, page: filters.page ?? 1, limit: filters.limit ?? 20, totalPages: 0 },
        });
      }
      // Resolve user's home institution for the lead-id pre-fetch fallback.
      const { data: scopeProfile } = await supabase
        .from('profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();
      // Pre-compute visible lead_ids in the user's institution. We cap at
      // 5000 to keep the IN-list manageable; for any institution that
      // exceeds this, scaling concerns dominate the UX anyway.
      let leadIdQuery = supabase
        .from('admission_leads')
        .select('id')
        .or(orClause)
        .limit(5000);
      if (filters.institution_id) {
        leadIdQuery = leadIdQuery.eq('institution_id', filters.institution_id);
      } else if (scopeProfile?.institution_id) {
        leadIdQuery = leadIdQuery.eq('institution_id', scopeProfile.institution_id);
      }
      const { data: leadIdRows } = await leadIdQuery;
      filters.lead_id_in = (leadIdRows ?? []).map((r: any) => r.id as string);
    }

    const result = await TelephonyService.getCallLogs(filters, supabase);

    return NextResponse.json({
      success: true,
      data: result.logs,
      metadata: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error('admission/calls', 'Get call logs error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
