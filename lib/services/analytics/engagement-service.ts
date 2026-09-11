import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPolicyInt } from '@/lib/policies/get-policy-client';
import type {
  EngagementMetrics,
  StudentEngagement,
  AtRiskStudent,
  SectionComparison,
  StudentEngagementDetail,
  AccessScope,
  OrganizationalLevel,
  EngagementMetricsRequest,
  StudentEngagementRequest,
  AtRiskRequest,
  SectionComparisonRequest,
  SessionHistory,
  UserSession
} from '@/types/analytics';
import {
  ALL_INSTITUTIONS_ID,
  INVALID_SELECTION_REASON,
  accessAllowed,
  accessRefused,
  applyEngagementScope,
  isUuid,
  levelOpenToScope,
  placementInScope,
  scopeHasUnits,
  scopeRefusalReason,
  type EngagementAccess,
  type EngagementPlacement,
  type EngagementScopeChoices
} from '@/lib/services/analytics/engagement-scope';

/**
 * Runtime read of the student-row fetch cap used by EngagementService.
 *
 * Backs 3 call sites that previously hardcoded `const STUDENT_QUERY_LIMIT = 10000`
 * / `AT_RISK_QUERY_LIMIT = 10000`:
 *   - getEngagementMetrics()
 *   - getStudentEngagement()
 *   - getAtRiskStudents()
 *
 * Tweakable via super_admin policy UI — no deploy needed (Director's standing
 * rule: "Every policy decision = config-table row + super_admin UI").
 *
 * NOTE: SECTION_COMPARISON_LIMIT (line ~543) is a DIFFERENT semantic value
 * (section-row cap, not student-row cap) and is NOT covered by this key. It
 * will be migrated in a follow-up PR with its own seeded policy key.
 *
 * The `as any` cast is intentional pending keys.ts consolidation (follow-up).
 */
async function getStudentQueryLimit(): Promise<number> {
  return getPolicyInt('analytics.engagement.query_limit' as any, 10000);
}

/**
 * Service for handling engagement analytics queries and business logic
 */
export class EngagementService {
  /**
   * Get user's access scope based on their role and permissions
   */
  static async getUserAccessScope(userId: string): Promise<AccessScope> {
    const supabase = await createServiceRoleClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id, department_id')
      .eq('id', userId)
      .single();

    if (!profile) {
      return { type: 'section', sectionIds: [] };
    }

    // Super admin has global access
    if (profile.is_super_admin) {
      return { type: 'global' };
    }

    // Principal has institution-level access
    if (profile.role === 'principal' && profile.institution_id) {
      return {
        type: 'institution',
        institutionIds: [profile.institution_id]
      };
    }

    // HOD has department-level access
    if (profile.role === 'hod' && profile.department_id) {
      return {
        type: 'department',
        departmentIds: [profile.department_id]
      };
    }

    // Faculty has section-level access (get sections they teach)
    if (profile.role === 'faculty') {
      const { data: staffRecord } = await supabase
        .from('staff')
        .select('id')
        .eq('profile_id', userId)
        .single();

      if (staffRecord) {
        // Get sections this faculty teaches
        const { data: timetableSlots } = await supabase
          .from('timetable_slots')
          .select('section_id')
          .eq('staff_id', staffRecord.id);

        const sectionIds = [
          ...new Set(
            timetableSlots?.map((slot) => slot.section_id).filter(Boolean) || []
          )
        ];

        return { type: 'section', sectionIds };
      }
    }

    // Default: no access
    return { type: 'section', sectionIds: [] };
  }

  /**
   * The gate for one selection: may this viewer see engagement for this unit?
   * Resolves the viewer's scope, then checks the unit against it. Rules and the
   * reason this is done in code are in engagement-scope.ts.
   */
  static async checkAccess(
    userId: string,
    level: OrganizationalLevel,
    id: string
  ): Promise<EngagementAccess> {
    const scope = await this.getUserAccessScope(userId);
    return this.checkScopeAccess(scope, level, id);
  }

