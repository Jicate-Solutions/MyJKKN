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
    try {
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
    } catch (error) {
      logger.error('dashboard/admin', 'System overview failed', error);
      return {
        total_institutions: 0,
        total_users: 0,
        total_students: 0,
        total_staff: 0,
        active_sessions: 0
      };
    }
  }

  /**
   * Get recent system activities (from audit logs or similar)
   */
  static async getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: logs, error } = await supabase
        .from('user_activity_logs')
        .select(`
          id,
          action_type,
          description,
          created_at,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('dashboard/admin', 'Failed to fetch recent activity', error);
        return [];
      }

      return (logs || []).map((log: any) => ({
        id: log.id,
        activity_type: log.action_type,
        description: log.description || 'No description',
        user_name: log.profiles?.full_name || log.profiles?.email || 'Unknown User',
        timestamp: log.created_at
      }));
    } catch (error) {
      logger.error('dashboard/admin', 'Recent activity fetch failed', error);
      return [];
    }
  }

  /**
   * Get at-risk students (low attendance or pending fees)
   */
  static async getAtRiskStudents(limit: number = 10): Promise<AtRiskStudent[]> {
    try {
      const supabase = createClientSupabaseClient();

      // Query students with low attendance
      const { data: students, error } = await supabase
        .from('learners_profiles')
        .select(`
          id,
          first_name,
          last_name,
          roll_number,
          institution:institutions(name),
          section:sections(section_name)
        `)
        .eq('lifecycle_status', 'active')
        .limit(limit);

      if (error) {
        logger.error('dashboard/admin', 'Failed to fetch at-risk students', error);
        return [];
      }

      // For now, return basic data - enhance with attendance/billing data
      return (students || []).map(s => {
        const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
        return {
          id: s.id,
          name: fullName || 'Unknown',
          student_id: s.roll_number || 'N/A',
          attendance_percentage: 65, // TODO: Calculate from attendance data
          pending_fees: 0, // TODO: Calculate from billing data
          institution_name: (s.institution as any)?.name || 'N/A',
          section_name: (s.section as any)?.section_name || 'N/A',
          risk_level: 'medium' as const
        };
      });
    } catch (error) {
      logger.error('dashboard/admin', 'At-risk students fetch failed', error);
      return [];
    }
  }
}
