/**
 * Online Meetings — meeting CRUD.
 *
 * Extends BaseService, so `this.supabase` is the browser singleton in the
 * browser and the request-scoped, RLS-carrying client on the server (injected
 * by withAuth via runWithClient). If you ever see "Server-side service call
 * without client injection" in a log, the route handler was not wrapped.
 *
 * Every write destructures `{ error }` and checks it. Supabase errors are
 * plain objects, not thrown Errors — try/catch does NOT catch an RLS denial or
 * a constraint violation, and a fire-and-forget mutation that failed looks
 * exactly like one that worked.
 */

import { BaseService } from '@/lib/services/base-service';
import { deriveEffectiveStatus } from '@/lib/services/live-engine/time-window';
import { resolveMeetingConfig } from '@/lib/services/live-engine/engagement-gates';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';

import { isSafeMeetingUrl, MEETING_URL_ERROR } from './meeting-url';
import {
  EMPTY_QUIZ,
  type JoinMode,
  type MeetingQuiz,
  type MeetingStatus,
  type MeetSource,
  type OnlineMeeting,
  type OnlineMeetingListRow,
} from './types';

const LOG_SCOPE = 'online-meetings/meeting';

const MEETING_COLUMNS =
  'id, institution_id, title, description, host_profile_id, starts_at, ends_at, ' +
  'timezone, status, meet_url, meet_source, google_event_id, recording_url, ' +
  'join_mode, open_join_token, engagement_config, quiz, cancelled_at, ' +
  'cancellation_reason, created_by, created_at, updated_at';

export interface CreateMeetingInput {
  institutionId: string;
  title: string;
  description?: string | null;
  hostProfileId: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone?: string;
  joinMode?: JoinMode;
  meetUrl?: string | null;
  meetSource?: MeetSource;
  googleEventId?: string | null;
  engagementConfig?: Record<string, unknown>;
  quiz?: MeetingQuiz;
}

export interface UpdateMeetingInput {
  title?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  meetUrl?: string | null;
  meetSource?: MeetSource;
  googleEventId?: string | null;
  recordingUrl?: string | null;
  joinMode?: JoinMode;
  engagementConfig?: Record<string, unknown>;
  quiz?: MeetingQuiz;
}

export interface ListMeetingsFilters {
  /** Restrict to one institution. Omit for everything the viewer may read. */
  institutionId?: string | null;
  /** 'upcoming' | 'past' | 'all' — window relative to now. */
  window?: 'upcoming' | 'past' | 'all';
  search?: string;
  limit?: number;
}

export type ServiceResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function coerceQuiz(raw: unknown): MeetingQuiz {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_QUIZ };
  const q = raw as Partial<MeetingQuiz>;
  return {
    questions: Array.isArray(q.questions) ? q.questions : [],
    pass_threshold:
      typeof q.pass_threshold === 'number' ? q.pass_threshold : EMPTY_QUIZ.pass_threshold,
  };
}

