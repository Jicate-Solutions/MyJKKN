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

  static async bulkRestoreDeletedDegrees(
    degreeIds: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
    const supabase = createClientSupabaseClient();
    let successCount = 0;
    let failedCount = 0;
    const errors: Record<string, string> = {};

    for (let i = 0; i < degreeIds.length; i++) {
      const degreeId = degreeIds[i];
      try {
        const { error } = await supabase
          .from('degrees')
          .update({ deleted_at: null })
          .eq('id', degreeId);

        if (error) throw error;
        successCount++;
      } catch (err) {
        failedCount++;
        errors[degreeId] = err instanceof Error ? err.message : 'Unknown error';
      }

      // Report progress
      if (onProgress) {
        onProgress(i + 1, degreeIds.length);
      }
    }

    return { success: successCount, failed: failedCount, errors };
  }

  static async bulkLogRestore(
    degreeIds: string[],
    schoolName: string,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const logs = degreeIds.map(degreeId => ({
      action: 'restore',
      school_id: degreeId,
      school_name: schoolName,
      resource_type: 'degree',
      changes: { action: 'bulk_restore' },
      user_id: userId,
    }));

    await supabase.from('school_defaults_audit_logs').insert(logs);
  }
}