  /**
   * The gate for one selection against a known scope.
   *
   * "All institutions" (level institution, id "all") is allowed for a super
   * admin, and for a principal only because every query then adds their own
   * institution as a filter; it is refused for everyone else. Any other id is
   * placed in the organisation (which institution and department it belongs
   * to) and checked against the scope. An unknown unit is refused like an
   * out-of-scope one.
   */
  static async checkScopeAccess(
    scope: AccessScope,
    level: OrganizationalLevel,
    id: string
  ): Promise<EngagementAccess> {
    const refuse = () => accessRefused(scope, 403, scopeRefusalReason(scope));

    if (level === 'institution' && id === ALL_INSTITUTIONS_ID) {
      if (scope.type === 'global') return accessAllowed(scope);
      if (scope.type === 'institution' && scopeHasUnits(scope)) {
        return accessAllowed(scope);
      }
      return refuse();
    }

    if (!isUuid(id)) {
      return accessRefused(scope, 400, INVALID_SELECTION_REASON);
    }

    if (scope.type === 'global') return accessAllowed(scope);
    if (!scopeHasUnits(scope) || !levelOpenToScope(scope.type, level)) return refuse();

    const placement = await this.resolvePlacement(level, id);
    if (!placement || !placementInScope(scope, placement)) return refuse();

    return accessAllowed(scope);
  }

  /**
   * The gate for one learner's detail view: refuses before any of the learner's
   * sessions are read. 404 when the learner has no engagement score today (the
   * detail view needs one), 403 when their score sits outside the scope.
   */
  static async checkStudentAccess(
    userId: string,
    studentId: string
  ): Promise<EngagementAccess> {
    const scope = await this.getUserAccessScope(userId);

    if (!isUuid(studentId)) {
      return accessRefused(scope, 400, INVALID_SELECTION_REASON);
    }
    if (!scopeHasUnits(scope)) {
      return accessRefused(scope, 403, scopeRefusalReason(scope));
    }

    const supabase = await createServiceRoleClient();
    const { data: row, error } = await supabase
      .from('student_engagement_scores')
      .select('institution_id, department_id, section_id')
      .eq('user_id', studentId)
      .eq('calculation_date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    if (error || !row) {
      return accessRefused(scope, 404, 'No engagement record was found for this learner today.');
    }

    const placement: EngagementPlacement = {
      institutionId: row.institution_id ?? null,
      departmentId: row.department_id ?? null,
      sectionId: row.section_id ?? null
    };
    if (!placementInScope(scope, placement)) {
      return accessRefused(scope, 403, scopeRefusalReason(scope));
    }
    return accessAllowed(scope);
  }

  /**
   * Which institution and department a unit belongs to. The institution level
   * needs no lookup. Reads only the unit's own org columns (organisation
   * structure, no learner data) and nothing leaves the server.
   */
  private static async resolvePlacement(
    level: OrganizationalLevel,
    id: string
  ): Promise<EngagementPlacement | null> {
    if (level === 'institution') {
      return { institutionId: id, departmentId: null, sectionId: null };
    }

    const table =
      level === 'department'
        ? 'departments'
        : level === 'program'
          ? 'programs'
          : level === 'semester'
            ? 'semesters'
            : 'sections';
    const columns =
      level === 'department' ? 'id, institution_id' : 'id, institution_id, department_id';

    const supabase = await createServiceRoleClient();
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as unknown as {
      id: string;
      institution_id?: string | null;
      department_id?: string | null;
    };
    return {
      institutionId: row.institution_id ?? null,
      departmentId: level === 'department' ? row.id : (row.department_id ?? null),
      sectionId: level === 'section' ? row.id : null
    };
  }

