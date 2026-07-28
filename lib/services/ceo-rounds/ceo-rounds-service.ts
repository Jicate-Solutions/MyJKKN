/**
 * CEO Rounds Log — service layer (browser client).
 * ============================================================================
 *
 * A daily teaching-enterprise "round": theme + decision, participation-GRADED
 * attendance, action tasks (optionally linked to an Improvement Board idea), and
 * a rotating-Associate-written summary a facilitator approves.
 *
 * Write model:
 *  - rounds / attendance / tasks: RLS-gated direct writes (ceo_rounds.log).
 *  - summary: NEVER a direct table write. The assigned Associate's ONLY path is
 *    fn_ceo_round_write_summary (column-safe); approval is fn_ceo_round_approve_
 *    summary (facilitator gate). Both are SECURITY DEFINER.
 *
 * The ceo_rounds_* tables are live in prod but not yet in the generated
 * types/supabase.ts, so queries cast through (supabase as any) — the same pattern
 * the improvement + bug-reports services use for un-typed tables.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ceo-rounds/log';

export type CeoRoundStatus = 'open' | 'closed';
export type CeoRoundSummaryStatus = 'pending' | 'submitted' | 'approved';
export type CeoRoundParticipation = 'absent' | 'present' | 'contributed' | 'led';

/** Weight each participation grade contributes to a participant's score. */
export const PARTICIPATION_WEIGHT: Record<CeoRoundParticipation, number> = {
  absent: 0,
  present: 1,
  contributed: 2,
  led: 3
};

