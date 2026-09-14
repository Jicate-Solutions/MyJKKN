/**
 * Online Meetings — agenda, minutes and action items.
 *
 * Grouped in one file because they are one workflow: what we will discuss,
 * what we said, and what somebody now has to do. Splitting them into three
 * services would produce three near-identical files and one more place to
 * forget to invalidate a cache.
 *
 * Presenter and owner are `participant_id`, not `profile_id`. An external
 * guest can present an agenda item and can own an action item, which is the
 * whole point of inviting them; keying either to `profiles` would have made
 * them second-class in exactly the way this module exists to fix.
 */

import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';

import type {
  ActionItemStatus,
  AgendaItemStatus,
  MeetingActionItem,
  MeetingAgendaItem,
  MeetingMinutes,
} from './types';
import type { ServiceResult } from './meeting-service';

const LOG_SCOPE = 'online-meetings/agenda';

/** participant_id → display name, for presenter and owner columns. */
async function participantNames(
  supabase: any,
  meetingId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('online_meeting_participants')
    .select('id, participant_kind, profile_id, external_name')
    .eq('meeting_id', meetingId);

  const rows = (data ?? []) as any[];
  const profileIds = Array.from(
    new Set(rows.map((r) => r.profile_id).filter(Boolean)),
  ) as string[];

  const profileName = new Map<string, string | null>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds);
    for (const p of (profiles ?? []) as any[]) profileName.set(p.id, p.full_name ?? null);
  }

  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(
      r.id,
      r.participant_kind === 'internal'
        ? (profileName.get(r.profile_id) ?? 'Unnamed colleague')
        : (r.external_name ?? 'Guest'),
    );
  }
  return out;
}