function hydrate(row: any): OnlineMeeting {
  return {
    id: row.id,
    institution_id: row.institution_id,
    title: row.title,
    description: row.description ?? null,
    host_profile_id: row.host_profile_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone ?? 'Asia/Kolkata',
    status: (row.status ?? 'scheduled') as MeetingStatus,
    meet_url: row.meet_url ?? null,
    meet_source: (row.meet_source ?? 'manual') as MeetSource,
    google_event_id: row.google_event_id ?? null,
    recording_url: row.recording_url ?? null,
    join_mode: (row.join_mode ?? 'invite_only') as JoinMode,
    open_join_token: row.open_join_token ?? null,
    engagement_config: (row.engagement_config ?? {}) as Record<string, never>,
    quiz: coerceQuiz(row.quiz),
    cancelled_at: row.cancelled_at ?? null,
    cancellation_reason: row.cancellation_reason ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * A meeting's status as the clock sees it.
 *
 * 'scheduled' is the "nobody has decided yet" value, so it is the one the
 * window may override; 'cancelled' and an explicitly-completed meeting always
 * win. This is the same derivation AI Pulse uses, and it exists for the same
 * reason: a status that only changes when somebody remembers to change it will
 * eventually be wrong, and every gate hanging off it will be wrong too.
 */
export function effectiveMeetingStatus(
  meeting: Pick<OnlineMeeting, 'status' | 'starts_at' | 'ends_at'>,
  nowMs: number = Date.now(),
): MeetingStatus {
  return deriveEffectiveStatus(
    meeting.status,
    meeting.starts_at,
    meeting.ends_at,
    nowMs,
    'scheduled',
    'live',
    'completed',
  ) as MeetingStatus;
}

export class OnlineMeetingService extends BaseService {
  /**
   * Meetings the caller may see: those they host, those they were invited to,
   * and — with onlineMeeting:manage.all — everything in their institutions.
   *
   * The filtering is RLS's job, not this query's. Asking for all rows and
   * letting the policy decide is what keeps the three cases from drifting
   * apart in three different WHERE clauses.
   */
  static async list(
    filters: ListMeetingsFilters = {},
    viewerProfileId?: string | null,
  ): Promise<ServiceResult<OnlineMeetingListRow[]>> {
    const supabase = this.supabase;
    const nowIso = new Date().toISOString();

    let query = supabase
      .from('online_meetings')
      .select(MEETING_COLUMNS)
      .order('starts_at', { ascending: filters.window === 'upcoming' });

    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.window === 'upcoming') query = query.gte('ends_at', nowIso);
    if (filters.window === 'past') query = query.lt('ends_at', nowIso);
    if (filters.search) {
      const term = this.sanitize(filters.search);
      if (term) query = query.ilike('title', `%${term}%`);
    }
    query = query.limit(filters.limit ?? 100);

    const { data, error } = await query;
    if (error) {
      logger.error(LOG_SCOPE, 'list failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }

    const rows = (data ?? []) as any[];
    if (rows.length === 0) return { ok: true, data: [] };

    const meetingIds = rows.map((r) => r.id);
    const hostIds = Array.from(new Set(rows.map((r) => r.host_profile_id).filter(Boolean)));

    // Host names and per-meeting counts in two extra round trips rather than a
    // join. A `!inner` join here would be an INNER JOIN and would silently drop
    // any meeting whose host profile was deactivated — the row would vanish
    // from the organiser's own list with no error anywhere.
    const [{ data: hostRows }, { data: participantRows }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', hostIds),
      supabase
        .from('online_meeting_participants')
        .select('id, meeting_id')
        .in('meeting_id', meetingIds),
    ]);

    const { data: attendanceRows } = await supabase
      .from('online_meeting_attendance')
      .select('meeting_id, joined_at')
      .in('meeting_id', meetingIds)
      .not('joined_at', 'is', null);

    const hostName = new Map<string, string | null>(
      ((hostRows ?? []) as any[]).map((p) => [p.id, p.full_name ?? null]),
    );
    const participantCount = new Map<string, number>();
    for (const p of (participantRows ?? []) as any[]) {
      participantCount.set(p.meeting_id, (participantCount.get(p.meeting_id) ?? 0) + 1);
    }
    const joinedCount = new Map<string, number>();
    for (const a of (attendanceRows ?? []) as any[]) {
      joinedCount.set(a.meeting_id, (joinedCount.get(a.meeting_id) ?? 0) + 1);
    }

    return {
      ok: true,
      data: rows.map((row) => {
        const meeting = hydrate(row);
        return {
          ...meeting,
          effective_status: effectiveMeetingStatus(meeting),
          host_name: hostName.get(meeting.host_profile_id) ?? null,
          participant_count: participantCount.get(meeting.id) ?? 0,
          joined_count: joinedCount.get(meeting.id) ?? 0,
          is_host: !!viewerProfileId && meeting.host_profile_id === viewerProfileId,
        };
      }),
    };
  }

  static async getById(meetingId: string): Promise<ServiceResult<OnlineMeeting | null>> {
    const { data, error } = await this.supabase
      .from('online_meetings')
      .select(MEETING_COLUMNS)
      .eq('id', meetingId)
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'getById failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: data ? hydrate(data) : null };
  }

  static async create(input: CreateMeetingInput): Promise<ServiceResult<OnlineMeeting>> {
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      return { ok: false, error: 'The meeting must end after it starts.' };
    }

    const joinMode: JoinMode = input.joinMode ?? 'invite_only';

    // A meeting link becomes an href for every participant AND for external
    // guests on the public join page, so a `javascript:` value here would be
    // stored XSS. Refused at the service, which is the one choke point every
    // write path goes through.
    const meetUrl = input.meetUrl?.trim() || null;
    if (meetUrl && !isSafeMeetingUrl(meetUrl)) {
      return { ok: false, error: MEETING_URL_ERROR };
    }

    const payload = {
      institution_id: input.institutionId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      host_profile_id: input.hostProfileId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      timezone: input.timezone || 'Asia/Kolkata',
      join_mode: joinMode,
      // The CHECK constraint pairs these: an open-link meeting is defined by
      // having a token to open, and an invite-only one must not carry a
      // standing public token nobody can revoke per-person.
      open_join_token: joinMode === 'open_link' ? crypto.randomUUID() : null,
      meet_url: meetUrl,
      meet_source: input.meetSource ?? 'manual',
      google_event_id: input.googleEventId ?? null,
      engagement_config: input.engagementConfig ?? {},
      quiz: input.quiz ?? EMPTY_QUIZ,
      created_by: input.hostProfileId,
    };

    const { data, error } = await this.supabase
      .from('online_meetings')
      .insert(payload)
      .select(MEETING_COLUMNS)
      .single();

    if (error) {
      logger.error(LOG_SCOPE, 'create failed', error);
      // 42501 is an RLS denial. It reads as a permissions bug to the caller,
      // so say which permission rather than surfacing the raw code.
      if ((error as any).code === '42501') {
        return {
          ok: false,
          error:
            'You do not have permission to schedule a meeting for this institution (onlineMeeting:create).',
        };
      }
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: hydrate(data) };
  }

  static async update(
    meetingId: string,
    input: UpdateMeetingInput,
  ): Promise<ServiceResult<OnlineMeeting>> {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
    if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    // Same guard as create: an href rendered to guests must never carry a
    // script scheme. Clearing the link (empty string) stays allowed.
    if (input.meetUrl !== undefined) {
      const next = input.meetUrl?.trim() || null;
      if (next && !isSafeMeetingUrl(next)) {
        return { ok: false, error: MEETING_URL_ERROR };
      }
      patch.meet_url = next;
    }
    if (input.meetSource !== undefined) patch.meet_source = input.meetSource;
    if (input.googleEventId !== undefined) patch.google_event_id = input.googleEventId;
    if (input.recordingUrl !== undefined) {
      const next = input.recordingUrl?.trim() || null;
      // The recording URL is not rendered as a link today, but it is the same
      // shape of field and will be one day. Guard it now, not after.
      if (next && !isSafeMeetingUrl(next)) {
        return { ok: false, error: MEETING_URL_ERROR };
      }
      patch.recording_url = next;
    }
    if (input.engagementConfig !== undefined) patch.engagement_config = input.engagementConfig;
    if (input.quiz !== undefined) patch.quiz = input.quiz;
    if (input.joinMode !== undefined) {
      patch.join_mode = input.joinMode;
      patch.open_join_token = input.joinMode === 'open_link' ? crypto.randomUUID() : null;
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: 'Nothing to update.' };
    }

    const { data, error } = await this.supabase
      .from('online_meetings')
      .update(patch)
      .eq('id', meetingId)
      .select(MEETING_COLUMNS)
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'update failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    // A refused write is not an error — it is a successful UPDATE of zero rows.
    // Without this check the caller is told the edit saved when RLS discarded it.
    if (!data) {
      return {
        ok: false,
        error: 'That meeting could not be updated. You may not be its host.',
      };
    }
    return { ok: true, data: hydrate(data) };
  }

  /**
   * Cancel rather than delete. A meeting that happened, or that people were
   * invited to, is a record; deleting it would take its attendance rows with
   * it via the cascade and leave the invitees wondering.
   */
  static async cancel(
    meetingId: string,
    reason: string,
  ): Promise<ServiceResult<OnlineMeeting>> {
    if (!reason?.trim()) {
      return { ok: false, error: 'A cancellation reason is required.' };
    }
    const { data, error } = await this.supabase
      .from('online_meetings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason.trim(),
      })
      .eq('id', meetingId)
      .select(MEETING_COLUMNS)
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'cancel failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    if (!data) {
      return {
        ok: false,
        error: 'That meeting could not be cancelled. You may not be its host.',
      };
    }
    return { ok: true, data: hydrate(data) };
  }

  /** The resolved engagement rules of one meeting, defaults filled in. */
  static configOf(meeting: Pick<OnlineMeeting, 'engagement_config'>) {
    return resolveMeetingConfig(meeting.engagement_config);
  }
}
