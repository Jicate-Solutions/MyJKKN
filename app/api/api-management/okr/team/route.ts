// app/api/api-management/okr/team/route.ts
// External API for OKR Team Summary

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() { return undefined; },
          set() {},
          remove() {}
        }
      }
    );

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const managerId = url.searchParams.get('manager_id');
    const institutionId = url.searchParams.get('institution_id');
    const departmentId = url.searchParams.get('department_id');

    // Get team summary from view
    let query = (supabase as any)
      .from('v_team_okr_summary')
      .select('*');

    if (managerId) {
      query = query.eq('manager_id', managerId);
    }

    const { data: teamData, error: teamError } = await query;

    if (teamError) throw teamError;

    // Get user statuses
    const statusQuery = (supabase as any)
      .from('okr_user_status')
      .select(`
        *,
        user:auth.users!user_id(id, email, raw_user_meta_data)
      `);

    const { data: userStatuses, error: statusError } = await statusQuery;

    if (statusError) throw statusError;

    // Aggregate the data
    const summary = {
      total_objectives: 0,
      on_track: 0,
      at_risk: 0,
      behind: 0,
      blocked_users: 0,
      overdue_checkins: 0,
      team_members: [] as any[]
    };

    if (teamData && teamData.length > 0) {
      const aggregated = teamData[0];
      summary.total_objectives = aggregated.total_objectives || 0;
      summary.on_track = aggregated.on_track_count || 0;
      summary.at_risk = aggregated.at_risk_count || 0;
      summary.behind = aggregated.behind_count || 0;
      summary.blocked_users = aggregated.blocked_count || 0;
      summary.overdue_checkins = aggregated.overdue_checkins || 0;
    }

    if (userStatuses) {
      summary.team_members = userStatuses.map((status: any) => ({
        user_id: status.user_id,
        user: {
          id: status.user?.id,
          email: status.user?.email,
          first_name: status.user?.raw_user_meta_data?.first_name,
          last_name: status.user?.raw_user_meta_data?.last_name,
          full_name: status.user?.raw_user_meta_data?.full_name
        },
        objectives_count: status.total_objectives || 0,
        average_progress: status.total_objectives > 0
          ? Math.round((status.on_track_count / status.total_objectives) * 100)
          : 0,
        last_check_in_date: status.last_check_in_date,
        badge: status.current_badge,
        is_blocked: status.current_badge === 'blocked'
      }));
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({ data: summary }, { headers: corsHeaders });

  } catch (error) {
    console.error('[OKR Team API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
