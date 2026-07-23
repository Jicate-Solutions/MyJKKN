import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete';
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
}

export class SchoolDefaultsAuditService {
  static async logAction(
    action: 'create' | 'update' | 'delete',
    schoolId: string,
    schoolName: string,
    resourceType: 'degree' | 'department',
    changes: Record<string, any>,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    await supabase.from('school_defaults_audit_logs').insert({
      action,
      school_id: schoolId,
      school_name: schoolName,
      resource_type: resourceType,
      changes,
      user_id: userId,
    });
  }

  static async getSchoolAuditLog(schoolId: string): Promise<AuditLog[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('school_defaults_audit_logs')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
