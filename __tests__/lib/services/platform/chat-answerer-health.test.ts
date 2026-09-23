/**
 * "Both answering computers are down" pager — lib/services/platform/chat-answerer-health.ts
 *
 * Covers every outage state (unknown / answering / down_idle / both_down,
 * incl. one row never stamped, claim evidence overriding a stale or frozen
 * heartbeat, and the "a question must be waiting" impact rule) and the
 * ONCE-PER-OUTAGE dedupe. The dedupe is exercised
 * against a stand-in for fanoutNotification that behaves like the real one's
 * UNIQUE idempotency_key (a repeat key → skipped:'idempotent', nothing sent),
 * so "paged once" is counted, not assumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent: Array<{ idempotencyKey?: string; userIds: string[]; title: string; body: string }> = [];
const seenKeys = new Set<string>();

vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: vi.fn(async (_client: unknown, opts: any) => {
    if (opts.idempotencyKey && seenKeys.has(opts.idempotencyKey)) {
      return { notified: 0, skipped: 'idempotent' };
    }
    if (opts.idempotencyKey) seenKeys.add(opts.idempotencyKey);
    sent.push(opts);
    return { notified: opts.userIds.length, notificationId: 'n1' };
  }),
}));

import {
  evaluateAnswererOutage,
  chatAnswererOutageAlert,
  ANSWERER_DOWN_AFTER_MS,
  QUESTION_WAITING_ALERT_AFTER_MS,
  WINDOWS_ANSWERER_ROW,
  MAC_STANDBY_ANSWERER_ROW,
  MAC_STANDBY_RUNNER_PREFIX,
  CHAT_JOB_TYPE,
  type AnswererEvidence,
} from '@/lib/services/platform/chat-answerer-health';

const NOW = Date.parse('2026-09-23T10:00:00.000Z');
const minAgo = (m: number, from = NOW) => new Date(from - m * 60_000).toISOString();

/** Evidence with defaults: nothing ever seen, nothing waiting. */
const ev = (e: Partial<AnswererEvidence>): AnswererEvidence => ({
  windowsHeartbeat: null,
  macHeartbeat: null,
  windowsLastClaim: null,
  oldestWaitingQuestion: null,
  ...e,
});

