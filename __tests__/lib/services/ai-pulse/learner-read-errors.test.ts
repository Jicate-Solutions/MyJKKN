/**
 * AI Pulse learner reads — telling a failure apart from an empty answer.
 * =============================================================================
 *
 * Every read in this service degrades to an empty shape on failure. That is
 * right for the client hooks and WRONG for the My AI Pulse server page: a
 * stalled `startup_events` read came back as `null` and the page stated, with
 * total confidence, that the learner had no active cycle. That is the
 * honest-looking dead end BUG-005574 / 005576 / 005579 / 005581 could not get
 * past, and no retry was offered because nothing knew anything had failed.
 *
 * `throwOnError` is the opt-in that lets the page tell the two apart. These
 * tests pin both halves of the contract:
 *
 *   1. without it, every read still degrades exactly as before (no existing
 *      caller changes behaviour);
 *   2. with it, a FAILED read raises AiPulseReadError — but a read that
 *      succeeded and found nothing still returns the empty shape, because an
 *      empty answer must never light the retry notice.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// createServerSupabaseClient is only reached by the methods that take no
// client; the rest get one injected.
const serverClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => serverClient.current,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => serverClient.current,
}));

import {
  AiPulseLearnerService,
  AiPulseReadError,
} from '@/lib/services/ai-pulse/learner-service';

type Result = { data: unknown; error: unknown };

const FAILED: Result = {
  data: null,
  error: { message: 'fetch failed', code: 'ECONNRESET' },
};

/**
 * A chainable Supabase stub. Every builder method returns the chain; awaiting
 * the chain yields the next queued result (the last one repeats), which is how
 * a method that makes several reads can be given a different outcome for each.
 *
 * The CLIENT itself is a plain object on purpose. A thenable client would be
 * unwrapped by `await createServerSupabaseClient()` and the service would
 * receive the result row instead of the client.
 */
function stubClient(...results: Result[]) {
  let i = 0;
  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const result = results[Math.min(i, results.length - 1)];
          i += 1;
          return (resolve: (v: unknown) => unknown) => resolve(result);
        }
        return () => chain;
      },
    },
  );
  return { from: () => chain, rpc: () => chain };
}

const SURFACE = { throwOnError: true };

