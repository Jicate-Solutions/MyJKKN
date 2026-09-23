/**
 * "Both answering computers are down" pager — lib/services/platform/chat-answerer-health.ts
 *
 * Covers every outage state (unknown / answering / both_down, incl. one row
 * never stamped) and the ONCE-PER-OUTAGE dedupe. The dedupe is exercised
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
  BOTH_DOWN_ALERT_AFTER_MS,
  WINDOWS_ANSWERER_ROW,
  MAC_STANDBY_ANSWERER_ROW,
} from '@/lib/services/platform/chat-answerer-health';

const NOW = Date.parse('2026-09-23T10:00:00.000Z');
const minAgo = (m: number, from = NOW) => new Date(from - m * 60_000).toISOString();

describe('evaluateAnswererOutage — every state', () => {
  it('neither ever stamped → unknown (silent)', () => {
    const e = evaluateAnswererOutage(null, null, NOW);
    expect(e.state).toBe('unknown');
    expect(e.outageKey).toBeUndefined();
  });

  it('unparseable timestamps count as never stamped', () => {
    expect(evaluateAnswererOutage('garbage', undefined, NOW).state).toBe('unknown');
  });

  it('Windows fresh → answering', () => {
    expect(evaluateAnswererOutage(minAgo(1), null, NOW).state).toBe('answering');
  });

  it('Windows long dead but Mac fresh → answering (the backup is covering)', () => {
    expect(evaluateAnswererOutage(minAgo(120), minAgo(1), NOW).state).toBe('answering');
  });

  it('both stale but the later one only 9 min ago → not yet paged', () => {
    expect(evaluateAnswererOutage(minAgo(30), minAgo(9), NOW).state).toBe('answering');
  });

  it('exactly 10 min is not "more than 10 min"', () => {
    const e = evaluateAnswererOutage(minAgo(10), minAgo(10), NOW);
    expect(BOTH_DOWN_ALERT_AFTER_MS).toBe(10 * 60_000);
    expect(e.state).toBe('answering');
  });

  it('both stale > 10 min → both_down, keyed on the LATER heartbeat', () => {
    const e = evaluateAnswererOutage(minAgo(30), minAgo(11), NOW);
    expect(e.state).toBe('both_down');
    expect(e.downForMin).toBe(11);
    expect(e.outageKey).toBe(`ai-chat-answerers-down:${minAgo(11)}`);
  });

  it('Windows stale, Mac never stamped → both_down', () => {
    const e = evaluateAnswererOutage(minAgo(15), null, NOW);
    expect(e.state).toBe('both_down');
    expect(e.outageKey).toBe(`ai-chat-answerers-down:${minAgo(15)}`);
  });

  it('Windows never stamped, Mac stale → both_down', () => {
    expect(evaluateAnswererOutage(null, minAgo(15), NOW).state).toBe('both_down');
  });

  it('the same instant in PostgREST format and ISO format gives ONE key', () => {
    const iso = '2026-09-23T09:40:00.000Z';
    const pgrst = '2026-09-23T09:40:00+00:00';
    expect(evaluateAnswererOutage(pgrst, null, NOW).outageKey).toBe(
      evaluateAnswererOutage(iso, null, NOW).outageKey,
    );
  });
});

/** Minimal service-role client stand-in: two tables, the two query shapes used. */
function fakeAdmin(state: { win: string | null; mac: string | null; supers?: string[]; readError?: string }) {
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

describe('chatAnswererOutageAlert — once per outage', () => {
  beforeEach(() => {
    sent.length = 0;
    seenKeys.clear();
  });

  it('pages every super-admin ONCE across many sweeps of the same outage', async () => {
    const hb = { win: minAgo(40), mac: minAgo(25) };
    // Four 15-minute sweeps while both stay down: the heartbeats never move.
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await chatAnswererOutageAlert(fakeAdmin(hb), NOW + i * 15 * 60_000));
    }
    expect(sent).toHaveLength(1);
    expect(sent[0].userIds).toEqual(['sa-1', 'sa-2']);
    expect(results[0]).toMatchObject({ state: 'both_down', alerted: true });
    for (const r of results.slice(1)) expect(r).toMatchObject({ alerted: false, idempotent: true });
  });

  it('a NEW outage (a computer came back, then died again) pages again', async () => {
    await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(40), mac: minAgo(25) }), NOW);
    // The Mac came back and answered until 12 min ago — a different outage.
    const later = NOW + 60 * 60_000;
    await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(100, later), mac: minAgo(12, later) }), later);
    expect(sent).toHaveLength(2);
    expect(sent[0].idempotencyKey).not.toBe(sent[1].idempotencyKey);
  });

  it('no page while one computer is answering', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(60), mac: minAgo(1) }), NOW);
    expect(r).toMatchObject({ state: 'answering', alerted: false });
    expect(sent).toHaveLength(0);
  });

  it('no page when neither row has ever been stamped (inert)', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: null, mac: null }), NOW);
    expect(r).toMatchObject({ state: 'unknown', alerted: false });
    expect(sent).toHaveLength(0);
  });

  it('Mac never checked in: the message says so plainly', async () => {
    await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(30), mac: null }), NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain('the Mac backup has never checked in');
  });

  it('a read error reports checked:false and pages nobody (never throws)', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: null, mac: null, readError: 'boom' }), NOW);
    expect(r).toEqual({ checked: false, error: 'boom' });
    expect(sent).toHaveLength(0);
  });

  it('no super-admins → nothing sent, reason recorded', async () => {
    const r = await chatAnswererOutageAlert(fakeAdmin({ win: minAgo(30), mac: minAgo(30), supers: [] }), NOW);
    expect(r).toMatchObject({ alerted: false });
    expect(String(r.error)).toContain('no recipients');
    expect(sent).toHaveLength(0);
  });
});
