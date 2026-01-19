import { createServiceRoleClient } from '@/lib/supabase/server';
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
   * Get engagement metrics for a specific organizational level
   */
  static async getMetrics(
    request: EngagementMetricsRequest,
    userId: string
  ): Promise<EngagementMetrics | null> {
    try {
      const supabase = await createServiceRoleClient();
      const accessScope = await this.getUserAccessScope(userId);

      // Special handling for "all" institution - skip access check for global view
      const isAllInstitutions = request.level === 'institution' && request.id === 'all';

      // Verify user has access to this level/entity (skip for "all" if user has global/institution access)
      if (!isAllInstitutions && !this.hasAccess(accessScope, request.level, request.id)) {
        return null;
      }

      // For "all" institutions, user needs at least global or institution access
      if (isAllInstitutions && accessScope.type !== 'global' && accessScope.type !== 'institution') {
        return null;
      }

      const dateFrom = request.dateFrom
        ? new Date(request.dateFrom)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dateTo = request.dateTo ? new Date(request.dateTo) : new Date();

      // Build query based on organizational level
      let query = supabase
        .from('daily_engagement_metrics')
        .select('*')
        .gte('metric_date', dateFrom.toISOString().split('T')[0])
        .lte('metric_date', dateTo.toISOString().split('T')[0]);

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
      let studentsQuery = supabase
        .from('student_engagement_scores')
        .select(`
          *,
          profiles!inner(full_name, email),
          sections!inner(section_name),
          programs(program_name),
          departments(department_name)
        `)
        .eq('calculation_date', new Date().toISOString().split('T')[0]); // Today's scores

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

      const { data: studentScores, error: studentsError } =
        await studentsQuery.order('percentile_rank', { ascending: false });

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
      const accessScope = await this.getUserAccessScope(userId);

      // Verify access
      if (!this.hasAccess(accessScope, 'section', request.sectionId)) {
        return [];
      }

      const { data: scores, error } = await supabase
        .from('student_engagement_scores')
        .select(
          `
          *,
          profiles!inner(full_name, email),
          sections!inner(section_name),
          programs(program_name),
          departments(department_name)
        `
        )
        .eq('section_id', request.sectionId)
        .eq('calculation_date', new Date().toISOString().split('T')[0])
        .order('percentile_rank', { ascending: false });

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
      const accessScope = await this.getUserAccessScope(userId);

      // Special handling for "all" institution
      const isAllInstitutions = request.level === 'institution' && request.id === 'all';

      // Verify access (skip for "all" if user has global/institution access)
      if (!isAllInstitutions && !this.hasAccess(accessScope, request.level, request.id)) {
        return [];
      }

      // For "all" institutions, user needs at least global or institution access
      if (isAllInstitutions && accessScope.type !== 'global' && accessScope.type !== 'institution') {
        return [];
      }

      let query = supabase
        .from('student_engagement_scores')
        .select(
          `
          *,
          profiles!inner(full_name, email, phone_number),
          sections!inner(section_name),
          programs(program_name),
          departments(department_name)
        `
        )
        .eq('is_at_risk', true)
        .eq('calculation_date', new Date().toISOString().split('T')[0]);

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

      const { data: students, error } = await query.order('percentile_rank', {
        ascending: true
      });

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
      const accessScope = await this.getUserAccessScope(userId);

      // Verify access to semester
      if (!this.hasAccess(accessScope, 'semester', request.semesterId)) {
        return [];
      }

      const { data: overview, error } = await supabase
        .from('mv_engagement_overview')
        .select(
          `
          *,
          sections!inner(section_name)
        `
        )
        .eq('semester_id', request.semesterId)
        .not('section_id', 'is', null);

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

      // Get student's current engagement score
      const { data: score, error: scoreError } = await supabase
        .from('student_engagement_scores')
        .select(
          `
          *,
          profiles!inner(full_name, email),
          sections(section_name),
          programs(program_name)
        `
        )
        .eq('user_id', studentId)
        .eq('calculation_date', new Date().toISOString().split('T')[0])
        .single();

      if (scoreError || !score) {
        console.error('[EngagementService] Error fetching student score:', scoreError);
        return null;
      }

      // Verify access to this student's section
      if (
        score.section_id &&
        !this.hasAccess(accessScope, 'section', score.section_id)
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
   * Helper: Check if user has access to a specific entity
   */
  private static hasAccess(
    accessScope: AccessScope,
    level: OrganizationalLevel,
    entityId: string
  ): boolean {
    if (accessScope.type === 'global') {
      return true;
    }

    if (accessScope.type === 'institution') {
      // Institution access allows viewing all sub-levels
      return true;
    }

    if (accessScope.type === 'department') {
      // Department access allows viewing programs, semesters, sections
      if (level === 'department') {
        return accessScope.departmentIds?.includes(entityId) || false;
      }
      // For sub-levels, we'd need to verify the hierarchy (simplified here)
      return true;
    }

    if (accessScope.type === 'section') {
      if (level === 'section') {
        return accessScope.sectionIds?.includes(entityId) || false;
      }
      return false;
    }

    return false;
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