beforeEach(() => {
  serverClient.current = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getCurrentCycleServer — the read behind "no active cycle"', () => {
  it('degrades to null by default, as every existing caller expects', async () => {
    serverClient.current = stubClient(FAILED);
    await expect(AiPulseLearnerService.getCurrentCycleServer()).resolves.toBeNull();
  });

  it('raises AiPulseReadError when the caller opted in', async () => {
    serverClient.current = stubClient(FAILED);
    await expect(
      AiPulseLearnerService.getCurrentCycleServer(SURFACE),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('still returns null for a successful read that found no cycle', async () => {
    // This is the case that must NOT look like a failure: the week genuinely
    // has no AI Pulse cycle yet.
    serverClient.current = stubClient({ data: null, error: null });
    await expect(
      AiPulseLearnerService.getCurrentCycleServer(SURFACE),
    ).resolves.toBeNull();
  });
});

describe('listCyclesServer', () => {
  it('degrades to an empty list by default', async () => {
    serverClient.current = stubClient(FAILED);
    await expect(AiPulseLearnerService.listCyclesServer()).resolves.toEqual([]);
  });

  it('raises when the caller opted in', async () => {
    serverClient.current = stubClient(FAILED);
    await expect(
      AiPulseLearnerService.listCyclesServer(12, SURFACE),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });
});

describe('getCycleByIdServer', () => {
  it('raises when the deep-linked cycle read fails', async () => {
    serverClient.current = stubClient(FAILED);
    // (getCycleByIdServer builds its own client)
    await expect(
      AiPulseLearnerService.getCycleByIdServer('cycle-1', SURFACE),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('returns null for a cycle id that simply is not an AI Pulse cycle', async () => {
    serverClient.current = stubClient({ data: null, error: null });
    await expect(
      AiPulseLearnerService.getCycleByIdServer('not-a-cycle', SURFACE),
    ).resolves.toBeNull();
  });
});

describe('getMyAttendance — an unread row vs a learner who did not join', () => {
  it('degrades to pending by default when the read fails', async () => {
    const result = await AiPulseLearnerService.getMyAttendance(
      'cycle-1',
      'profile-1',
      stubClient(FAILED),
    );
    expect(result.state).toBe('pending');
  });

  it('raises when the read fails and the caller opted in', async () => {
    await expect(
      AiPulseLearnerService.getMyAttendance(
        'cycle-1',
        'profile-1',
        stubClient(FAILED),
        SURFACE,
      ),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('returns pending WITHOUT raising when the learner has no row', async () => {
    // A learner who has not joined this week's session is an answer, not a
    // failure — it must never light the retry notice.
    const result = await AiPulseLearnerService.getMyAttendance(
      'cycle-1',
      'profile-1',
      stubClient({ data: null, error: null }),
      SURFACE,
    );
    expect(result.state).toBe('pending');
  });
});

describe('getMyTeam — an unreadable table vs an event with no teams', () => {
  it('raises when the registrations read fails and the caller opted in', async () => {
    await expect(
      AiPulseLearnerService.getMyTeam(
        'cycle-1',
        'profile-1',
        stubClient(FAILED),
        SURFACE,
      ),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('degrades to null by default when that read fails', async () => {
    await expect(
      AiPulseLearnerService.getMyTeam('cycle-1', 'profile-1', stubClient(FAILED)),
    ).resolves.toBeNull();
  });

  it('returns null WITHOUT raising when the cycle has no registrations', async () => {
    await expect(
      AiPulseLearnerService.getMyTeam(
        'cycle-1',
        'profile-1',
        stubClient({ data: [], error: null }),
        SURFACE,
      ),
    ).resolves.toBeNull();
  });

  it('returns null WITHOUT raising when the learner is on no team', async () => {
    await expect(
      AiPulseLearnerService.getMyTeam(
        'cycle-1',
        'profile-1',
        // registrations found, then no membership row for this learner
        stubClient(
          { data: [{ id: 'reg-1', team_name: 'Alpha' }], error: null },
          { data: null, error: null },
        ),
        SURFACE,
      ),
    ).resolves.toBeNull();
  });
});

describe('getMyStreak', () => {
  it('raises when the cycle list read fails and the caller opted in', async () => {
    await expect(
      AiPulseLearnerService.getMyStreak('profile-1', stubClient(FAILED), SURFACE),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('raises when the batched attendance read fails', async () => {
    await expect(
      AiPulseLearnerService.getMyStreak(
        'profile-1',
        stubClient(
          { data: [{ id: 'c1', start_date: '2026-07-27' }], error: null },
          FAILED,
        ),
        SURFACE,
      ),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('degrades to 0 by default when a read fails', async () => {
    await expect(
      AiPulseLearnerService.getMyStreak('profile-1', stubClient(FAILED)),
    ).resolves.toBe(0);
  });

  it('returns 0 WITHOUT raising when there are simply no cycles yet', async () => {
    await expect(
      AiPulseLearnerService.getMyStreak(
        'profile-1',
        stubClient({ data: [], error: null }),
        SURFACE,
      ),
    ).resolves.toBe(0);
  });
});

describe('getLatestGoldServer', () => {
  it('raises when the cycle read fails and the caller opted in', async () => {
    await expect(
      AiPulseLearnerService.getLatestGoldServer(stubClient(FAILED), SURFACE),
    ).rejects.toBeInstanceOf(AiPulseReadError);
  });

  it('returns null WITHOUT raising when no cycle has been scored yet', async () => {
    await expect(
      AiPulseLearnerService.getLatestGoldServer(
        stubClient({ data: [], error: null }),
        SURFACE,
      ),
    ).resolves.toBeNull();
  });
});

describe('AiPulseReadError', () => {
  it('names the read that failed and keeps the cause', async () => {
    serverClient.current = stubClient(FAILED);
    const error = await AiPulseLearnerService.getCurrentCycleServer(
      SURFACE,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiPulseReadError);
    expect(error.read).toBe('getCurrentCycleServer');
    expect(error.cause).toEqual(FAILED.error);
  });
});
