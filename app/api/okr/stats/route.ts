// app/api/okr/stats/route.ts
// Internal API for OKR Dashboard Statistics (session-based auth)

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
    const scope = url.searchParams.get('scope') || 'personal'; // personal, team, institution
    const institutionId = url.searchParams.get('institution_id');
    const departmentId = url.searchParams.get('department_id');

    // Base query filters
    const filters: Record<string, any> = {};

    if (scope === 'personal') {
      filters.owner_id = user.id;
    } else if (scope === 'team' && profile?.department_id) {
      filters.department_id = departmentId || profile.department_id;
    } else if (scope === 'institution' && profile?.institution_id) {
      filters.institution_id = institutionId || profile.institution_id;
    }

    // Get objectives statistics
    let objectivesQuery = (supabase as any)
      .from('okr_objectives')
      .select('id, status, overall_progress, tier', { count: 'exact' });

    if (filters.owner_id) {
      objectivesQuery = objectivesQuery.eq('owner_id', filters.owner_id);
    }
    if (filters.department_id) {
      objectivesQuery = objectivesQuery.eq('department_id', filters.department_id);
    }
    if (filters.institution_id) {
      objectivesQuery = objectivesQuery.eq('institution_id', filters.institution_id);
    }

    const { data: objectives, count: totalObjectives } = await objectivesQuery;

    // Calculate objective stats
    const objectiveStats = {
      total: totalObjectives || 0,
      active: 0,
      completed: 0,
      draft: 0,
      archived: 0,
      avg_progress: 0,
      by_tier: { 1: 0, 2: 0, 3: 0 }
    };

    let totalProgress = 0;
    let activeCount = 0;

    objectives?.forEach((obj: any) => {
      switch (obj.status) {
        case 'active':
          objectiveStats.active++;
          totalProgress += obj.overall_progress || 0;
          activeCount++;
          break;
        case 'completed': objectiveStats.completed++; break;
        case 'draft': objectiveStats.draft++; break;
        case 'archived': objectiveStats.archived++; break;
      }

      if (obj.tier >= 1 && obj.tier <= 3) {
        objectiveStats.by_tier[obj.tier as 1 | 2 | 3]++;
      }
    });

    objectiveStats.avg_progress = activeCount > 0
      ? Math.round(totalProgress / activeCount)
      : 0;

    // Get key results statistics
    const krQuery = (supabase as any)
      .from('okr_key_results')
      .select('status, data_source, progress_percentage, objective:okr_objectives!objective_id(owner_id, department_id, institution_id)');

    const { data: keyResults } = await krQuery;

    // Filter KRs based on scope
    const filteredKRs = keyResults?.filter((kr: any) => {
      if (filters.owner_id) return kr.objective?.owner_id === filters.owner_id;
      if (filters.department_id) return kr.objective?.department_id === filters.department_id;
      if (filters.institution_id) return kr.objective?.institution_id === filters.institution_id;
      return true;
    }) || [];

    const krStats = {
      total: filteredKRs.length,
      on_track: 0,
      at_risk: 0,
      behind: 0,
      blocked: 0,
      completed: 0,
      not_started: 0,
      auto_tracked: 0,
      manual: 0
    };

    filteredKRs.forEach((kr: any) => {
      switch (kr.status) {
        case 'on_track': krStats.on_track++; break;
        case 'at_risk': krStats.at_risk++; break;
        case 'behind': krStats.behind++; break;
        case 'blocked': krStats.blocked++; break;
        case 'completed': krStats.completed++; break;
        case 'not_started': krStats.not_started++; break;
      }

      if (kr.data_source === 'auto') {
        krStats.auto_tracked++;
      } else {
        krStats.manual++;
      }
    });

    // Get check-in statistics (last 4 weeks)
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

    let checkInsQuery = (supabase as any)
      .from('okr_check_ins')
      .select('is_completed, is_overdue')
      .gte('created_at', fourWeeksAgo);

    if (scope === 'personal') {
      checkInsQuery = checkInsQuery.eq('user_id', user.id);
    }

    const { data: checkIns } = await checkInsQuery;

    const checkInStats = {
      total: checkIns?.length || 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      completion_rate: 0
    };

    checkIns?.forEach((ci: any) => {
      if (ci.is_completed) {
        checkInStats.completed++;
      } else {
        checkInStats.pending++;
      }
      if (ci.is_overdue) {
        checkInStats.overdue++;
      }
    });

    checkInStats.completion_rate = checkInStats.total > 0
      ? Math.round((checkInStats.completed / checkInStats.total) * 100)
      : 0;

    // Get compliance summary for team/institution scope
    let complianceStats = null;
    if (scope !== 'personal') {
      const complianceQuery = (supabase as any)
        .from('okr_user_status')
        .select('current_badge');

      const { data: complianceData } = await complianceQuery;

      complianceStats = {
        green: 0,
        yellow: 0,
        red: 0,
        blocked: 0
      };

      complianceData?.forEach((s: any) => {
        switch (s.current_badge) {
          case 'green': complianceStats!.green++; break;
          case 'yellow': complianceStats!.yellow++; break;
          case 'red': complianceStats!.red++; break;
          case 'blocked': complianceStats!.blocked++; break;
        }
      });
    }

    // Build response
    const stats = {
      scope,
      objectives: objectiveStats,
      key_results: krStats,
      check_ins: checkInStats,
      compliance: complianceStats,
      generated_at: new Date().toISOString()
    };

    return NextResponse.json({ data: stats });

  } catch (error) {
    console.error('[OKR Stats API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
