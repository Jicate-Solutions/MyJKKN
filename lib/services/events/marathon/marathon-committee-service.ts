// lib/services/events/marathon/marathon-committee-service.ts
// Committee and task management service for marathon events.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonCommittee,
  MarathonTask,
  CreateMarathonCommitteeDto,
  CreateMarathonTaskDto,
} from '@/types/events-marathon';

// ============================================================================
// Service
// ============================================================================

export class MarathonCommitteeService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Committees
  // --------------------------------------------------------------------------

  /**
   * List all committees for an event, with their tasks included.
   * Ordered alphabetically by committee name.
   */
  static async getCommittees(eventId: string): Promise<MarathonCommittee[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_committees')
        .select(`
          *,
          tasks:marathon_tasks(*)
        `)
        .eq('event_id', eventId)
        .order('name', { ascending: true });

      if (error) {
        logger.error('events/marathon-committee', 'Failed to fetch committees', error);
        throw error;
      }

      return (data as unknown as MarathonCommittee[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in getCommittees', error);
      throw error;
    }
  }

  /**
   * Create a new committee for an event.
   */
  static async createCommittee(dto: CreateMarathonCommitteeDto): Promise<MarathonCommittee> {
    try {
      const insertPayload = {
        event_id: dto.event_id,
        name: dto.name,
        description: dto.description ?? null,
        lead_id: dto.lead_id ?? null,
        lead_name: dto.lead_name ?? null,
        member_ids: dto.member_ids ?? [],
        member_names: dto.member_names ?? [],
        status: 'active',
      };

      const { data, error } = await (this.supabase as any)
        .from('marathon_committees')
        .insert([insertPayload])
        .select('*');

      if (error) {
        logger.error('events/marathon-committee', 'Failed to create committee', error);
        throw error;
      }

      // Use first row — multiple SELECT policies can cause duplicate rows in RETURNING
      const created = Array.isArray(data) ? data[0] : data;

      if (!created) {
        // INSERT succeeded but RLS blocked the read-back — return a minimal object from the DTO
        logger.warn('events/marathon-committee', 'Committee created but read-back was empty (RLS). Returning DTO fallback.');
        return { ...insertPayload, id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as unknown as MarathonCommittee;
      }

      logger.info('events/marathon-committee', 'Committee created', {
        eventId: dto.event_id,
        name: dto.name,
      });

      return created as unknown as MarathonCommittee;
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in createCommittee', error);
      throw error;
    }
  }

  /**
   * Update committee fields.
   */
  static async updateCommittee(
    id: string,
    dto: Partial<MarathonCommittee>
  ): Promise<MarathonCommittee> {
    try {
      // Strip joined fields before update
      const { tasks: _t, ...updatePayload } = dto as any;

      const { data, error } = await (this.supabase as any)
        .from('marathon_committees')
        .update(updatePayload)
        .eq('id', id)
        .select('*');

      if (error) {
        logger.error('events/marathon-committee', 'Failed to update committee', { id, error });
        throw error;
      }

      // Use first row — multiple SELECT policies can cause duplicate rows in RETURNING
      const updated = Array.isArray(data) ? data[0] : data;

      if (!updated) {
        logger.warn('events/marathon-committee', 'Committee updated but read-back was empty (RLS).');
        return { id, ...updatePayload } as unknown as MarathonCommittee;
      }

      return updated as unknown as MarathonCommittee;
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in updateCommittee', error);
      throw error;
    }
  }

  /**
   * Delete a committee (tasks cascade via DB constraints).
   */
  static async deleteCommittee(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_committees')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-committee', 'Failed to delete committee', { id, error });
        throw error;
      }

      logger.info('events/marathon-committee', 'Committee deleted', { id });
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in deleteCommittee', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Tasks
  // --------------------------------------------------------------------------

  /**
   * Create a new task for a committee.
   */
  static async createTask(dto: CreateMarathonTaskDto): Promise<MarathonTask> {
    try {
      const insertPayload = {
        committee_id: dto.committee_id,
        event_id: dto.event_id,
        title: dto.title,
        description: dto.description ?? null,
        status: 'pending',
        priority: dto.priority ?? 'medium',
        assigned_to: dto.assigned_to ?? null,
        assigned_to_name: dto.assigned_to_name ?? null,
        due_date: dto.due_date ?? null,
        completed_at: null,
      };

      const { data, error } = await (this.supabase as any)
        .from('marathon_tasks')
        .insert([insertPayload])
        .select('*');

      if (error) {
        logger.error('events/marathon-committee', 'Failed to create task', error);
        throw error;
      }

      const created = Array.isArray(data) ? data[0] : data;

      logger.info('events/marathon-committee', 'Task created', {
        committeeId: dto.committee_id,
        title: dto.title,
      });

      return created as unknown as MarathonTask;
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in createTask', error);
      throw error;
    }
  }

  /**
   * Update a task. Auto-sets completed_at when status changes to 'completed'.
   */
  static async updateTask(id: string, dto: Partial<MarathonTask>): Promise<MarathonTask> {
    try {
      const updatePayload: Record<string, unknown> = { ...dto };

      // Auto-set completed_at when marking as completed
      if (dto.status === 'completed' && !dto.completed_at) {
        updatePayload.completed_at = new Date().toISOString();
      }

      // Clear completed_at if reverting from completed
      if (dto.status && dto.status !== 'completed') {
        updatePayload.completed_at = null;
      }

      const { data, error } = await (this.supabase as any)
        .from('marathon_tasks')
        .update(updatePayload)
        .eq('id', id)
        .select('*');

      if (error) {
        logger.error('events/marathon-committee', 'Failed to update task', { id, error });
        throw error;
      }

      const updated = Array.isArray(data) ? data[0] : data;
      return updated as unknown as MarathonTask;
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in updateTask', error);
      throw error;
    }
  }

  /**
   * Delete a task.
   */
  static async deleteTask(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_tasks')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-committee', 'Failed to delete task', { id, error });
        throw error;
      }

      logger.info('events/marathon-committee', 'Task deleted', { id });
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in deleteTask', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------

  /**
   * Aggregated task summary for an event's dashboard.
   */
  static async getTaskSummary(eventId: string): Promise<{
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    overdue: number;
    by_committee: { committee_name: string; total: number; completed: number }[];
  }> {
    try {
      const { data: tasks, error: tasksError } = await (this.supabase as any)
        .from('marathon_tasks')
        .select('id, status, due_date, committee_id')
        .eq('event_id', eventId);

      if (tasksError) {
        logger.error('events/marathon-committee', 'Failed to fetch tasks for summary', tasksError);
        throw tasksError;
      }

      const { data: committees, error: committeesError } = await (this.supabase as any)
        .from('marathon_committees')
        .select('id, name')
        .eq('event_id', eventId);

      if (committeesError) {
        logger.error('events/marathon-committee', 'Failed to fetch committees for summary', committeesError);
        throw committeesError;
      }

      const rows = (tasks ?? []) as {
        id: string;
        status: string;
        due_date: string | null;
        committee_id: string;
      }[];

      const committeeRows = (committees ?? []) as { id: string; name: string }[];

      const today = new Date().toISOString().split('T')[0];

      const total = rows.length;
      const completed = rows.filter((r) => r.status === 'completed').length;
      const in_progress = rows.filter((r) => r.status === 'in_progress').length;
      const pending = rows.filter((r) => r.status === 'pending').length;
      const overdue = rows.filter(
        (r) =>
          r.due_date !== null &&
          r.due_date < today &&
          r.status !== 'completed' &&
          r.status !== 'cancelled'
      ).length;

      // Build per-committee breakdown
      const committeeMap = new Map<string, string>(
        committeeRows.map((c) => [c.id, c.name])
      );

      const byCommitteeMap = new Map<string, { total: number; completed: number }>();
      for (const r of rows) {
        const existing = byCommitteeMap.get(r.committee_id);
        if (existing) {
          existing.total++;
          if (r.status === 'completed') existing.completed++;
        } else {
          byCommitteeMap.set(r.committee_id, {
            total: 1,
            completed: r.status === 'completed' ? 1 : 0,
          });
        }
      }

      const by_committee = Array.from(byCommitteeMap.entries()).map(
        ([committeeId, counts]) => ({
          committee_name: committeeMap.get(committeeId) ?? 'Unknown',
          ...counts,
        })
      );

      return { total, completed, in_progress, pending, overdue, by_committee };
    } catch (error) {
      logger.error('events/marathon-committee', 'Unexpected error in getTaskSummary', error);
      throw error;
    }
  }
}
