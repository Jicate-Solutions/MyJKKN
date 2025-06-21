import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ActivityService } from '@/lib/services/activity-service';
import { ActivityLogFilters } from '@/types/activity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with role information
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as
      | 'asc'
      | 'desc';

    // Build filters
    const filters: ActivityLogFilters = {
      user_id: searchParams.get('user_id') || undefined,
      action_type: searchParams.get('action_type') || undefined,
      resource_type: searchParams.get('resource_type') || undefined,
      resource_id: searchParams.get('resource_id') || undefined,
      institution_id: searchParams.get('institution_id') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      search: searchParams.get('search') || undefined,
      ip_address: searchParams.get('ip_address') || undefined,
      status_code: searchParams.get('status_code')
        ? parseInt(searchParams.get('status_code')!)
        : undefined,
      session_id: searchParams.get('session_id') || undefined
    };

    // Apply role-based access control
    if (profile.role === 'student' || profile.role === 'staff') {
      // Regular users can only see their own activity logs
      filters.user_id = user.id;
    } else if (profile.role === 'administrator') {
      // Administrators can see all logs except super admin activities
      // This is handled in the service layer
    }
    // Super admins can see all logs (no additional filtering needed)

    const result = await ActivityService.getActivityLogs({
      filters,
      page,
      limit,
      sortBy,
      sortOrder
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity logs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with role information
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only allow system services and authorized users to create activity logs
    if (!['super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const activityLog = await ActivityService.logActivity({
      user_id: body.user_id || user.id,
      action_type: body.action_type,
      resource_type: body.resource_type,
      resource_id: body.resource_id,
      resource_name: body.resource_name,
      description: body.description,
      request,
      metadata: body.metadata || {},
      institution_id: body.institution_id || profile.institution_id
    });

    return NextResponse.json(activityLog, { status: 201 });
  } catch (error) {
    console.error('Error creating activity log:', error);
    return NextResponse.json(
      { error: 'Failed to create activity log' },
      { status: 500 }
    );
  }
}
