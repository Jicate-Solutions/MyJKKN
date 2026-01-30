import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface SystemOverview {
  total_institutions: number;
  total_users: number;
  total_students: number;
  total_staff: number;
  active_sessions: number;
}

export interface RecentActivity {
  id: string;
  activity_type: string;
  description: string;
  user_name: string;
  timestamp: string;
  metadata?: any;
}

export interface AtRiskStudent {
  id: string;
  name: string;
  student_id: string;
  attendance_percentage: number;
  pending_fees: number;
  institution_name: string;
  section_name: string;
  risk_level: 'high' | 'medium' | 'low';
}

export class AdminDashboardService {
  /**
   * Get system overview statistics
   */
  static async getSystemOverview(): Promise<SystemOverview> {
    const supabase = createClientSupabaseClient();

    // Get counts from various tables
    const [institutions, users, students, staff] = await Promise.all([
      supabase.from('institutions').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('learners_profiles').select('id', { count: 'exact', head: true }).eq('lifecycle_status', 'active'),
      supabase.from('staff').select('id', { count: 'exact', head: true })
    ]);

    if (institutions.error) logger.error('dashboard/admin', 'Failed to fetch institutions count', institutions.error);
    if (users.error) logger.error('dashboard/admin', 'Failed to fetch users count', users.error);
    if (students.error) logger.error('dashboard/admin', 'Failed to fetch students count', students.error);
    if (staff.error) logger.error('dashboard/admin', 'Failed to fetch staff count', staff.error);

    return {
      total_institutions: institutions.count || 0,
      total_users: users.count || 0,
      total_students: students.count || 0,
      total_staff: staff.count || 0,
      active_sessions: 0 // TODO: Implement session tracking
    };
  }

  /**
   * Get recent system activities (from audit logs or similar)
   */
  static async getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
    const supabase = createClientSupabaseClient();

    // For now, return mock data - in production, query audit_logs table
    logger.warn('dashboard/admin', 'Using mock data for recent activity');

    return [
      {
        id: '1',
        activity_type: 'user_login',
        description: 'User logged in',
        user_name: 'Admin User',
        timestamp: new Date().toISOString()
      }
    ];
  }

  /**
   * Get at-risk students (low attendance or pending fees)
   */
  static async getAtRiskStudents(limit: number = 10): Promise<AtRiskStudent[]> {
    const supabase = createClientSupabaseClient();

    // Query students with low attendance
    const { data: students, error } = await supabase
      .from('learners_profiles')
      .select(`
        id,
        full_name,
        student_id,
        institution:institutions(name),
        section:sections(name)
      `)
      .eq('lifecycle_status', 'active')
      .limit(limit);

    if (error) {
      logger.error('dashboard/admin', 'Failed to fetch at-risk students', error);
      return [];
    }

    // For now, return basic data - enhance with attendance/billing data
    return (students || []).map(s => ({
      id: s.id,
      name: s.full_name,
      student_id: s.student_id || 'N/A',
      attendance_percentage: 65, // TODO: Calculate from attendance data
      pending_fees: 0, // TODO: Calculate from billing data
      institution_name: (s.institution as any)?.name || 'N/A',
      section_name: (s.section as any)?.name || 'N/A',
      risk_level: 'medium' as const
    }));
  }
}
