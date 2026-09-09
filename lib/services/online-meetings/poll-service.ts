/**
 * Online Meetings — live polls (host side).
 *
 * The read path for participants lives in live-service.ts; this file is what
 * the host's control panel calls. Both write to the same two tables.
 *
 * A poll here is a REAL engagement signal, unlike in AI Pulse where no cycle
 * ever issued one and the gate had to stop counting them. The host issues a
 * poll mid-meeting from the same page they are running the meeting on, and
 * both internal participants and token-bearing guests answer in-page. That is
 * why `evaluateMeetingGates` counts polls when the organiser asks it to, and
 * `evaluateGates` (AI Pulse) still does not.
 */

import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';

import type { MeetingPollWithCount } from './types';
import type { ServiceResult } from './meeting-service';

const LOG_SCOPE = 'online-meetings/polls';

const MAX_OPTIONS = 8;

export interface CreatePollInput {
  meetingId: string;
  institutionId: string;
  question: string;
  /** Free-text labels. Ids are generated here so they are stable and opaque. */
  optionLabels: string[];
  createdBy: string;
}

export class MeetingPollService extends BaseService {
  /**
   * Every poll for a meeting, with live tallies.
   *
   * Returns CLOSED polls too. A participant who missed one should be able to
   * see that it existed rather than wonder why their engagement bar is short,
   * and the gate's requirement is computed from polls ISSUED — hiding closed
   * ones would make the denominator shrink as the host tidied up.
   */
  static async listWithCounts(
    meetingId: string,
  ): Promise<ServiceResult<MeetingPollWithCount[]>> {
    const supabase = this.supabase;

    const { data: polls, error } = await supabase
      .from('online_meeting_polls')
      .select('id, meeting_id, question, options, is_open, issued_at, closed_at')
      .eq('meeting_id', meetingId)
      .order('issued_at', { ascending: true });

    if (error) {
      logger.error(LOG_SCOPE, 'list failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }

    const rows = (polls ?? []) as any[];
    if (rows.length === 0) return { ok: true, data: [] };

    const { data: responses } = await supabase
      .from('online_meeting_poll_responses')
      .select('poll_id, option_id')
      .in(
        'poll_id',
        rows.map((p) => p.id),
      );

    const tallies = new Map<string, Record<string, number>>();
    const counts = new Map<string, number>();
    for (const r of (responses ?? []) as any[]) {
      counts.set(r.poll_id, (counts.get(r.poll_id) ?? 0) + 1);
      const t = tallies.get(r.poll_id) ?? {};
      t[r.option_id] = (t[r.option_id] ?? 0) + 1;
      tallies.set(r.poll_id, t);
    }

    return {
      ok: true,
      data: rows.map((p) => ({
        id: p.id,
        meeting_id: p.meeting_id,
        question: p.question,
        options: (p.options ?? []) as Array<{ id: string; label: string }>,
        is_open: p.is_open,
        issued_at: p.issued_at,
        closed_at: p.closed_at ?? null,
        response_count: counts.get(p.id) ?? 0,
        tallies: tallies.get(p.id) ?? {},
      })),
    };
  }

  static async create(
    input: CreatePollInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const question = input.question?.trim();
    if (!question) return { ok: false, error: 'The poll needs a question.' };

    const labels = input.optionLabels
      .map((l) => l?.trim())
      .filter((l): l is string => !!l && l.length > 0);

    if (labels.length < 2) {
      return { ok: false, error: 'A poll needs at least two options.' };
    }
    if (labels.length > MAX_OPTIONS) {
      return { ok: false, error: `A poll can have at most ${MAX_OPTIONS} options.` };
    }

    // Opaque generated ids rather than the label text. A host who fixes a typo
    // in an option after people have answered would otherwise orphan every
    // response that stored the old label as its key.
    const options = labels.map((label, i) => ({ id: `o${i + 1}`, label }));

    const { data, error } = await this.supabase
      .from('online_meeting_polls')
      .insert({
        meeting_id: input.meetingId,
        institution_id: input.institutionId,
        question,
        options,
        created_by: input.createdBy,
      })
      .select('id')
      .single();

    if (error) {
      logger.error(LOG_SCOPE, 'create failed', error);
      if ((error as any).code === '42501') {
        return { ok: false, error: 'Only the meeting host can issue a poll.' };
      }
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: { id: data.id } };
  }

  static async close(pollId: string): Promise<ServiceResult> {
    const { data, error } = await this.supabase
      .from('online_meeting_polls')
      .update({ is_open: false, closed_at: new Date().toISOString() })
      .eq('id', pollId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'close failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    // A refused write comes back as a successful UPDATE of zero rows, not as
    // an error. Checking the returned row is the only way to tell them apart.
    if (!data) {
      return { ok: false, error: 'That poll could not be closed. You may not be the host.' };
    }
    return { ok: true, data: undefined };
  }

  static async reopen(pollId: string): Promise<ServiceResult> {
    const { data, error } = await this.supabase
      .from('online_meeting_polls')
      .update({ is_open: true, closed_at: null })
      .eq('id', pollId)
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'reopen failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    if (!data) {
      return { ok: false, error: 'That poll could not be reopened. You may not be the host.' };
    }
    return { ok: true, data: undefined };
  }

  static async remove(pollId: string): Promise<ServiceResult> {
    const { error } = await this.supabase
      .from('online_meeting_polls')
      .delete()
      .eq('id', pollId);
    if (error) {
      logger.error(LOG_SCOPE, 'delete failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: undefined };
  }
}
