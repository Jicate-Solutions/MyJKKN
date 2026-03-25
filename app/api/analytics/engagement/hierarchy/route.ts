import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/analytics/engagement/hierarchy
 * Get hierarchical breakdown of engagement metrics
 *
 * Query params:
 * - level: 'all' | 'institution' | 'department' | 'program' | 'semester' | 'section'
 * - parent_id: UUID of parent entity (optional, filters results)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Allow access for analytics roles
    const allowedRoles = [
      'principal',
      'hod',
      'faculty',
      'admin',
      'counselor',
      'accounts'
    ];

    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level') || 'all';
    const parentId = searchParams.get('parent_id');

    // Special "all" values that mean "no filter"
    const ALL_VALUES = ['all', 'all_departments', 'all_programs', 'all_semesters', 'all_sections'];
    const shouldFilter = parentId && !ALL_VALUES.includes(parentId);

    // Use service role client for elevated permissions
    const serviceSupabase = createServiceRoleClient();

    let hierarchyData: any[] = [];

    switch (level) {
      case 'all':
      case 'institution':
        // Get institution-level breakdown
        const { data: institutions } = await serviceSupabase
          .from('student_engagement_scores')
          .select(
            `
            institution_id,
            engagement_level,
            institutions!inner(name)
          `
          )
          .eq('calculation_date', new Date().toISOString().split('T')[0]);

        hierarchyData = aggregateByEntity(
          institutions || [],
          'institution_id',
          'institutions'
        );
        break;

      case 'department':
        // Get department-level breakdown
        let deptQuery = serviceSupabase
          .from('student_engagement_scores')
          .select(
            `
            department_id,
            engagement_level,
            departments!inner(name, institution_id)
          `
          )
          .eq('calculation_date', new Date().toISOString().split('T')[0])
          .not('department_id', 'is', null);

        if (shouldFilter) {
          deptQuery = deptQuery.eq('institution_id', parentId);
        }

        const { data: departments } = await deptQuery;
        hierarchyData = aggregateByEntity(
          departments || [],
          'department_id',
          'departments'
        );
        break;

      case 'program':
        // Get program-level breakdown
        let progQuery = serviceSupabase
          .from('student_engagement_scores')
          .select(
            `
            program_id,
            engagement_level,
            programs!inner(program_name, department_id)
          `
          )
          .eq('calculation_date', new Date().toISOString().split('T')[0])
          .not('program_id', 'is', null);

        if (shouldFilter) {
          progQuery = progQuery.eq('department_id', parentId);
        }

        const { data: programs } = await progQuery;
        hierarchyData = aggregateByEntity(programs || [], 'program_id', 'programs', 'program_name');
        break;

      case 'semester':
        // Get semester-level breakdown
        let semQuery = serviceSupabase
          .from('student_engagement_scores')
          .select(
            `
            semester_id,
            engagement_level,
            semesters!inner(semester_name, program_id)
          `
          )
          .eq('calculation_date', new Date().toISOString().split('T')[0])
          .not('semester_id', 'is', null);

        if (shouldFilter) {
          semQuery = semQuery.eq('program_id', parentId);
        }

        const { data: semesters } = await semQuery;
        hierarchyData = aggregateByEntity(
          semesters || [],
          'semester_id',
          'semesters',
          'semester_name'
        );
        break;

      case 'section':
        // Get section-level breakdown
        let secQuery = serviceSupabase
          .from('student_engagement_scores')
          .select(
            `
            section_id,
            engagement_level,
            sections!inner(section_name, semester_id)
          `
          )
          .eq('calculation_date', new Date().toISOString().split('T')[0])
          .not('section_id', 'is', null);

        if (shouldFilter) {
          secQuery = secQuery.eq('semester_id', parentId);
        }

        const { data: sections } = await secQuery;
        hierarchyData = aggregateByEntity(
          sections || [],
          'section_id',
          'sections',
          'section_name'
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid level parameter' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      level,
      parent_id: parentId,
      data: hierarchyData
    });
  } catch (error) {
    console.error('[Analytics API] Error in hierarchy endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to aggregate engagement data by entity
 */
function aggregateByEntity(
  data: any[],
  idKey: string,
  entityKey: string,
  nameKey: string = 'name'
): any[] {
  const grouped = data.reduce((acc, row) => {
    const id = row[idKey];
    const entityData = row[entityKey];
    const name = entityData ? entityData[nameKey] : 'Unknown';

    if (!acc[id]) {
      acc[id] = {
        id,
        name,
        total_students: 0,
        high_engagement: 0,
        medium_engagement: 0,
        low_engagement: 0,
        at_risk: 0
      };
    }

    acc[id].total_students++;

    switch (row.engagement_level) {
      case 'high':
        acc[id].high_engagement++;
        break;
      case 'medium':
        acc[id].medium_engagement++;
        break;
      case 'low':
        acc[id].low_engagement++;
        break;
      case 'at_risk':
        acc[id].at_risk++;
        break;
    }

    return acc;
  }, {} as Record<string, any>);

  // Convert to array and calculate percentages
  return Object.values(grouped).map((item: any) => ({
    ...item,
    active_percentage:
      item.total_students > 0
        ? ((item.high_engagement + item.medium_engagement) / item.total_students) * 100
        : 0
  }));
}
