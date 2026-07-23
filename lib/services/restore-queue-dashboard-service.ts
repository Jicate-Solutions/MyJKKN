import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface QueueItemDisplay {
  id: string;
  recordCount: number;
  resourceType: 'degree' | 'department';
  scheduledFor: string;
  status: 'pending' | 'completed' | 'failed';
  createdBy: string;
  createdAt: string;
  ageMinutes: number;
  executedAt?: string;
  error?: string;
}

export interface QueueStatus {
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  nextExecutionAt?: string;
}

export class RestoreQueueDashboardService {
  static async getQueueStatus(): Promise<QueueStatus> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('scheduled_restores')
      .select('status, scheduled_for');

    if (error) throw error;

    const rows = data || [];
    const pendingRows = rows.filter((r) => r.status === 'pending');
    const completedCount = rows.filter((r) => r.status === 'completed').length;
    const failedCount = rows.filter((r) => r.status === 'failed').length;

    // Find the earliest scheduled_for among pending items
    let nextExecutionAt: string | undefined;
    if (pendingRows.length > 0) {
      const sorted = pendingRows
        .map((r) => r.scheduled_for)
        .filter(Boolean)
        .sort();
      nextExecutionAt = sorted[0] ?? undefined;
    }

    return {
      pendingCount: pendingRows.length,
      completedCount,
      failedCount,
      nextExecutionAt,
    };
  }

  static async getQueueItems(
    page: number = 0,
    pageSize: number = 20
  ): Promise<{ items: QueueItemDisplay[]; total: number }> {
    const supabase = createClientSupabaseClient();

    // Get total count
    const { count } = await supabase
      .from('scheduled_restores')
      .select('id', { count: 'exact', head: true });

    // Get paginated rows
    const { data, error } = await supabase
      .from('scheduled_restores')
      .select(
        'id, record_ids, resource_type, scheduled_for, status, created_by, created_at, executed_at, error'
      )
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    const rows = data || [];

    // Collect unique created_by UUIDs and fetch their profile emails in one query
    const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
    const emailMap: Record<string, string> = {};

    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', creatorIds);

      (profiles || []).forEach((p: { id: string; email: string }) => {
        emailMap[p.id] = p.email;
      });
    }

    const now = Date.now();

    const items: QueueItemDisplay[] = rows.map((row) => {
      const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : now;
      const ageMinutes = Math.floor((now - createdAtMs) / 60000);

      return {
        id: row.id,
        recordCount: Array.isArray(row.record_ids) ? row.record_ids.length : 0,
        resourceType: row.resource_type as 'degree' | 'department',
        scheduledFor: row.scheduled_for,
        status: row.status as 'pending' | 'completed' | 'failed',
        createdBy: emailMap[row.created_by] ?? row.created_by ?? 'Unknown',
        createdAt: row.created_at,
        ageMinutes,
        executedAt: row.executed_at ?? undefined,
        error: row.error ?? undefined,
      };
    });

    return {
      items,
      total: count ?? 0,
    };
  }
}
