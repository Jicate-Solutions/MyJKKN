

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

export async function GET(request: NextRequest) {
  await connection();

  // 1. Authenticate the user
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check the user has admission access
  const supabase = createServiceRoleClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const isSuperAdmin = profile.role === 'super_admin';

  // Check if user has admission or counselor custom role
  let isAdmissionGlobalUser = isSuperAdmin || profile.role === 'admission';
  let isAdmissionUser = isAdmissionGlobalUser;

  if (!isAdmissionUser) {
    // Check custom_roles for admission or counselor role
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id, custom_roles!inner(role_key)')
      .eq('user_id', user.id)
      .in('custom_roles.role_key', ['admission', 'counselor']);

    if (userRoles && userRoles.length > 0) {
      isAdmissionUser = true;
      // Admission role gets global (all-institution) access
      isAdmissionGlobalUser = userRoles.some(
        (r: any) => r.custom_roles?.role_key === 'admission'
      );
    }
  }

  if (!isAdmissionUser) {
    return NextResponse.json({ error: 'Forbidden: admission access required' }, { status: 403 });
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
        counselor:admission_counselors(id, name, email)
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

    // 7. Sorting and pagination
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
  } catch (err) {
    console.error('[admission/leads/list] API route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
