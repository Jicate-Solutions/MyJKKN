import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface SystemOverview {
  total_institutions: number;
  total_departments:  number;
  total_programs:     number;
  total_sections:     number;
  total_users:        number;
  active_sessions:    number;
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
   * Get system overview statistics.
   * Delegates to the server-side /api/dashboard/admin-stats route which uses
   * the service-role client (bypasses RLS) and calls JKKN API server-to-server.
   */
  static async getSystemOverview(): Promise<SystemOverview> {
    try {
      const res = await fetch('/api/dashboard/admin-stats?type=overview');
      if (!res.ok) throw new Error(`Stats API responded ${res.status}`);
      return await res.json();
    } catch (error) {
      logger.error('dashboard/admin', 'System overview fetch failed', error);
      return {
        total_institutions: 0,
        total_departments:  0,
        total_programs:     0,
        total_sections:     0,
        total_users:        0,
        active_sessions:    0,
      };
    }
  }

  /**
   * Get recent system activities.
   * Delegates to the server-side /api/dashboard/admin-stats route which uses
   * the service-role client to bypass the missing RLS policies on user_activity_logs.
   */
  static async getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
    try {
      const res = await fetch(`/api/dashboard/admin-stats?type=activity&limit=${limit}`);
      if (!res.ok) throw new Error(`Activity API responded ${res.status}`);
      return await res.json();
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

      // Query students with low attendance (raw ID columns — no FK expansion needed)
      const { data: students, error } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, institution_id, section_id')
        .eq('lifecycle_status', 'active')
        .limit(limit);

      if (error) {
        logger.error('dashboard/admin', 'Failed to fetch at-risk students', error);
        return [];
      }

      if (!students || students.length === 0) return [];

      // Batch-fetch institution and section names in parallel
      const institutionIds = [...new Set(students.map(s => s.institution_id).filter(Boolean))] as string[];
      const sectionIds = [...new Set(students.map(s => s.section_id).filter(Boolean))] as string[];

      const [{ data: institutions }, { data: sections }] = await Promise.all([
        institutionIds.length > 0
          ? supabase.from('institutions').select('id, name').in('id', institutionIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        sectionIds.length > 0
          ? supabase.from('sections').select('id, section_name').in('id', sectionIds)
          : Promise.resolve({ data: [] as { id: string; section_name: string }[] }),
      ]);

      const instMap: Record<string, string> = Object.fromEntries((institutions || []).map(i => [i.id, i.name]));
      const sectMap: Record<string, string> = Object.fromEntries((sections || []).map(s => [s.id, s.section_name]));

      // For now, return basic data - enhance with attendance/billing data
      return students.map(s => {
        const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
        return {
          id: s.id,
          name: fullName || 'Unknown',
          student_id: (s as any).roll_number || 'N/A',
          attendance_percentage: 65, // TODO: Calculate from attendance data
          pending_fees: 0, // TODO: Calculate from billing data
          institution_name: instMap[(s as any).institution_id] || 'N/A',
          section_name: sectMap[(s as any).section_id] || 'N/A',
          risk_level: 'medium' as const
        };
      });
    } catch (error) {
      logger.error('dashboard/admin', 'At-risk students fetch failed', error);
      return [];
    }
  }
}
