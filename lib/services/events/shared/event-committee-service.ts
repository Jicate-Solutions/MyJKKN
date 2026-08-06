// lib/services/events/shared/event-committee-service.ts
// Shared organizing-committee + prep-task service for ANY event type (Events Platform Promotion PR3).
// Reads the renamed event_committees / event_tasks tables. Decision #8: committees may include external
// (non-JKKN) members by name/phone, stored in event_committees.external_members ([{name, phone}]).
// Create/update committee go through the (event-agnostic) committees API route with service role.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonCommittee,
  MarathonTask,
  CreateMarathonCommitteeDto,
  CreateMarathonTaskDto,
  ExternalCommitteeMember,
} from '@/types/events-marathon';

const MOD = 'events/committee';
const apiBase = (eventId: string) => `/api/events/marathon/${eventId}/committees`;

export class EventCommitteeService {
  private static supabase = createClientSupabaseClient();

  // --- Committees ----------------------------------------------------------

  static async getCommittees(eventId: string): Promise<MarathonCommittee[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_committees')
        .select(`*, tasks:event_tasks(*)`)
        .eq('event_id', eventId)
        .order('name', { ascending: true });
      if (error) {
        logger.error(MOD, 'Failed to fetch committees', error);
        throw error;
      }
      return (data as unknown as MarathonCommittee[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getCommittees', error);
      throw error;
    }
  }

  static async createCommittee(dto: CreateMarathonCommitteeDto): Promise<MarathonCommittee> {
    try {
      const res = await fetch(apiBase(dto.event_id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
      let result;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Committee create failed (HTTP ${res.status})`);
      }
      if (!res.ok) {
        logger.error(MOD, 'Failed to create committee', result);
        throw new Error(result.error ?? 'Failed to create committee');
      }
      logger.info(MOD, 'Committee created', { eventId: dto.event_id, name: dto.name });
      return result as MarathonCommittee;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createCommittee', error);
      throw error;
    }
  }

  static async updateCommittee(
    id: string,
    dto: Partial<MarathonCommittee>
  ): Promise<MarathonCommittee> {
    try {
      const eventId = (dto as any).event_id;
      if (!eventId) throw new Error('event_id is required for committee update');
      const { tasks: _t, ...cleanPayload } = dto as any;
      const res = await fetch(apiBase(eventId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...cleanPayload }),
      });
      let result;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Committee update failed (HTTP ${res.status})`);
      }
      if (!res.ok) {
        logger.error(MOD, 'Failed to update committee', result);
        throw new Error(result.error ?? 'Failed to update committee');
      }
      return result as MarathonCommittee;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateCommittee', error);
      throw error;
    }
  }

  static async deleteCommittee(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any).from('event_committees').delete().eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to delete committee', { id, error });
        throw error;
      }
      logger.info(MOD, 'Committee deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteCommittee', error);
      throw error;
    }
  }

  // --- Internal (JKKN) members ----------------------------------------------

  /**
   * Add MyJKKN users (picked from the member directory) to a committee.
   * Appends member_names and — when the arrays are index-aligned — member_ids
   * (staff profile_id / learner id), so the RLS membership checks
   * (auth.uid() = ANY(member_ids) OR full_name = ANY(member_names)) both work.
   * Committees with legacy free-text names (ids shorter than names) keep their
   * misaligned ids untouched and rely on the name match.
   */
  static addInternalMembers(
    committee: MarathonCommittee,
    people: { member_id: string; name: string }[]
  ) {
    const names = committee.member_names ?? [];
    const ids = committee.member_ids ?? [];
    const nameSet = new Set(names.map((n) => n.toLowerCase()));
    const idSet = new Set(ids);
    const fresh = people.filter(
      (p) => p.name.trim() && !nameSet.has(p.name.trim().toLowerCase()) && !idSet.has(p.member_id)
    );
    if (fresh.length === 0) return Promise.resolve(committee);

    const payload: Partial<MarathonCommittee> = {
      event_id: committee.event_id,
      member_names: [...names, ...fresh.map((p) => p.name.trim())],
    };
    if (ids.length === names.length) {
      payload.member_ids = [...ids, ...fresh.map((p) => p.member_id)];
    }
    return this.updateCommittee(committee.id, payload);
  }

  /** Remove the internal member at the given index (keeps member_ids aligned when parallel). */
  static removeInternalMember(committee: MarathonCommittee, index: number) {
    const names = (committee.member_names ?? []).filter((_, i) => i !== index);
    const payload: Record<string, unknown> = {
      event_id: committee.event_id,
      member_names: names,
    };
    // member_ids is a parallel array when members were picked from the directory —
    // drop the same slot so the two arrays stay index-aligned.
    const ids = committee.member_ids ?? [];
    if (ids.length === (committee.member_names ?? []).length) {
      payload.member_ids = ids.filter((_, i) => i !== index);
    }
    return this.updateCommittee(committee.id, payload as Partial<MarathonCommittee>);
  }

  // --- External (non-JKKN) members — decision #8 ---------------------------

  /** Add a guest member (name + optional phone) to a committee's external_members list. */
  static addExternalMember(committee: MarathonCommittee, member: ExternalCommitteeMember) {
    const list = [...(committee.external_members ?? []), member];
    return this.updateCommittee(committee.id, {
      event_id: committee.event_id,
      external_members: list,
    } as Partial<MarathonCommittee>);
  }

  /** Remove the external member at the given index. */
  static removeExternalMember(committee: MarathonCommittee, index: number) {
    const list = (committee.external_members ?? []).filter((_, i) => i !== index);
    return this.updateCommittee(committee.id, {
      event_id: committee.event_id,
      external_members: list,
    } as Partial<MarathonCommittee>);
  }

  // --- Tasks ---------------------------------------------------------------

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
        .from('event_tasks')
        .insert([insertPayload])
        .select('*');
      if (error) {
        logger.error(MOD, 'Failed to create task', error);
        throw error;
      }
      const created = Array.isArray(data) ? data[0] : data;
      logger.info(MOD, 'Task created', { committeeId: dto.committee_id, title: dto.title });
      return created as unknown as MarathonTask;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createTask', error);
      throw error;
    }
  }

  static async updateTask(id: string, dto: Partial<MarathonTask>): Promise<MarathonTask> {
    try {
      const updatePayload: Record<string, unknown> = { ...dto };
      if (dto.status === 'completed' && !dto.completed_at) {
        updatePayload.completed_at = new Date().toISOString();
      }
      if (dto.status && dto.status !== 'completed') {
        updatePayload.completed_at = null;
      }
      const { data, error } = await (this.supabase as any)
        .from('event_tasks')
        .update(updatePayload)
        .eq('id', id)
        .select('*');
      if (error) {
        logger.error(MOD, 'Failed to update task', { id, error });
        throw error;
      }
      const updated = Array.isArray(data) ? data[0] : data;
      // An RLS denial on UPDATE is NOT an error — Postgres filters the row, so
      // `error` stays null and `data` comes back []. Without this check the hook
      // fires onSuccess, invalidates, and the checkbox silently snaps back with
      // no toast and nothing in the console. event_tasks only lets a plain
      // committee member update tasks where assigned_to = auth.uid().
      if (!updated) {
        logger.warn(MOD, 'Task update matched no rows (RLS denied or task deleted)', { id });
        throw new Error(
          'You can only update tasks assigned to you. Ask the organizer to assign this task to you.'
        );
      }
      return updated as unknown as MarathonTask;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateTask', error);
      throw error;
    }
  }

  static async deleteTask(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any).from('event_tasks').delete().eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to delete task', { id, error });
        throw error;
      }
      logger.info(MOD, 'Task deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteTask', error);
      throw error;
    }
  }

  // --- Summary -------------------------------------------------------------

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
        .from('event_tasks')
        .select('id, status, due_date, committee_id')
        .eq('event_id', eventId);
      if (tasksError) {
        logger.error(MOD, 'Failed to fetch tasks for summary', tasksError);
        throw tasksError;
      }
      const { data: committees, error: committeesError } = await (this.supabase as any)
        .from('event_committees')
        .select('id, name')
        .eq('event_id', eventId);
      if (committeesError) {
        logger.error(MOD, 'Failed to fetch committees for summary', committeesError);
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

      const committeeMap = new Map<string, string>(committeeRows.map((c) => [c.id, c.name]));
      const byCommitteeMap = new Map<string, { total: number; completed: number }>();
      for (const r of rows) {
        const existing = byCommitteeMap.get(r.committee_id);
        if (existing) {
          existing.total++;
          if (r.status === 'completed') existing.completed++;
        } else {
          byCommitteeMap.set(r.committee_id, { total: 1, completed: r.status === 'completed' ? 1 : 0 });
        }
      }
      const by_committee = Array.from(byCommitteeMap.entries()).map(([committeeId, counts]) => ({
        committee_name: committeeMap.get(committeeId) ?? 'Unknown',
        ...counts,
      }));

      return { total, completed, in_progress, pending, overdue, by_committee };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getTaskSummary', error);
      throw error;
    }
  }
}