describe('evaluateAnswererOutage — every state', () => {
  it('thresholds are 15 min of silence and a 10-min wait', () => {
    expect(ANSWERER_DOWN_AFTER_MS).toBe(15 * 60_000);
    expect(QUESTION_WAITING_ALERT_AFTER_MS).toBe(10 * 60_000);
  });

  it('neither heartbeat ever stamped → unknown (silent), even with a question waiting', () => {
    const e = evaluateAnswererOutage(ev({ oldestWaitingQuestion: minAgo(30) }), NOW);
    expect(e.state).toBe('unknown');
    expect(e.outageKey).toBeUndefined();
  });

  it('unparseable timestamps count as never stamped', () => {
    expect(evaluateAnswererOutage(ev({ windowsHeartbeat: 'garbage', macHeartbeat: undefined }), NOW).state).toBe('unknown');
  });

  it('Windows heartbeat fresh → answering', () => {
    expect(evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(1) }), NOW).state).toBe('answering');
  });

  it('Windows heartbeat in the FUTURE (its clock runs fast) → answering', () => {
    const e = evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(-1), oldestWaitingQuestion: minAgo(30) }), NOW);
    expect(e.state).toBe('answering');
  });

  it('Windows long dead but Mac fresh → answering (the backup is covering)', () => {
    expect(
      evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(120), macHeartbeat: minAgo(1), oldestWaitingQuestion: minAgo(30) }), NOW).state,
    ).toBe('answering');
  });

  it('FROZEN Windows heartbeat but Windows claimed a question 5 min ago → answering, no page', () => {
    const e = evaluateAnswererOutage(
      ev({ windowsHeartbeat: minAgo(13 * 24 * 60), macHeartbeat: minAgo(60), windowsLastClaim: minAgo(5), oldestWaitingQuestion: minAgo(11) }),
      NOW,
    );
    expect(e.state).toBe('answering');
    expect(e.outageKey).toBeUndefined();
  });

  it('both silent 14 min → not down yet', () => {
    expect(
      evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(30), macHeartbeat: minAgo(14), oldestWaitingQuestion: minAgo(30) }), NOW).state,
    ).toBe('answering');
  });

  it('exactly 15 min is not "more than 15 min"', () => {
    expect(
      evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(15), macHeartbeat: minAgo(15), oldestWaitingQuestion: minAgo(30) }), NOW).state,
    ).toBe('answering');
  });

  it('both down but NO question waiting (e.g. 03:00, no traffic) → down_idle, no page', () => {
    const e = evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(120), macHeartbeat: minAgo(90) }), NOW);
    expect(e.state).toBe('down_idle');
    expect(e.outageKey).toBeUndefined();
    expect(e.waitingMin).toBeNull();
  });

  it('both down, a question waiting only 10 min → down_idle (not MORE than 10)', () => {
    expect(
      evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(60), macHeartbeat: minAgo(60), oldestWaitingQuestion: minAgo(10) }), NOW).state,
    ).toBe('down_idle');
  });

  it('both down AND a question waiting 11 min → both_down, keyed on the LATEST sign of life', () => {
    const e = evaluateAnswererOutage(
      ev({ windowsHeartbeat: minAgo(60), macHeartbeat: minAgo(20), windowsLastClaim: minAgo(40), oldestWaitingQuestion: minAgo(11) }),
      NOW,
    );
    expect(e.state).toBe('both_down');
    expect(e.downForMin).toBe(20);
    expect(e.waitingMin).toBe(11);
    expect(e.outageKey).toBe(`ai-chat-answerers-down:${minAgo(20)}`);
  });

  it('an old Windows claim is a sign of life for the key, not proof of answering', () => {
    const e = evaluateAnswererOutage(
      ev({ windowsHeartbeat: minAgo(60), macHeartbeat: minAgo(60), windowsLastClaim: minAgo(16), oldestWaitingQuestion: minAgo(12) }),
      NOW,
    );
    expect(e.state).toBe('both_down');
    expect(e.outageKey).toBe(`ai-chat-answerers-down:${minAgo(16)}`);
  });

  it('Windows stale, Mac never stamped, question waiting → both_down', () => {
    const e = evaluateAnswererOutage(ev({ windowsHeartbeat: minAgo(20), oldestWaitingQuestion: minAgo(12) }), NOW);
    expect(e.state).toBe('both_down');
    expect(e.outageKey).toBe(`ai-chat-answerers-down:${minAgo(20)}`);
  });

  it('Windows never stamped, Mac stale, question waiting → both_down', () => {
    expect(
      evaluateAnswererOutage(ev({ macHeartbeat: minAgo(20), oldestWaitingQuestion: minAgo(12) }), NOW).state,
    ).toBe('both_down');
  });

  it('the same instant in PostgREST format and ISO format gives ONE key', () => {
    const iso = '2026-09-23T09:40:00.000Z';
    const pgrst = '2026-09-23T09:40:00+00:00';
    const w = minAgo(11);
    expect(evaluateAnswererOutage(ev({ windowsHeartbeat: pgrst, oldestWaitingQuestion: w }), NOW).outageKey).toBe(
      evaluateAnswererOutage(ev({ windowsHeartbeat: iso, oldestWaitingQuestion: w }), NOW).outageKey,
    );
  });
});

interface FakeState {
  win: string | null;
  mac: string | null;
  winClaim?: string | null;
  waiting?: string | null;
  supers?: string[];
  readError?: string;
  claimError?: string;
  waitingError?: string;
}

/**
 * Minimal service-role client stand-in: the three tables and the exact query
 * shapes used. The filters are ASSERTED, so a query that forgot to exclude the
 * Mac runners or to require "pending and unclaimed" fails here.
 */