  /**
   * The filter choices the screen may offer this viewer (see
   * EngagementScopeChoices). Only the viewer's own units are returned, as ids;
   * the screen loads their names itself.
   */
  static async getScopeChoices(userId: string): Promise<EngagementScopeChoices> {
    const scope = await this.getUserAccessScope(userId);
    const none: EngagementScopeChoices = {
      type: scope.type,
      institutionIds: null,
      departmentIds: null,
      programIds: null,
      semesterIds: null,
      sectionIds: null
    };

    if (scope.type === 'global') return none;
    if (scope.type === 'institution') {
      return { ...none, institutionIds: scope.institutionIds ?? [] };
    }

    const supabase = await createServiceRoleClient();
    const distinct = (values: Array<string | null | undefined>) =>
      [...new Set(values.filter((v): v is string => !!v))];

    if (scope.type === 'department') {
      const departmentIds = scope.departmentIds ?? [];
      const { data } = departmentIds.length
        ? await supabase.from('departments').select('id, institution_id').in('id', departmentIds)
        : { data: [] as Array<{ id: string; institution_id: string | null }> };
      const rows = (data ?? []) as Array<{ id: string; institution_id: string | null }>;
      return {
        ...none,
        institutionIds: distinct(rows.map((r) => r.institution_id)),
        departmentIds: distinct(rows.map((r) => r.id))
      };
    }

    const sectionIds = scope.sectionIds ?? [];
    const { data } = sectionIds.length
      ? await supabase
          .from('sections')
          .select('id, institution_id, department_id, program_id, semester_id')
          .in('id', sectionIds)
      : { data: [] as Array<Record<string, string | null>> };
    const rows = (data ?? []) as Array<{
      id: string;
      institution_id: string | null;
      department_id: string | null;
      program_id: string | null;
      semester_id: string | null;
    }>;
    return {
      ...none,
      institutionIds: distinct(rows.map((r) => r.institution_id)),
      departmentIds: distinct(rows.map((r) => r.department_id)),
      programIds: distinct(rows.map((r) => r.program_id)),
      semesterIds: distinct(rows.map((r) => r.semester_id)),
      sectionIds: distinct(rows.map((r) => r.id))
    };
  }

