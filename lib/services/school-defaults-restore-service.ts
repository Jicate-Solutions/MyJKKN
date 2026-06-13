import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsAuditService } from './school-defaults-audit-service';

async function getDeletedRecords(
  supabase: ReturnType<typeof createClientSupabaseClient>,
  resourceType: 'degree' | 'department'
): Promise<Array<{ id: string; school_id: string; school_name: string; entity_type: string; name: string; code: string; deleted_at: string }>> {
  const tableName = resourceType === 'degree' ? 'degrees' : 'departments';
  const nameField = resourceType === 'degree' ? 'degree_name' : 'department_name';
  const codeField = resourceType === 'degree' ? 'degree_code' : 'department_code';

  const { data, error } = await supabase
    .from(tableName)
    .select(`
      id,
      school_id:institutions!inner(id, name, entity_type),
      ${nameField},
      ${codeField},
      deleted_at
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    id: item.id,
    school_id: item.school_id.id,
    school_name: item.school_id.name,
    entity_type: item.school_id.entity_type,
    name: item[nameField],
    code: item[codeField],
    deleted_at: item.deleted_at,
  }));
}

export class SchoolDefaultsRestoreService {
  static async restoreDeletedDegree(degreeId: string): Promise<void> {
    const supabase = createClientSupabaseClient();

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
    return this.bulkRestoreDeletedRecords(degreeIds, 'degree', onProgress);
  }

  static async bulkLogRestore(
    degreeIds: string[],
    schoolName: string,
    userId: string
  ): Promise<void> {
    return this.bulkLogRestoreByType(degreeIds, 'degree', schoolName, userId);
  }

  static async bulkRestoreDeletedRecords(
    recordIds: string[],
    resourceType: 'degree' | 'department',
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
    const supabase = createClientSupabaseClient();
    const tableName = resourceType === 'degree' ? 'degrees' : 'departments';
    let successCount = 0;
    let failedCount = 0;
    const errors: Record<string, string> = {};

    for (let i = 0; i < recordIds.length; i++) {
      const recordId = recordIds[i];
      try {
        const { error } = await supabase
          .from(tableName)
          .update({ deleted_at: null })
          .eq('id', recordId);

        if (error) throw error;
        successCount++;
      } catch (err) {
        failedCount++;
        errors[recordId] = err instanceof Error ? err.message : 'Unknown error';
      }

      if (onProgress) {
        onProgress(i + 1, recordIds.length);
      }
    }

    return { success: successCount, failed: failedCount, errors };
  }

  static async bulkRestoreDeletedRecordsBatched(
    recordIds: string[],
    resourceType: 'degree' | 'department',
    batchSize: number = 100,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: Record<string, string> }> {
    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors: Record<string, string> = {};

    for (let i = 0; i < recordIds.length; i += batchSize) {
      const batch = recordIds.slice(i, i + batchSize);
      const results = await this.bulkRestoreDeletedRecords(
        batch,
        resourceType,
        (current, total) => {
          const overallCurrent = i + current;
          onProgress?.(overallCurrent, recordIds.length);
        }
      );

      totalSuccess += results.success;
      totalFailed += results.failed;
      Object.assign(allErrors, results.errors);
    }

    return { success: totalSuccess, failed: totalFailed, errors: allErrors };
  }

  static async bulkLogRestoreByType(
    recordIds: string[],
    resourceType: 'degree' | 'department',
    schoolName: string,
    userId: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const logs = recordIds.map(recordId => ({
      action: 'restore',
      school_id: undefined,
      school_name: schoolName,
      resource_type: resourceType,
      changes: { action: 'bulk_restore', resource_type: resourceType },
      user_id: userId,
    }));

    await supabase.from('school_defaults_audit_logs').insert(logs);
  }

  static async scheduleRestore(
    recordIds: string[],
    resourceType: 'degree' | 'department',
    scheduledFor: Date,
    userId: string
  ): Promise<string> {
    const { ScheduledRestoreQueue } = await import('./scheduled-restore-queue');
    return ScheduledRestoreQueue.scheduleRestore(recordIds, resourceType, scheduledFor, userId);
  }

  static async getDeletedRecordsPaginated(
    resourceType: 'degree' | 'department',
    page: number = 0,
    pageSize: number = 100
  ): Promise<{ records: any[]; total: number; hasMore: boolean }> {
    const supabase = createClientSupabaseClient();
    const tableName = resourceType === 'degree' ? 'degrees' : 'departments';
    const nameField = resourceType === 'degree' ? 'degree_name' : 'department_name';
    const codeField = resourceType === 'degree' ? 'degree_code' : 'department_code';

    // Get total count
    const { count } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })
      .not('deleted_at', 'is', null);

    // Get paginated records
    const { data } = await supabase
      .from(tableName)
      .select(`
        id,
        school_id:institutions!inner(id, name, entity_type),
        ${nameField},
        ${codeField},
        deleted_at
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    return {
      records: (data || []).map((item: any) => ({
        id: item.id,
        school_id: item.school_id.id,
        school_name: item.school_id.name,
        entity_type: item.school_id.entity_type,
        name: item[nameField],
        code: item[codeField],
      })),
      total: count || 0,
      hasMore: (page + 1) * pageSize < (count || 0),
    };
  }
}