export interface CeoRound {
  id: string;
  institution_id: string;
  round_date: string;
  theme: string;
  decision: string | null;
  status: CeoRoundStatus;
  facilitator_id: string | null;
  host_id: string | null;
  summary: string | null;
  summary_author_id: string | null;
  summary_status: CeoRoundSummaryStatus;
  summary_submitted_at: string | null;
  summary_approved_by: string | null;
  summary_approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CeoRoundAttendance {
  id: string;
  round_id: string;
  participant_id: string;
  participation: CeoRoundParticipation;
  note: string | null;
  graded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CeoRoundTask {
  id: string;
  round_id: string;
  action_text: string;
  owner_profile_id: string | null;
  owner_label: string | null;
  due_date: string | null;
  status: 'open' | 'done';
  linked_idea_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CeoRoundEnriched extends CeoRound {
  facilitator_name: string | null;
  summary_author_name: string | null;
  attendee_count: number;
  participation_total: number;
}

export interface CeoRoundAttendanceEnriched extends CeoRoundAttendance {
  participant_name: string | null;
}

export interface CeoRoundTaskEnriched extends CeoRoundTask {
  owner_name: string | null;
  linked_idea_title: string | null;
}

export interface CeoRoundDetail {
  round: CeoRoundEnriched;
  attendance: CeoRoundAttendanceEnriched[];
  tasks: CeoRoundTaskEnriched[];
}

export interface CreateCeoRoundPayload {
  round_date: string;
  theme: string;
  decision?: string | null;
  facilitator_id?: string | null;
  host_id?: string | null;
  summary_author_id?: string | null;
  attendee_ids?: string[];
}

type ProfileLite = { id: string; full_name: string | null };

export class CeoRoundsService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  private static async fetchProfileNames(
    ids: (string | null)[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', unique)) as { data: ProfileLite[] | null; error: any };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve profile names', error);
      return map;
    }
    for (const p of data || []) map.set(p.id, p.full_name);
    return map;
  }

  /** Rounds the viewer can see (RLS), newest first, with attendee + participation rollups. */
  static async listRounds(): Promise<CeoRoundEnriched[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('ceo_rounds')
        .select('*')
        .order('round_date', { ascending: false })) as {
        data: CeoRound[] | null;
        error: any;
      };
      if (error) throw error;
      const rounds = data || [];
      if (rounds.length === 0) return [];

      // One batched attendance read for the rollups (count + participation sum).
      const roundIds = rounds.map((r) => r.id);
      const { data: att } = (await (supabase as any)
        .from('ceo_round_attendance')
        .select('round_id, participation')
        .in('round_id', roundIds)) as {
        data: { round_id: string; participation: CeoRoundParticipation }[] | null;
        error: any;
      };
      const countByRound = new Map<string, number>();
      const scoreByRound = new Map<string, number>();
      for (const a of att || []) {
        countByRound.set(a.round_id, (countByRound.get(a.round_id) || 0) + 1);
        scoreByRound.set(
          a.round_id,
          (scoreByRound.get(a.round_id) || 0) + (PARTICIPATION_WEIGHT[a.participation] || 0)
        );
      }

      const nameMap = await this.fetchProfileNames([
        ...rounds.map((r) => r.facilitator_id),
        ...rounds.map((r) => r.summary_author_id)
      ]);

      return rounds.map((r) => ({
        ...r,
        facilitator_name: r.facilitator_id ? nameMap.get(r.facilitator_id) ?? null : null,
        summary_author_name: r.summary_author_id
          ? nameMap.get(r.summary_author_id) ?? null
          : null,
        attendee_count: countByRound.get(r.id) || 0,
        participation_total: scoreByRound.get(r.id) || 0
      }));
    } catch (error) {
      logger.error(MODULE, 'Error fetching rounds', error);
      return [];
    }
  }

  /** One round with its attendance + tasks, names/links resolved. */
  static async getRound(id: string): Promise<CeoRoundDetail | null> {
    const supabase = this.getSupabase();
    try {
      const { data: round, error } = (await (supabase as any)
        .from('ceo_rounds')
        .select('*')
        .eq('id', id)
        .maybeSingle()) as { data: CeoRound | null; error: any };
      if (error) throw error;
      if (!round) return null;

      const [{ data: att }, { data: tasks }] = await Promise.all([
        (supabase as any)
          .from('ceo_round_attendance')
          .select('*')
          .eq('round_id', id)
          .order('created_at', { ascending: true }),
        (supabase as any)
          .from('ceo_round_tasks')
          .select('*')
          .eq('round_id', id)
          .order('created_at', { ascending: true })
      ]);

      const attRows = (att || []) as CeoRoundAttendance[];
      const taskRows = (tasks || []) as CeoRoundTask[];

      const nameMap = await this.fetchProfileNames([
        round.facilitator_id,
        round.summary_author_id,
        ...attRows.map((a) => a.participant_id),
        ...taskRows.map((t) => t.owner_profile_id)
      ]);

      // Resolve linked idea titles for tasks (RLS-scoped read).
      const linkedIds = Array.from(
        new Set(taskRows.map((t) => t.linked_idea_id).filter((v): v is string => !!v))
      );
      const ideaTitle = new Map<string, string>();
      if (linkedIds.length > 0) {
        const { data: ideas } = (await (supabase as any)
          .from('improvement_ideas')
          .select('id, title')
          .in('id', linkedIds)) as { data: { id: string; title: string }[] | null; error: any };
        for (const i of ideas || []) ideaTitle.set(i.id, i.title);
      }

      const enriched: CeoRoundEnriched = {
        ...round,
        facilitator_name: round.facilitator_id
          ? nameMap.get(round.facilitator_id) ?? null
          : null,
        summary_author_name: round.summary_author_id
          ? nameMap.get(round.summary_author_id) ?? null
          : null,
        attendee_count: attRows.length,
        participation_total: attRows.reduce(
          (sum, a) => sum + (PARTICIPATION_WEIGHT[a.participation] || 0),
          0
        )
      };

      return {
        round: enriched,
        attendance: attRows.map((a) => ({
          ...a,
          participant_name: nameMap.get(a.participant_id) ?? null
        })),
        tasks: taskRows.map((t) => ({
          ...t,
          owner_name: t.owner_profile_id ? nameMap.get(t.owner_profile_id) ?? null : null,
          linked_idea_title: t.linked_idea_id ? ideaTitle.get(t.linked_idea_id) ?? null : null
        }))
      };
    } catch (error) {
      logger.error(MODULE, `Error fetching round ${id}`, error);
      return null;
    }
  }

  /** Log a new round (facilitator). institution_id = the creator's own institution. */
  static async createRound(payload: CreateCeoRoundPayload): Promise<CeoRound> {
    const supabase = this.getSupabase();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError) throw new Error(`Authentication failed: ${authError.message}`);
    if (!user) throw new Error('You must be signed in to log a round.');

    const { data: profile } = (await (supabase as any)
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .maybeSingle()) as { data: { institution_id: string | null } | null; error: any };

    const insertRow = {
      round_date: payload.round_date,
      theme: payload.theme.trim(),
      decision: payload.decision?.trim() || null,
      facilitator_id: payload.facilitator_id || user.id,
      host_id: payload.host_id || null,
      summary_author_id: payload.summary_author_id || null,
      created_by: user.id,
      institution_id: profile?.institution_id ?? null
    };

    const { data, error } = (await (supabase as any)
      .from('ceo_rounds')
      .insert(insertRow)
      .select('*')
      .single()) as { data: CeoRound | null; error: any };
    if (error) {
      logger.error(MODULE, 'Error creating round', error);
      throw new Error(error.message || 'Failed to log the round.');
    }
    if (!data) throw new Error('Failed to log the round — no data returned.');

    // Seed attendance rows (default 'present') for any attendees provided.
    if (payload.attendee_ids && payload.attendee_ids.length > 0) {
      await this.addAttendees(data.id, payload.attendee_ids);
    }
    return data;
  }

  static async updateRound(
    roundId: string,
    patch: Partial<Pick<CeoRound, 'theme' | 'decision' | 'status' | 'facilitator_id' | 'host_id' | 'summary_author_id'>>
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('ceo_rounds')
      .update(patch)
      .eq('id', roundId);
    if (error) {
      logger.error(MODULE, 'Error updating round', error);
      throw new Error(error.message || 'Failed to save changes.');
    }
  }

  static async addAttendees(roundId: string, participantIds: string[]): Promise<void> {
    if (participantIds.length === 0) return;
    const supabase = this.getSupabase();
    const rows = participantIds.map((pid) => ({
      round_id: roundId,
      participant_id: pid,
      participation: 'present' as CeoRoundParticipation
    }));
    // onConflict (round_id, participant_id) → ignore dupes.
    const { error } = await (supabase as any)
      .from('ceo_round_attendance')
      .upsert(rows, { onConflict: 'round_id,participant_id', ignoreDuplicates: true });
    if (error) {
      logger.error(MODULE, 'Error adding attendees', error);
      throw new Error(error.message || 'Failed to add attendees.');
    }
  }

  /** Grade one attendee's participation (facilitator). */
  static async gradeAttendance(
    attendanceId: string,
    participation: CeoRoundParticipation,
    note?: string
  ): Promise<void> {
    const supabase = this.getSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const patch: Record<string, unknown> = { participation, graded_by: user?.id ?? null };
    if (note !== undefined) patch.note = note.trim() || null;
    const { error } = await (supabase as any)
      .from('ceo_round_attendance')
      .update(patch)
      .eq('id', attendanceId);
    if (error) {
      logger.error(MODULE, 'Error grading attendance', error);
      throw new Error(error.message || 'Failed to save participation grade.');
    }
  }

  static async removeAttendee(attendanceId: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('ceo_round_attendance')
      .delete()
      .eq('id', attendanceId);
    if (error) throw new Error(error.message || 'Failed to remove attendee.');
  }

  static async addTask(
    roundId: string,
    task: {
      action_text: string;
      owner_profile_id?: string | null;
      owner_label?: string | null;
      due_date?: string | null;
      linked_idea_id?: string | null;
    }
  ): Promise<CeoRoundTask> {
    const supabase = this.getSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data, error } = (await (supabase as any)
      .from('ceo_round_tasks')
      .insert({
        round_id: roundId,
        action_text: task.action_text.trim(),
        owner_profile_id: task.owner_profile_id || null,
        owner_label: task.owner_label?.trim() || null,
        due_date: task.due_date || null,
        linked_idea_id: task.linked_idea_id || null,
        created_by: user?.id ?? null
      })
      .select('*')
      .single()) as { data: CeoRoundTask | null; error: any };
    if (error) {
      logger.error(MODULE, 'Error adding task', error);
      throw new Error(error.message || 'Failed to add task.');
    }
    return data as CeoRoundTask;
  }

  static async updateTask(
    taskId: string,
    patch: Partial<Pick<CeoRoundTask, 'action_text' | 'owner_profile_id' | 'owner_label' | 'due_date' | 'status' | 'linked_idea_id'>>
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('ceo_round_tasks')
      .update(patch)
      .eq('id', taskId);
    if (error) throw new Error(error.message || 'Failed to update task.');
  }

  /** Write/submit the round summary through the SECDEF RPC (Associate or facilitator). */
  static async writeSummary(roundId: string, summary: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_ceo_round_write_summary', {
      p_round_id: roundId,
      p_summary: summary
    });
    if (error) {
      logger.error(MODULE, 'Error writing summary', error);
      throw new Error(error.message || 'Failed to save the summary.');
    }
  }

  /** Approve the round summary (facilitator gate) through the SECDEF RPC. */
  static async approveSummary(roundId: string, note?: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_ceo_round_approve_summary', {
      p_round_id: roundId,
      p_note: note ?? null
    });
    if (error) {
      logger.error(MODULE, 'Error approving summary', error);
      throw new Error(error.message || 'Failed to approve the summary.');
    }
  }

  /** Institution colleagues who can be added as attendees / owners / summary author. */
  static async listCandidates(institutionId: string): Promise<ProfileLite[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .eq('institution_id', institutionId)
      .order('full_name', { ascending: true })
      .limit(500)) as { data: ProfileLite[] | null; error: any };
    if (error) {
      logger.warn(MODULE, 'Failed to list candidates', error);
      return [];
    }
    return data || [];
  }

  /** Open Improvement Board ideas a task can link to (RLS-scoped). */
  static async listLinkableIdeas(): Promise<{ id: string; title: string }[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('improvement_ideas')
      .select('id, title')
      .in('status', ['logged', 'under_review', 'approved'])
      .order('created_at', { ascending: false })
      .limit(200)) as { data: { id: string; title: string }[] | null; error: any };
    if (error) {
      logger.warn(MODULE, 'Failed to list linkable ideas', error);
      return [];
    }
    return data || [];
  }
}
