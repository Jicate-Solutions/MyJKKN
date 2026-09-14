// lib/services/events/shared/event-task-service.ts
//
// The event detail console's "Pending Tasks" card, over the SAME event_tasks
// table the Committees board already uses. Two kinds of row live there and the
// difference is load-bearing, not cosmetic:
//
//   committee_id IS NOT NULL — a committee prep-task. Owned by the Committees
//                              board (EventCommitteeService); this service only
//                              READS them, so the card can honestly answer
//                              "what is still outstanding on this event?".
//   committee_id IS NULL     — an event-level task. This service owns those.
//
// Writes go DIRECT through the browser Supabase client rather than through an
// API route, which is a deliberate inversion of the committees service (that one
// posts to /api/events/marathon/[eventId]/committees with a service-role client
// and so bypasses RLS entirely, checking only that a caller is logged in).
//
// Here RLS *is* the feature. event_tasks_event_level_write allows an INSERT or
// UPDATE of a committee_id IS NULL row only for a super admin or the event
// in-charge (fn_can_manage_event_level_tasks). Routing through a service-role
// endpoint would throw that authority away and leave the rule living only in the
// React component — i.e. enforced until someone opens devtools. A denial arrives
// here as a PostgREST error and surfaces as a toast.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { MarathonTask, TaskPriority, TaskStatus } from '@/types/events-marathon';

const MOD = 'events/tasks';

/** Statuses that count as "still outstanding" on the card's pending list. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'blocked'];

/** A task as the card renders it: the row plus the committee's name, when it has one. */
export interface EventTaskRow extends MarathonTask {
  /** null for an event-level task; the owning committee's name otherwise. */
  committee_name: string | null;
}

export interface CreateEventTaskDto {
  event_id: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
}

export interface UpdateEventTaskDto {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  completed_at?: string | null;
}

export class EventTaskService {
  private static supabase = createClientSupabaseClient();

  /**
   * Every task on the event — event-level rows AND every committee's rows.
   *
   * A viewer with no read grant simply gets [] (RLS filters SELECT silently,
   * it does not raise), which is the right outcome: an empty card, not an
   * error panel.
   */
  static async listTasks(eventId: string): Promise<EventTaskRow[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_tasks')
        .select('*, committee:event_committees(name)')
        .eq('event_id', eventId);

      if (error) {
        logger.error(MOD, 'Failed to list event tasks', { eventId, error });
        throw error;
      }

      // Flatten the embed away rather than spreading it through: leaving a
      // `committee` object on the row would give every consumer a second,
      // undeclared path to the same name and let the two drift.
      const rows: EventTaskRow[] = ((data as any[]) ?? []).map(({ committee, ...task }) => ({
        ...(task as MarathonTask),
        committee_name: committee?.name ?? null,
      }));

      return rows.sort(compareTasks);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in listTasks', error);
      throw error;
    }
  }

  /**
   * Add an event-level task. committee_id is left unset on purpose — that NULL
   * is what routes the row through the strict write policy, so never "helpfully"
   * default it to a committee.
   */
  static async createTask(dto: CreateEventTaskDto): Promise<EventTaskRow> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_tasks')
        .insert([
          {
            event_id: dto.event_id,
            committee_id: null,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            status: 'pending' as TaskStatus,
            priority: dto.priority ?? 'medium',
            due_date: dto.due_date || null,
            assigned_to: dto.assigned_to || null,
            assigned_to_name: dto.assigned_to_name?.trim() || null,
          },
        ])
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to create event task', { dto, error });
        throw new Error(rlsMessage(error, 'add tasks to'));
      }

      return { ...(data as MarathonTask), committee_name: null };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createTask', error);
      throw error;
    }
  }

  /**
   * Edit an event-level task. Scoped with `.is('committee_id', null)` so this
   * method can never be pointed at a committee prep-task, even with a valid id
   * — that row belongs to the Committees board and to a different write policy.
   * RLS would refuse it anyway; the filter makes the intent legible and turns a
   * confusing permission error into an honest "no such event-level task".
   */
  static async updateTask(id: string, dto: UpdateEventTaskDto): Promise<EventTaskRow> {
    try {
      const patch: Record<string, unknown> = { ...dto };

      // completed_at is derived from status, never set by the caller: a task
      // flipped back to pending must lose its completion stamp, or the card
      // shows "done 3 days ago" next to an open task.
      if (dto.status !== undefined) {
        patch.completed_at = dto.status === 'completed' ? new Date().toISOString() : null;
      }

      const { data, error } = await (this.supabase as any)
        .from('event_tasks')
        .update(patch)
        .eq('id', id)
        .is('committee_id', null)
        .select('*')
        .single();

      if (error) {
        logger.error(MOD, 'Failed to update event task', { id, dto, error });
        throw new Error(rlsMessage(error, 'edit tasks on'));
      }
      // Defensive: .single() already raises PGRST116 on an RLS-filtered UPDATE
      // (0 rows), which rlsMessage translates. This catches the same 0-row case
      // if the query ever loses .single().
      if (!data) throw new Error(rlsMessage({ code: 'PGRST116' }, 'edit tasks on'));

      return { ...(data as MarathonTask), committee_name: null };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateTask', error);
      throw error;
    }
  }

  /**
   * Delete an event-level task. Same committee_id guard as updateTask.
   *
   * `.select('id')` is NOT decoration. A DELETE that RLS refuses does not
   * raise — the USING clause simply filters the row out and PostgREST reports
   * success having removed nothing. Without reading the deleted rows back, a
   * viewer with no write grant would see "Task removed", watch the row
   * reappear on the next refetch, and file a bug. Asking for the rows turns
   * that silent no-op into an honest permission error.
   */
  static async deleteTask(id: string): Promise<void> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_tasks')
        .delete()
        .eq('id', id)
        .is('committee_id', null)
        .select('id');

      if (error) {
        logger.error(MOD, 'Failed to delete event task', { id, error });
        throw new Error(rlsMessage(error, 'remove tasks from'));
      }
      if (!((data as unknown[]) ?? []).length) {
        logger.error(MOD, 'Delete removed no rows (RLS or missing id)', { id });
        throw new Error(rlsMessage({ code: 'PGRST116' }, 'remove tasks from'));
      }
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteTask', error);
      throw error;
    }
  }
}

/** high > medium is the useful reading order; 'critical' outranks everything. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/**
 * Soonest real deadline first, then priority, then oldest-created.
 *
 * Sorted in memory rather than in SQL because priority is free text in the
 * column, so ORDER BY priority would sort it alphabetically — 'critical',
 * 'high', 'low', 'medium' — which puts the least urgent task second.
 * Undated tasks sink below dated ones instead of leading with an empty column.
 *
 * Exported for tests — the ordering with no Supabase around it.
 */
export function compareTasks(a: EventTaskRow, b: EventTaskRow): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  const byPriority = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
  if (byPriority !== 0) return byPriority;
  return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1;
}

/**
 * A blocked RLS write comes back as PostgREST 42501 ("new row violates
 * row-level security policy") on INSERT, and as PGRST116 ("0 rows") on an
 * UPDATE or DELETE whose USING clause filtered the row away. Neither tells a
 * coordinator anything. Translate both to the actual rule; leave every other
 * error alone so real failures stay diagnosable.
 */
function rlsMessage(error: { code?: string; message?: string }, verb: string): string {
  if (
    error?.code === '42501' ||
    error?.code === 'PGRST116' ||
    /row-level security/i.test(error?.message ?? '')
  ) {
    return `Only a super admin or this event's in-charge can ${verb} it.`;
  }
  return error?.message ?? 'The task could not be saved.';
}
