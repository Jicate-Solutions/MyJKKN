import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsAuditService } from './school-defaults-audit-service';

export class SchoolDefaultsRestoreService {
  static async restoreDeletedDegree(degreeId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Clear deleted_at to restore
    const { error } = await supabase
      .from('degrees')
      .update({ deleted_at: null })
      .eq('id', degreeId);

    if (error) throw error;
  }

  static async logRestore(
    degreeId: string,
    schoolName: string,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    // Log restore action as audit
    await supabase.from('school_defaults_audit_logs').insert({
      action: 'restore',
      school_id: degreeId,
      school_name: schoolName,
      resource_type: 'degree',
      changes: { action: 'restore' },
      user_id: userId,
    });
  }
}
