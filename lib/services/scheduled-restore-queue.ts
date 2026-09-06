import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ScheduledRestore {
  id: string;
  record_ids: string[];
  resource_type: 'degree' | 'department';
  scheduled_for: string;
  status: 'pending' | 'completed' | 'failed';
  created_by: string;
  executed_at?: string;
  error?: string;
}

export class ScheduledRestoreQueue {
  private static processingRef = new Map<string, boolean>();

  static async scheduleRestore(
    recordIds: string[],
    resourceType: 'degree' | 'department',
    scheduledFor: Date,
    userId: string
  ): Promise<string> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('scheduled_restores')
      .insert({
        record_ids: recordIds,
        resource_type: resourceType,
        scheduled_for: scheduledFor.toISOString(),
        status: 'pending',
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  static async getPendingRestores(): Promise<ScheduledRestore[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('scheduled_restores')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async executeScheduledRestore(restoreId: string): Promise<void> {
    if (this.processingRef.get(restoreId)) return;

    this.processingRef.set(restoreId, true);

    try {
      const supabase = createClientSupabaseClient();

      const { data: restore, error: fetchError } = await supabase
        .from('scheduled_restores')
        .select('*')
        .eq('id', restoreId)
        .single();

      if (fetchError) throw fetchError;

      // Dynamic import to avoid circular dependency
      const { SchoolDefaultsRestoreService } = await import('./school-defaults-restore-service');

      // Execute the restore
      await SchoolDefaultsRestoreService.bulkRestoreDeletedRecordsBatched(
        restore.record_ids,
        restore.resource_type,
        100
      );

      // Update status to completed
      const { error: updateError } = await supabase
        .from('scheduled_restores')
        .update({
          status: 'completed',
          executed_at: new Date().toISOString(),
        })
        .eq('id', restoreId);

      if (updateError) throw updateError;
    } catch (err) {
      const supabase = createClientSupabaseClient();
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      await supabase
        .from('scheduled_restores')
        .update({
          status: 'failed',
          error: errorMsg,
        })
        .eq('id', restoreId);

      throw err;
    } finally {
      this.processingRef.delete(restoreId);
    }
  }

  static async processQueue(): Promise<void> {
    try {
      const pending = await this.getPendingRestores();

      for (const restore of pending) {
        await this.executeScheduledRestore(restore.id);
      }
    } catch (err) {
      console.error('Error processing scheduled restore queue:', err);
    }
  }

  static startQueueProcessor(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.processQueue();
    }, intervalMs);
  }
}
