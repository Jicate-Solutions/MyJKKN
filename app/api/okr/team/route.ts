// app/api/okr/team/route.ts
// Internal API for OKR Team Dashboard (session-based auth)

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    const url = new URL(request.url);
    const departmentId = url.searchParams.get('department_id');
    const institutionId = url.searchParams.get('institution_id');
    const includeMembers = url.searchParams.get('include_members') !== 'false';

    // Build team objectives query
    let objectivesQuery = (supabase as any)
      .from('okr_objectives')
      .select(`
        id, title, status, overall_progress, level, tier,
        owner:profiles!owner_id(id, full_name, email, avatar_url),
        key_results:okr_key_results(id, status, progress_percentage)
      `)
      .eq('status', 'active');

    // Filter by department or institution based on user role
    if (profile?.role === 'hod' && profile.department_id) {
      objectivesQuery = objectivesQuery.eq('department_id', departmentId || profile.department_id);
    } else if (profile?.role === 'administrator' && profile.institution_id) {
      objectivesQuery = objectivesQuery.eq('institution_id', institutionId || profile.institution_id);
    } else if (departmentId) {
      objectivesQuery = objectivesQuery.eq('department_id', departmentId);
    } else if (institutionId) {
      objectivesQuery = objectivesQuery.eq('institution_id', institutionId);
    }

    const { data: objectives, error: objError } = await objectivesQuery;
    if (objError) throw objError;

    // Calculate team summary
    let onTrack = 0, atRisk = 0, behind = 0, blocked = 0;
    let totalProgress = 0;
    const owners = new Set<string>();

    objectives?.forEach((obj: any) => {
      if (obj.owner?.id) owners.add(obj.owner.id);
      totalProgress += obj.overall_progress || 0;

      // Count KR statuses
      obj.key_results?.forEach((kr: any) => {
        switch (kr.status) {
          case 'on_track': onTrack++; break;
          case 'at_risk': atRisk++; break;
          case 'behind': behind++; break;
          case 'blocked': blocked++; break;
        }
      });
    });

    // Get compliance status for team
    let complianceQuery = (supabase as any)
      .from('okr_user_status')
      .select(`
        *,
        user:profiles!user_id(id, full_name, email, avatar_url, role, department_id)
      `);

    if (profile?.department_id) {
      complianceQuery = complianceQuery.eq('user.department_id', departmentId || profile.department_id);
    }

    const { data: complianceData } = await complianceQuery;

    // Calculate compliance summary
    const compliance = {
      green: 0,
      yellow: 0,
      red: 0,
      blocked: 0
    };

    complianceData?.forEach((status: any) => {
      switch (status.current_badge) {
        case 'green': compliance.green++; break;
        case 'yellow': compliance.yellow++; break;
        case 'red': compliance.red++; break;
        case 'blocked': compliance.blocked++; break;
      }
    });

    // Get needs attention (blocked or overdue)
    const needsAttention = complianceData?.filter((s: any) =>
      s.current_badge === 'blocked' || s.current_badge === 'red'
    ).map((s: any) => ({
      user_id: s.user_id,
      user: s.user,
      badge: s.current_badge,
      consecutive_missed: s.consecutive_missed,
      last_check_in_date: s.last_check_in_date
    })) || [];

    // Get overdue check-ins count
    const now = new Date();
    const { data: overdueCheckIns, count: overdueCount } = await (supabase as any)
      .from('okr_check_ins')
      .select('id', { count: 'exact' })
      .eq('is_completed', false)
      .lt('due_date', now.toISOString());

    const summary = {
      total_objectives: objectives?.length || 0,
      average_progress: objectives?.length
        ? Math.round(totalProgress / objectives.length)
        : 0,
      total_team_members: owners.size,
      on_track_count: onTrack,
      at_risk_count: atRisk,
      behind_count: behind,
      blocked_count: blocked,
      overdue_checkins: overdueCount || 0,
      compliance
    };

    const response: any = {
      data: {
        summary,
        needs_attention: needsAttention
      }
    };

    // Include team members if requested
    if (includeMembers) {
      response.data.team_members = complianceData?.map((status: any) => ({
        user_id: status.user_id,
        user: status.user,
        objectives_count: objectives?.filter((o: any) => o.owner?.id === status.user_id).length || 0,
        average_progress: calculateUserProgress(objectives, status.user_id),
        last_check_in_date: status.last_check_in_date,
        badge: status.current_badge,
        is_blocked: status.current_badge === 'blocked'
      })) || [];
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[OKR Team API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper to calculate user's average progress
function calculateUserProgress(objectives: any[], userId: string): number {
  const userObjectives = objectives?.filter((o: any) => o.owner?.id === userId) || [];
  if (userObjectives.length === 0) return 0;

  const totalProgress = userObjectives.reduce((sum: number, obj: any) =>
    sum + (obj.overall_progress || 0), 0
  );

  return Math.round(totalProgress / userObjectives.length);
}