function fakeAdmin(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'ai_routine_schedules') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              if (state.readError) return { data: null, error: { message: state.readError } };
              expect(ids).toEqual([WINDOWS_ANSWERER_ROW, MAC_STANDBY_ANSWERER_ROW]);
              const rows = [];
              if (state.win !== undefined) rows.push({ routine_id: WINDOWS_ANSWERER_ROW, last_fired_at: state.win });
              if (state.mac !== undefined) rows.push({ routine_id: MAC_STANDBY_ANSWERER_ROW, last_fired_at: state.mac });
              return { data: rows, error: null };
            },
          }),
        };
      }
      if (table === 'ai_jobs') {
        const filters: string[] = [];
        let cols = '';
        const chain: any = {
          select: (c: string) => ((cols = c), chain),
          eq: (c: string, v: unknown) => (filters.push(`eq:${c}=${v}`), chain),
          not: (c: string, op: string, v: unknown) => (filters.push(`not:${c}.${op}=${v}`), chain),
          is: (c: string, v: unknown) => (filters.push(`is:${c}=${v}`), chain),
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            expect(filters).toContain(`eq:job_type=${CHAT_JOB_TYPE}`);
            if (cols === 'claimed_at') {
              expect(filters).toContain(`not:claimed_by.like=${MAC_STANDBY_RUNNER_PREFIX}%`);
              expect(filters).toContain('not:claimed_at.is=null');
              if (state.claimError) return { data: null, error: { message: state.claimError } };
              return { data: state.winClaim ? { claimed_at: state.winClaim } : null, error: null };
            }
            if (cols === 'requested_at') {
              expect(filters).toContain('eq:status=pending');
              expect(filters).toContain('is:claimed_at=null');
              if (state.waitingError) return { data: null, error: { message: state.waitingError } };
              return { data: state.waiting ? { requested_at: state.waiting } : null, error: null };
            }
            throw new Error(`unexpected ai_jobs select ${cols}`);
          },
        };
        return chain;
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: async (col: string, val: unknown) => {
              expect([col, val]).toEqual(['is_super_admin', true]);
              return { data: (state.supers ?? ['sa-1', 'sa-2']).map((id) => ({ id })), error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('chatAnswererOutageAlert — once per outage, only with real impact', () => {
  beforeEach(() => {
    sent.length = 0;
    seenKeys.clear();
  });

  it('pages every super-admin ONCE across many sweeps of the same outage', async () => {
    const st = { win: minAgo(40), mac: minAgo(25), winClaim: minAgo(300), waiting: minAgo(20) };
    // Four 15-minute sweeps while both stay down: the signs of life never move.
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await chatAnswererOutageAlert(fakeAdmin(st), NOW + i * 15 * 60_000));
    }
    expect(sent).toHaveLength(1);
    expect(sent[0].userIds).toEqual(['sa-1', 'sa-2']);
    expect(results[0]).toMatchObject({ state: 'both_down', alerted: true, waiting_min: 20 });
    for (const r of results.slice(1)) expect(r).toMatchObject({ alerted: false, idempotent: true });
  });

  it('a NEW outage (a computer came back, then died again) pages again', async () => {
    await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(40), mac: minAgo(25), waiting: minAgo(20) }), NOW);
    // The Mac came back and answered until 16 min ago — a different outage.
    const later = NOW + 60 * 60_000;
    await chatAnswererOutageAlert(
      fakeAdmin({ win: minAgo(100, later), mac: minAgo(16, later), waiting: minAgo(12, later) }),
      later,
    );
    expect(sent).toHaveLength(2);
    expect(sent[0].idempotencyKey).not.toBe(sent[1].idempotencyKey);
  });

  it('no page while one computer is answering', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(60), mac: minAgo(1), waiting: minAgo(20) }), NOW);
    expect(r).toMatchObject({ state: 'answering', alerted: false });
    expect(sent).toHaveLength(0);
  });

  it('no page on a frozen Windows heartbeat while Windows is still picking up questions', async () => {
    const r = await chatAnswererOutageAlert(
      fakeAdmin({ win: minAgo(13 * 24 * 60), mac: minAgo(60), winClaim: minAgo(3), waiting: minAgo(11) }),
      NOW,
    );
    expect(r).toMatchObject({ state: 'answering', alerted: false, windows_last_claim: minAgo(3) });
    expect(sent).toHaveLength(0);
  });

  it('no page when both are down but nobody is waiting', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(60), mac: minAgo(60) }), NOW);
    expect(r).toMatchObject({ state: 'down_idle', alerted: false, waiting_min: null });
    expect(sent).toHaveLength(0);
  });

  it('no page when neither row has ever been stamped (inert)', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: null, mac: null, waiting: minAgo(20) }), NOW);
    expect(r).toMatchObject({ state: 'unknown', alerted: false });
    expect(sent).toHaveLength(0);
  });

  it('Mac never checked in: the message says so plainly, with the wait and the next step', async () => {
    await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(30), mac: null, waiting: minAgo(14) }), NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain('the Mac backup has never checked in');
    expect(sent[0].body).toContain('waiting about 14 min');
    expect(sent[0].body).toContain('check that the Mac backup is running');
    expect(sent[0].body).not.toMatch(/\bstudents?\b|\bstaff\b/i);
  });

  it.each([
    ['heartbeat', { readError: 'boom' }, 'heartbeat read failed: boom'],
    ['last-claim', { claimError: 'boom' }, 'last-claim read failed: boom'],
    ['waiting-question', { waitingError: 'boom' }, 'waiting-question read failed: boom'],
  ])('a %s read error reports checked:false and pages nobody (never throws)', async (_n, err, msg) => {
    const r = await chatAnswererOutageAlert(
      fakeAdmin({ win: minAgo(60), mac: minAgo(60), waiting: minAgo(20), ...err }),
      NOW,
    );
    expect(r).toEqual({ checked: false, error: msg });
    expect(sent).toHaveLength(0);
  });

  it('no super-admins → nothing sent, reason recorded', async () => {
    const r = await chatAnswererOutageAlert(
      fakeAdmin({ win: minAgo(30), mac: minAgo(30), waiting: minAgo(20), supers: [] }),
      NOW,
    );
    expect(r).toMatchObject({ alerted: false });
    expect(String(r.error)).toContain('no recipients');
    expect(sent).toHaveLength(0);
  });
});