export class MeetingAgendaService extends BaseService {
  static async listAgenda(
    meetingId: string,
  ): Promise<ServiceResult<MeetingAgendaItem[]>> {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from('online_meeting_agenda_items')
      .select(
        'id, meeting_id, title, detail, presenter_participant_id, sort_order, duration_min, status',
      )
      .eq('meeting_id', meetingId)
      .order('sort_order', { ascending: true });

    if (error) {
      logger.error(LOG_SCOPE, 'listAgenda failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }

    const rows = (data ?? []) as any[];
    const names = rows.some((r) => r.presenter_participant_id)
      ? await participantNames(supabase, meetingId)
      : new Map<string, string>();

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        meeting_id: r.meeting_id,
        title: r.title,
        detail: r.detail ?? null,
        presenter_participant_id: r.presenter_participant_id ?? null,
        presenter_name: r.presenter_participant_id
          ? (names.get(r.presenter_participant_id) ?? null)
          : null,
        sort_order: r.sort_order ?? 0,
        duration_min: r.duration_min ?? null,
        status: r.status as AgendaItemStatus,
      })),
    };
  }

  static async addAgendaItem(input: {
    meetingId: string;
    institutionId: string;
    title: string;
    detail?: string | null;
    presenterParticipantId?: string | null;
    durationMin?: number | null;
    sortOrder?: number;
    createdBy: string;
  }): Promise<ServiceResult<{ id: string }>> {
    const title = input.title?.trim();
    if (!title) return { ok: false, error: 'An agenda item needs a title.' };

    const { data, error } = await this.supabase
      .from('online_meeting_agenda_items')
      .insert({
        meeting_id: input.meetingId,
        institution_id: input.institutionId,
        title,
        detail: input.detail?.trim() || null,
        // '' would be sent as a literal empty string and fail as an invalid
        // uuid (22P02). Nullable foreign keys are normalised, never coerced.
        presenter_participant_id: input.presenterParticipantId || null,
        duration_min: input.durationMin ?? null,
        sort_order: input.sortOrder ?? 0,
        created_by: input.createdBy,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(LOG_SCOPE, 'addAgendaItem failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: { id: data.id } };
  }

  static async updateAgendaItem(
    itemId: string,
    patch: {
      title?: string;
      detail?: string | null;
      presenterParticipantId?: string | null;
      durationMin?: number | null;
      sortOrder?: number;
      status?: AgendaItemStatus;
    },
  ): Promise<ServiceResult> {
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.detail !== undefined) update.detail = patch.detail?.trim() || null;
    if (patch.presenterParticipantId !== undefined) {
      update.presenter_participant_id = patch.presenterParticipantId || null;
    }
    if (patch.durationMin !== undefined) update.duration_min = patch.durationMin;
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
    if (patch.status !== undefined) update.status = patch.status;

    if (Object.keys(update).length === 0) {
      return { ok: false, error: 'Nothing to update.' };
    }

    const { data, error } = await this.supabase
      .from('online_meeting_agenda_items')
      .update(update)
      .eq('id', itemId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'updateAgendaItem failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    if (!data) return { ok: false, error: 'That agenda item could not be updated.' };
    return { ok: true, data: undefined };
  }

  static async removeAgendaItem(itemId: string): Promise<ServiceResult> {
    const { error } = await this.supabase
      .from('online_meeting_agenda_items')
      .delete()
      .eq('id', itemId);
    if (error) {
      logger.error(LOG_SCOPE, 'removeAgendaItem failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: undefined };
  }

  // -------------------------------------------------------------------------
  // Minutes — one row per meeting
  // -------------------------------------------------------------------------

  static async getMinutes(meetingId: string): Promise<ServiceResult<MeetingMinutes | null>> {
    const { data, error } = await this.supabase
      .from('online_meeting_minutes')
      .select('id, meeting_id, content, recorded_by, published_at, updated_at')
      .eq('meeting_id', meetingId)
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'getMinutes failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: (data as MeetingMinutes | null) ?? null };
  }

  /** Upsert on meeting_id — the table has a unique constraint on it. */
  static async saveMinutes(input: {
    meetingId: string;
    institutionId: string;
    content: string;
    recordedBy: string;
    publish?: boolean;
  }): Promise<ServiceResult<MeetingMinutes>> {
    const payload: Record<string, unknown> = {
      meeting_id: input.meetingId,
      institution_id: input.institutionId,
      content: input.content ?? '',
      recorded_by: input.recordedBy,
    };
    if (input.publish) payload.published_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('online_meeting_minutes')
      .upsert(payload, { onConflict: 'meeting_id' })
      .select('id, meeting_id, content, recorded_by, published_at, updated_at')
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'saveMinutes failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    if (!data) {
      return { ok: false, error: 'The minutes could not be saved. You may not be the host.' };
    }
    return { ok: true, data: data as MeetingMinutes };
  }

  // -------------------------------------------------------------------------
  // Action items
  // -------------------------------------------------------------------------

  static async listActionItems(
    meetingId: string,
  ): Promise<ServiceResult<MeetingActionItem[]>> {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from('online_meeting_action_items')
      .select(
        'id, meeting_id, title, detail, owner_participant_id, due_date, status, completed_at',
      )
      .eq('meeting_id', meetingId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      logger.error(LOG_SCOPE, 'listActionItems failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }

    const rows = (data ?? []) as any[];
    const names = rows.some((r) => r.owner_participant_id)
      ? await participantNames(supabase, meetingId)
      : new Map<string, string>();

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        meeting_id: r.meeting_id,
        title: r.title,
        detail: r.detail ?? null,
        owner_participant_id: r.owner_participant_id ?? null,
        owner_name: r.owner_participant_id
          ? (names.get(r.owner_participant_id) ?? null)
          : null,
        due_date: r.due_date ?? null,
        status: r.status as ActionItemStatus,
        completed_at: r.completed_at ?? null,
      })),
    };
  }

  static async addActionItem(input: {
    meetingId: string;
    institutionId: string;
    title: string;
    detail?: string | null;
    ownerParticipantId?: string | null;
    dueDate?: string | null;
    createdBy: string;
  }): Promise<ServiceResult<{ id: string }>> {
    const title = input.title?.trim();
    if (!title) return { ok: false, error: 'An action item needs a title.' };

    const { data, error } = await this.supabase
      .from('online_meeting_action_items')
      .insert({
        meeting_id: input.meetingId,
        institution_id: input.institutionId,
        title,
        detail: input.detail?.trim() || null,
        owner_participant_id: input.ownerParticipantId || null,
        due_date: input.dueDate || null,
        created_by: input.createdBy,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(LOG_SCOPE, 'addActionItem failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: { id: data.id } };
  }

  /**
   * Update an action item.
   *
   * The owner may change the status even though they are not the host — the
   * `online_meeting_action_items_owner_update` policy grants exactly that and
   * nothing else. If a non-host owner tries to retitle an item the update
   * matches zero rows and is reported honestly rather than silently discarded.
   */
  static async updateActionItem(
    itemId: string,
    patch: {
      title?: string;
      detail?: string | null;
      ownerParticipantId?: string | null;
      dueDate?: string | null;
      status?: ActionItemStatus;
    },
  ): Promise<ServiceResult> {
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.detail !== undefined) update.detail = patch.detail?.trim() || null;
    if (patch.ownerParticipantId !== undefined) {
      update.owner_participant_id = patch.ownerParticipantId || null;
    }
    if (patch.dueDate !== undefined) update.due_date = patch.dueDate || null;
    if (patch.status !== undefined) {
      update.status = patch.status;
      update.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
    }

    if (Object.keys(update).length === 0) {
      return { ok: false, error: 'Nothing to update.' };
    }

    const { data, error } = await this.supabase
      .from('online_meeting_action_items')
      .update(update)
      .eq('id', itemId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'updateActionItem failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    if (!data) {
      return {
        ok: false,
        error: 'That action item could not be updated. You may only change items you own.',
      };
    }
    return { ok: true, data: undefined };
  }

  static async removeActionItem(itemId: string): Promise<ServiceResult> {
    const { error } = await this.supabase
      .from('online_meeting_action_items')
      .delete()
      .eq('id', itemId);
    if (error) {
      logger.error(LOG_SCOPE, 'removeActionItem failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: undefined };
  }
}
