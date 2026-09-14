/**
 * Online Meetings — the live action dispatcher.
 *
 * The single place the four live writes are implemented in terms of a
 * resolved participant. Both front doors call THIS:
 *
 *   /api/online-meetings/live/[action]         — session identity (withAuth)
 *   /api/public/online-meetings/live/[action]  — token identity (service role)
 *
 * Why one dispatcher rather than four route files times two: a guest cannot
 * use the browser Supabase client, so without this the live path would be
 * written twice — once against RLS for colleagues and once against a service
 * role for guests — and the two would drift. The first divergence would be
 * silent, because both halves would keep working for their own audience.
 *
 * Identity resolution deliberately does NOT happen here. It belongs in the
 * route, where the auth context is, and this file trusts what it is handed.
 */

import {
  recordHeartbeat,
  recordJoin,
  recordPollResponse,
  submitQuiz,
  type ResolvedParticipant,
} from './live-service';
import type { ServiceResult } from './meeting-service';

export const LIVE_ACTIONS = ['join', 'heartbeat', 'poll', 'quiz'] as const;
export type LiveAction = (typeof LIVE_ACTIONS)[number];

export function isLiveAction(value: unknown): value is LiveAction {
  return typeof value === 'string' && (LIVE_ACTIONS as readonly string[]).includes(value);
}

export interface LiveActionBody {
  /** poll: which poll and which option. */
  poll_id?: string;
  option_id?: string;
  /** quiz: question id → chosen option id. */
  answers?: Record<string, string>;
}

export async function runLiveAction(
  db: any,
  who: ResolvedParticipant,
  action: LiveAction,
  body: LiveActionBody,
): Promise<ServiceResult<unknown>> {
  switch (action) {
    case 'join':
      return recordJoin(db, who);

    case 'heartbeat':
      return recordHeartbeat(db, who);

    case 'poll': {
      if (!body.poll_id || !body.option_id) {
        return { ok: false, error: 'poll_id and option_id are required.' };
      }
      return recordPollResponse(db, who, body.poll_id, body.option_id);
    }

    case 'quiz': {
      if (!body.answers || typeof body.answers !== 'object') {
        return { ok: false, error: 'answers are required.' };
      }
      return submitQuiz(db, who, body.answers);
    }
  }
}