  /**
   * Get engagement metrics for a specific organizational level
   */
  static async getMetrics(
    request: EngagementMetricsRequest,
    userId: string
  ): Promise<EngagementMetrics | null> {
    try {
      const supabase = await createServiceRoleClient();

      // Gate: refuse a selection outside the viewer's scope before reading rows.
      const access = await this.checkAccess(userId, request.level, request.id);
      if (!access.allowed) {
        return null;
      }
      const scope = access.scope;

      const dateFrom = request.dateFrom
        ? new Date(request.dateFrom)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = request.dateTo ? new Date(request.dateTo) : new Date();

      // Build query based on organizational level. The scope filter is always
      // added, so "all institutions" for a principal is their own institution.
      let query = applyEngagementScope(
        supabase
          .from('daily_engagement_metrics')
          .select('*')
          .gte('metric_date', dateFrom.toISOString().split('T')[0])
          .lte('metric_date', dateTo.toISOString().split('T')[0]),
        scope
      );

      // Apply level filter - skip for "all" institutions
      switch (request.level) {
        case 'institution':
          // If "all", don't filter by institution - get all data
          if (request.id !== 'all') {
            query = query.eq('institution_id', request.id);
          }
          break;
        case 'department':
          query = query.eq('department_id', request.id);
          break;
        case 'program':
          query = query.eq('program_id', request.id);
          break;
        case 'semester':
          query = query.eq('semester_id', request.id);
          break;
        case 'section':
          query = query.eq('section_id', request.id);
          break;
      }

      const { data: metrics, error } = await query;

      if (error || !metrics) {
        console.error('[EngagementService] Error fetching metrics:', error);
        return null;
      }

      // Calculate aggregated metrics
      const total_logins = metrics.reduce((sum, m) => sum + m.total_logins, 0);
      const unique_users = Math.max(
        ...metrics.map((m) => m.unique_users),
        0
      );
      const avg_session_duration_minutes =
        metrics.reduce(
          (sum, m) => sum + (m.avg_session_duration_minutes || 0),
          0
        ) / metrics.length || 0;
      const total_active_time_hours = metrics.reduce(
        (sum, m) => sum + (m.total_active_time_hours || 0),
        0
      );
      const avg_modules_per_user =
        metrics.reduce((sum, m) => sum + (m.avg_modules_per_user || 0), 0) /
          metrics.length || 0;

      // Calculate 7-day and 30-day active users
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const active_students_7d = metrics
        .filter((m) => m.metric_date >= sevenDaysAgo)
        .reduce((sum, m) => sum + m.unique_users, 0);

      const active_students_30d = metrics
        .filter((m) => m.metric_date >= thirtyDaysAgo)
        .reduce((sum, m) => sum + m.unique_users, 0);

      // Calculate average logins
      const metrics7d = metrics.filter((m) => m.metric_date >= sevenDaysAgo);
      const metrics30d = metrics.filter((m) => m.metric_date >= thirtyDaysAgo);

      const avg_logins_7d =
        metrics7d.reduce((sum, m) => sum + m.total_logins, 0) /
          (metrics7d.length || 1);
      const avg_logins_30d =
        metrics30d.reduce((sum, m) => sum + m.total_logins, 0) /
          (metrics30d.length || 1);

      // Query student_engagement_scores for actual engagement level counts and students list
      // NOTE: Supabase default limit is 1000 rows. We set explicit limit to handle large institutions.
      // For institutions with >10,000 students, consider implementing pagination.
      // Runtime read from platform_policies → 'analytics.engagement.query_limit' (default 10000).
      const STUDENT_QUERY_LIMIT = await getStudentQueryLimit();

      let studentsQuery = applyEngagementScope(
        supabase
          .from('student_engagement_scores')
          .select(`
          *,
          profiles!inner(full_name, email),
          sections!inner(section_name),
          programs(program_name),
          departments(department_name)
        `, { count: 'exact' }) // Get total count to detect if we hit the limit
          .eq('calculation_date', new Date().toISOString().split('T')[0]), // Today's scores
        scope
      );

      // Apply level-specific filter - skip for "all" institutions
      switch (request.level) {
        case 'institution':
          // If "all", don't filter by institution - get all students
          if (request.id !== 'all') {
            studentsQuery = studentsQuery.eq('institution_id', request.id);
          }
          break;
        case 'department':
          studentsQuery = studentsQuery.eq('department_id', request.id);
          break;
        case 'program':
          studentsQuery = studentsQuery.eq('program_id', request.id);
          break;
        case 'semester':
          studentsQuery = studentsQuery.eq('semester_id', request.id);
          break;
        case 'section':
          studentsQuery = studentsQuery.eq('section_id', request.id);
          break;
      }

      const { data: studentScores, error: studentsError, count: totalStudentCount } =
        await studentsQuery
          .order('percentile_rank', { ascending: false })
          .limit(STUDENT_QUERY_LIMIT);

      // Log warning if we're hitting the limit (indicates data truncation)
      if (totalStudentCount && totalStudentCount >= STUDENT_QUERY_LIMIT) {
        console.warn(
          `[EngagementService] Query limit reached: ${STUDENT_QUERY_LIMIT} students. ` +
          `Total students: ${totalStudentCount}. Consider implementing pagination for this scope.`
        );
      }

      if (studentsError) {
        console.error(
          '[EngagementService] Error fetching student scores:',
          studentsError
        );
      }

      // Calculate engagement level counts from actual data
      const high_engagement_count =
        studentScores?.filter((s) => s.engagement_level === 'high').length || 0;
      const medium_engagement_count =
        studentScores?.filter((s) => s.engagement_level === 'medium').length || 0;
      const low_engagement_count =
        studentScores?.filter((s) => s.engagement_level === 'low').length || 0;
      const at_risk_count =
        studentScores?.filter((s) => s.engagement_level === 'at_risk').length || 0;

      // Map to student engagement format for table display
      const students =
        studentScores?.map((score: any) => ({
          // Spread all properties from StudentEngagementScore
          id: score.id,
          user_id: score.user_id,
          calculation_date: score.calculation_date,
          institution_id: score.institution_id,
          department_id: score.department_id,
          program_id: score.program_id,
          semester_id: score.semester_id,
          section_id: score.section_id,
          logins_last_7_days: score.logins_last_7_days,
          logins_last_30_days: score.logins_last_30_days,
          avg_session_duration_minutes: score.avg_session_duration_minutes,
          total_time_spent_hours: score.total_time_spent_hours,
          modules_accessed_count: score.modules_accessed_count,
          unique_modules_accessed: score.unique_modules_accessed,
          last_login_at: score.last_login_at,
          days_since_last_login: score.days_since_last_login,
          section_avg_logins_7d: score.section_avg_logins_7d,
          section_avg_duration: score.section_avg_duration,
          percentile_rank: score.percentile_rank,
          engagement_level: score.engagement_level,
          is_at_risk: score.is_at_risk,
          risk_factors: score.risk_factors,
          created_at: score.created_at,
          updated_at: score.updated_at,
          // Add display fields from StudentEngagement
          name: score.profiles?.full_name || 'Unknown',
          student_id: score.profiles?.email?.split('@')[0] || 'N/A',
          email: score.profiles?.email,
          section_name: score.sections?.section_name,
          program_name: score.programs?.program_name,
          department_name: score.departments?.department_name
        })) || [];

      // Build trend data (group by date)
      const trendMap = new Map<
        string,
        { total_logins: number; unique_users: number }
      >();
      metrics.forEach((m) => {
        const existing = trendMap.get(m.metric_date) || {
          total_logins: 0,
          unique_users: 0
        };
        trendMap.set(m.metric_date, {
          total_logins: existing.total_logins + m.total_logins,
          unique_users: Math.max(existing.unique_users, m.unique_users)
        });
      });

      const trends = Array.from(trendMap.entries())
        .map(([date, data]) => ({
          date,
          total_logins: data.total_logins,
          unique_users: data.unique_users
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Return flat structure matching EngagementMetrics interface
      return {
        total_logins,
        unique_users,
        active_students_7d,
        active_students_30d,
        avg_session_duration_minutes,
        avg_logins_7d,
        avg_logins_30d,
        total_active_time_hours,
        avg_modules_per_user,
        high_engagement_count,
        medium_engagement_count,
        low_engagement_count,
        at_risk_count,
        trends,
        students // Now populated with actual student data
      };
    } catch (error) {
      console.error('[EngagementService] Unexpected error in getMetrics:', error);
      return null;
    }
  }

  /**
   * Get student engagement data for a section
   */
  static async getStudentEngagement(
    request: StudentEngagementRequest,
    userId: string
  ): Promise<StudentEngagement[]> {
    try {
      const supabase = await createServiceRoleClient();

      // Gate: refuse a section outside the viewer's scope before reading rows.
      const access = await this.checkAccess(userId, 'section', request.sectionId);
      if (!access.allowed) {
        return [];
      }

      // NOTE: Supabase default limit is 1000. Set explicit limit for large sections.
      // Runtime read from platform_policies → 'analytics.engagement.query_limit' (default 10000).
      const STUDENT_QUERY_LIMIT = await getStudentQueryLimit();

      const { data: scores, error, count } = await applyEngagementScope(
        supabase
          .from('student_engagement_scores')
          .select(
            `
          *,
          profiles!inner(full_name, email),
          sections!inner(section_name),
          programs(program_name),
          departments(department_name)
        `,
            { count: 'exact' }
          ),
        access.scope
      )
        .eq('section_id', request.sectionId)
        .eq('calculation_date', new Date().toISOString().split('T')[0])
        .order('percentile_rank', { ascending: false })
        .limit(STUDENT_QUERY_LIMIT);

      // Log warning if hitting limit
      if (count && count >= STUDENT_QUERY_LIMIT) {
        console.warn(
          `[EngagementService] Section query limit reached: ${STUDENT_QUERY_LIMIT} students. ` +
          `Total students in section: ${count}. Consider pagination.`
        );
      }

      if (error || !scores) {
        console.error(
          '[EngagementService] Error fetching student engagement:',
          error
        );
        return [];
      }

      return scores.map((score: any) => ({
        ...score,
        student_name: score.profiles?.full_name || 'Unknown',
        student_id: score.profiles?.email?.split('@')[0] || 'N/A',
        student_email: score.profiles?.email,
        section_name: score.sections?.section_name,
        program_name: score.programs?.program_name,
        department_name: score.departments?.department_name
      }));
    } catch (error) {
      console.error(
        '[EngagementService] Unexpected error in getStudentEngagement:',
        error
      );
      return [];
    }
  }

  /**
   * Get at-risk students for a specific organizational level
   */
  static async getAtRiskStudents(
    request: AtRiskRequest,
    userId: string
  ): Promise<AtRiskStudent[]> {
    try {
      const supabase = await createServiceRoleClient();

      // Gate: refuse a selection outside the viewer's scope before reading rows.
      const access = await this.checkAccess(userId, request.level, request.id);
      if (!access.allowed) {
        return [];
      }

      // NOTE: Supabase default limit is 1000. Set explicit limit for at-risk students.
      // Runtime read from platform_policies → 'analytics.engagement.query_limit' (default 10000).
      // Same semantic as STUDENT_QUERY_LIMIT — student-row fetch cap.
      const AT_RISK_QUERY_LIMIT = await getStudentQueryLimit();

      // The scope filter is always added, so "all institutions" for a principal
      // is their own institution.
      let query = applyEngagementScope(
        supabase
          .from('student_engagement_scores')
          .select(
            `
          *,
          profiles!inner(full_name, email, phone_number),
          sections!inner(section_name),
          programs(program_name),
          departments(department_name)
        `,
            { count: 'exact' }
          )
          .eq('is_at_risk', true)
          .eq('calculation_date', new Date().toISOString().split('T')[0]),
        access.scope
      );

      // Apply level filter - skip for "all" institutions
      switch (request.level) {
        case 'institution':
          // If "all", don't filter by institution
          if (request.id !== 'all') {
            query = query.eq('institution_id', request.id);
          }
          break;
        case 'department':
          query = query.eq('department_id', request.id);
          break;
        case 'program':
          query = query.eq('program_id', request.id);
          break;
        case 'semester':
          query = query.eq('semester_id', request.id);
          break;
        case 'section':
          query = query.eq('section_id', request.id);
          break;
      }

      const { data: students, error, count } = await query
        .order('percentile_rank', { ascending: true })
        .limit(AT_RISK_QUERY_LIMIT);

      // Log warning if hitting limit
      if (count && count >= AT_RISK_QUERY_LIMIT) {
        console.warn(
          `[EngagementService] At-risk query limit reached: ${AT_RISK_QUERY_LIMIT} students. ` +
          `Total at-risk students: ${count}. Immediate action required for large institutions.`
        );
      }

      if (error || !students) {
        console.error(
          '[EngagementService] Error fetching at-risk students:',
          error
        );
        return [];
      }

      return students.map((student: any) => ({
        ...student,
        student_name: student.profiles?.full_name || 'Unknown',
        student_id: student.profiles?.email?.split('@')[0] || 'N/A',
        student_email: student.profiles?.email,
        contact_email: student.profiles?.email,
        contact_phone: student.profiles?.phone_number,
        section_name: student.sections?.section_name,
        program_name: student.programs?.program_name,
        department_name: student.departments?.department_name
      }));
    } catch (error) {
      console.error(
        '[EngagementService] Unexpected error in getAtRiskStudents:',
        error
      );
      return [];
    }
  }

  /**
   * Get section comparison for a semester
   */
  static async getSectionComparison(
    request: SectionComparisonRequest,
    userId: string
  ): Promise<SectionComparison[]> {
    try {
      const supabase = await createServiceRoleClient();

      // Gate: refuse a semester outside the viewer's scope before reading rows.
      const access = await this.checkAccess(userId, 'semester', request.semesterId);
      if (!access.allowed) {
        return [];
      }

      // NOTE: Limit for section comparison. Most semesters have < 100 sections.
      // TODO(policy-as-config): Migrate to platform_policies under a separate
      // key (e.g. 'analytics.engagement.section_comparison_limit') in a
      // follow-up PR. Different semantic from STUDENT_QUERY_LIMIT — this caps
      // section rows, not student rows. Needs its own seeded policy value.
      const SECTION_COMPARISON_LIMIT = 500;

      // mv_engagement_overview is a materialized view: row-level security never
      // applies to it, so the scope filter here is the only thing narrowing it.
      const { data: overview, error, count } = await applyEngagementScope(
        supabase
          .from('mv_engagement_overview')
          .select(
            `
          *,
          sections!inner(section_name)
        `,
            { count: 'exact' }
          ),
        access.scope
      )
        .eq('semester_id', request.semesterId)
        .not('section_id', 'is', null)
        .limit(SECTION_COMPARISON_LIMIT);

      // Log warning if hitting limit
      if (count && count >= SECTION_COMPARISON_LIMIT) {
        console.warn(
          `[EngagementService] Section comparison limit reached: ${SECTION_COMPARISON_LIMIT} sections. ` +
          `Total sections in semester: ${count}.`
        );
      }

      if (error || !overview) {
        console.error(
          '[EngagementService] Error fetching section comparison:',
          error
        );
        return [];
      }

      return overview.map((section: any) => {
        const activePercentage =
          section.total_students > 0
            ? (section.active_last_7d / section.total_students) * 100
            : 0;

        const atRiskPercentage =
          section.total_students > 0
            ? (section.at_risk_count / section.total_students) * 100
            : 0;

        // Calculate engagement score (0-100)
        const engagementScore = Math.min(
          100,
          Math.max(
            0,
            activePercentage * 0.4 +
              (100 - atRiskPercentage) * 0.3 +
              (section.avg_logins_7d || 0) * 5 +
              ((section.avg_session_duration || 0) / 60) * 10
          )
        );

        return {
          section_id: section.section_id,
          section_name: section.sections?.section_name || 'Unknown',
          total_students: section.total_students,
          active_last_7d: section.active_last_7d,
          active_percentage: Math.round(activePercentage * 10) / 10,
          at_risk_count: section.at_risk_count,
          at_risk_percentage: Math.round(atRiskPercentage * 10) / 10,
          avg_logins_7d: section.avg_logins_7d || 0,
          avg_session_duration: section.avg_session_duration || 0,
          engagement_score: Math.round(engagementScore * 10) / 10
        };
      });
    } catch (error) {
      console.error(
        '[EngagementService] Unexpected error in getSectionComparison:',
        error
      );
      return [];
    }
  }

  /**
   * Get detailed engagement information for a specific student
   */
  static async getStudentDetail(
    studentId: string,
    userId: string
  ): Promise<StudentEngagementDetail | null> {
    try {
      const supabase = await createServiceRoleClient();
      const accessScope = await this.getUserAccessScope(userId);

      if (!scopeHasUnits(accessScope)) {
        return null;
      }

      // Get student's current engagement score, only if it sits in the scope
      const { data: score, error: scoreError } = await applyEngagementScope(
        supabase
          .from('student_engagement_scores')
          .select(
            `
          *,
          profiles!inner(full_name, email),
          sections(section_name),
          programs(program_name)
        `
          ),
        accessScope
      )
        .eq('user_id', studentId)
        .eq('calculation_date', new Date().toISOString().split('T')[0])
        .single();

      if (scoreError || !score) {
        console.error('[EngagementService] Error fetching student score:', scoreError);
        return null;
      }

      // Check the row itself too, before any session history is read. (The old
      // check skipped learners with no section and let an institution- or
      // department-scoped viewer through for anyone.)
      if (
        !placementInScope(accessScope, {
          institutionId: score.institution_id ?? null,
          departmentId: score.department_id ?? null,
          sectionId: score.section_id ?? null
        })
      ) {
        return null;
      }

      // Get session history (last 30 days)
      const { data: sessions, error: sessionsError } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', studentId)
        .gte(
          'login_at',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        )
        .order('login_at', { ascending: false })
        .limit(50);

      if (sessionsError) {
        console.error('[EngagementService] Error fetching sessions:', sessionsError);
      }

      const sessionHistory: SessionHistory = {
        sessions: (sessions || []) as UserSession[],
        totalSessions: sessions?.length || 0,
        avgDurationMinutes:
          sessions && sessions.length > 0
            ? sessions.reduce(
                (sum, s) => sum + (s.duration_seconds || 0) / 60,
                0
              ) / sessions.length
            : 0,
        mostUsedDevice:
          this.getMostFrequent(
            sessions?.map((s) => s.device_type).filter(Boolean) || []
          ) || 'desktop',
        uniqueModules: [
          ...new Set(sessions?.flatMap((s) => s.modules_accessed || []) || [])
        ]
      };

      // Build module usage statistics
      const moduleUsageMap = new Map<
        string,
        { count: number; lastAccessed: string }
      >();

      sessions?.forEach((session) => {
        session.modules_accessed?.forEach((module) => {
          const existing = moduleUsageMap.get(module) || {
            count: 0,
            lastAccessed: session.login_at
          };
          moduleUsageMap.set(module, {
            count: existing.count + 1,
            lastAccessed:
              session.login_at > existing.lastAccessed
                ? session.login_at
                : existing.lastAccessed
          });
        });
      });

      const moduleUsage = Array.from(moduleUsageMap.entries())
        .map(([moduleName, data]) => ({
          moduleName,
          accessCount: data.count,
          lastAccessedAt: data.lastAccessed
        }))
        .sort((a, b) => b.accessCount - a.accessCount);

      // Build trend data (daily logins and duration for last 30 days)
      const trendData = this.buildTrendData(sessions || []);

      return {
        student: {
          id: studentId,
          name: score.profiles?.full_name || 'Unknown',
          email: score.profiles?.email,
          student_id: score.profiles?.email?.split('@')[0] || 'N/A',
          section_name: score.sections?.section_name,
          program_name: score.programs?.program_name
        },
        currentScore: score,
        sessionHistory,
        moduleUsage,
        trendData
      };
    } catch (error) {
      console.error(
        '[EngagementService] Unexpected error in getStudentDetail:',
        error
      );
      return null;
    }
  }

  /**
   * Helper: Get most frequent item from array
   */
  private static getMostFrequent<T>(arr: T[]): T | null {
    if (arr.length === 0) return null;

    const frequency = new Map<T, number>();
    arr.forEach((item) => {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    });

    let maxCount = 0;
    let mostFrequent: T | null = null;
    frequency.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = item;
      }
    });

    return mostFrequent;
  }

  /**
   * Helper: Build trend data from sessions
   */
  private static buildTrendData(
    sessions: UserSession[]
  ): { date: string; logins: number; duration: number }[] {
    const trendMap = new Map<
      string,
      { logins: number; totalDuration: number }
    >();

    sessions.forEach((session) => {
      const date = session.login_at.split('T')[0];
      const existing = trendMap.get(date) || { logins: 0, totalDuration: 0 };
      trendMap.set(date, {
        logins: existing.logins + 1,
        totalDuration: existing.totalDuration + (session.duration_seconds || 0)
      });
    });

    return Array.from(trendMap.entries())
      .map(([date, data]) => ({
        date,
        logins: data.logins,
        duration: Math.round((data.totalDuration / data.logins / 60) * 10) / 10 // avg duration in minutes
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
