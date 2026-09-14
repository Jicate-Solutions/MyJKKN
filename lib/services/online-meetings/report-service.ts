/**
 * Online Meetings — the post-meeting attendance and engagement report.
 *
 * This is the surface the whole module exists to produce, and the one place
 * where the participant-keyed design pays off: an internal colleague and an
 * external guest are the same shape of row, so the report needs no second code
 * path and cannot quietly omit the guests.
 *
 * WHAT THE REPORT IS CAREFUL ABOUT
 *   - Invited-but-absent people appear, with no join time. A report that lists
 *     only attendees answers "who came" but not "who was asked", and the
 *     second question is usually the one being asked.
 *   - Every row says how the person was invited. An open-link attendee
 *     self-declared who they are, and a compliance reader must be able to see
 *     that rather than read it as verified presence.
 *   - The engagement rate is null, not zero, when the meeting measured nothing
 *     beyond presence. Zero would read as "nobody engaged" for a meeting that
 *     never asked.
 */

import { BaseService } from '@/lib/services/base-service';
import {
  evaluateMeetingGates,
  resolveMeetingConfig,
  type EngagementSignals,
} from '@/lib/services/live-engine/engagement-gates';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';

import type {
  InvitedVia,
  MeetingReport,
  MeetingReportRow,
  ParticipantKind,
} from './types';
import type { ServiceResult } from './meeting-service';

const LOG_SCOPE = 'online-meetings/report';

export class MeetingReportService extends BaseService {
  static async build(meetingId: string): Promise<ServiceResult<MeetingReport>> {
    const supabase = this.supabase;

    const { data: meeting, error: mErr } = await supabase
      .from('online_meetings')
      .select('id, title, starts_at, ends_at, engagement_config, quiz')
      .eq('id', meetingId)
      .maybeSingle();

    if (mErr) {
      logger.error(LOG_SCOPE, 'meeting fetch failed', mErr);
      return { ok: false, error: getErrorMessage(mErr) };
    }
    if (!meeting) return { ok: false, error: 'Meeting not found.' };

    const cfg = resolveMeetingConfig(meeting.engagement_config);

    const [{ data: participants, error: pErr }, { data: polls }] = await Promise.all([
      supabase
        .from('online_meeting_participants')
        .select(
          'id, participant_kind, profile_id, external_name, external_organization, invited_via',
        )
        .eq('meeting_id', meetingId)
        .order('invited_at', { ascending: true }),
      supabase.from('online_meeting_polls').select('id').eq('meeting_id', meetingId),
    ]);

    if (pErr) {
      logger.error(LOG_SCOPE, 'participants fetch failed', pErr);
      return { ok: false, error: getErrorMessage(pErr) };
    }

    const roster = (participants ?? []) as any[];
    const pollsIssued = ((polls ?? []) as any[]).length;

    if (roster.length === 0) {
      return {
        ok: true,
        data: {
          meeting: {
            id: meeting.id,
            title: meeting.title,
            starts_at: meeting.starts_at,
            ends_at: meeting.ends_at,
            polls_issued: pollsIssued,
            quiz_required: cfg.require_quiz,
          },
          rows: [],
          totals: {
            invited: 0,
            joined: 0,
            engaged: 0,
            internal_joined: 0,
            external_joined: 0,
            engagement_rate: null,
          },
        },
      };
    }

    const participantIds = roster.map((p) => p.id);
    const profileIds = Array.from(
      new Set(roster.map((p) => p.profile_id).filter(Boolean)),
    ) as string[];

    // Left joins by hand, deliberately. A PostgREST `!inner` embed here would
    // become an INNER JOIN and drop every invited-but-absent person — exactly
    // the rows this report is supposed to show.
    const [{ data: attendance }, { data: profiles }] = await Promise.all([
      supabase
        .from('online_meeting_attendance')
        .select('participant_id, joined_at, engagement_signals')
        .in('participant_id', participantIds),
      profileIds.length > 0
        ? supabase.from('profiles').select('id, full_name').in('id', profileIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const attendanceBy = new Map<string, any>(
      ((attendance ?? []) as any[]).map((a) => [a.participant_id, a]),
    );
    const profileName = new Map<string, string | null>(
      ((profiles ?? []) as any[]).map((p) => [p.id, p.full_name ?? null]),
    );

    const rows: MeetingReportRow[] = roster.map((p) => {
      const att = attendanceBy.get(p.id);
      const signals = (att?.engagement_signals ?? {}) as EngagementSignals;
      const gates = evaluateMeetingGates(
        signals,
        meeting.ends_at,
        pollsIssued,
        meeting.engagement_config,
      );
      return {
        participant_id: p.id,
        display_name:
          p.participant_kind === 'internal'
            ? (profileName.get(p.profile_id) ?? 'Unnamed colleague')
            : (p.external_name ?? 'Guest'),
        kind: p.participant_kind as ParticipantKind,
        organization: p.external_organization ?? null,
        invited_via: p.invited_via as InvitedVia,
        joined_at: att?.joined_at ?? null,
        polls_answered: signals.polls_responded ?? 0,
        quiz_score: typeof signals.quiz_score === 'number' ? signals.quiz_score : null,
        stayed_until: signals.stayed_until ?? null,
        gates,
      };
    });

    const joinedRows = rows.filter((r) => r.joined_at !== null);
    // Only people who actually turned up can be engaged or not. Counting the
    // absent as disengaged would conflate "did not come" with "came and did
    // not participate", which are different problems with different fixes.
    const engaged = joinedRows.filter((r) => r.gates.is_engaged).length;
    const measuresSomething = rows.some((r) => r.gates.counted_total > 0);

    return {
      ok: true,
      data: {
        meeting: {
          id: meeting.id,
          title: meeting.title,
          starts_at: meeting.starts_at,
          ends_at: meeting.ends_at,
          polls_issued: pollsIssued,
          quiz_required: cfg.require_quiz,
        },
        rows,
        totals: {
          invited: rows.length,
          joined: joinedRows.length,
          engaged,
          internal_joined: joinedRows.filter((r) => r.kind === 'internal').length,
          external_joined: joinedRows.filter((r) => r.kind === 'external').length,
          engagement_rate:
            !measuresSomething || joinedRows.length === 0
              ? null
              : Math.round((engaged / joinedRows.length) * 100),
        },
      },
    };
  }
}
