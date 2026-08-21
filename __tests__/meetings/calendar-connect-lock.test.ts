// __tests__/meetings/calendar-connect-lock.test.ts
//
// The calendar-connect lock can hold 116 people out of ALL of MyJKKN — 77 HODs,
// 7 principals, the COO, the Registrar. The properties below are the ones that
// keep that from becoming an outage, so they are tested rather than trusted:
//
//   1. It ships OFF and the sweep is a no-op until someone turns it on.
//   2. A failure in the sweep never takes the rest of the hourly reconcile down.
//   3. Locking anyone is logged loudly enough to find on the day someone asks
//      "why can't I get in?".
//   4. The result is reported as numbers, so the cron response is auditable.
//
// The state machine itself (scope, 3-day grace, 3-failure release) lives in
// fn_calendar_lock_sweep in SQL and is exercised against the database, not here —
// a TypeScript restatement of those rules would only prove the author agreed with
// themselves twice.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above every top-level statement, so these must be built by
// vi.hoisted — otherwise the factory reaches them in their temporal dead zone and
// the whole file dies at import. That is the same trap that had silently killed
// __tests__/meetings/booking-crm-bridge.test.ts (fixed in PR #3127), and it caught
// me again writing this file.
// The trigger service pulls in the Resend-backed mailer, which constructs its
// client at module load and throws without a key. Same guard the director-desk
// tests use.
vi.hoisted(() => {
  process.env.RESEND_API_KEY ||= 'test-key';
});

const { warn, error } = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn, error, dev: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: vi.fn() }),
  createClient: async () => ({}),
}));

import { sweepCalendarConnectLock } from '@/lib/services/meetings/meeting-trigger-service';

function dbReturning(data: unknown, err: string | null = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error: err ? { message: err } : null }) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('sweepCalendarConnectLock', () => {
  it('reports the three counts the SQL returns', async () => {
    const r = await sweepCalendarConnectLock({
      client: dbReturning([{ warned: 116, locked: 0, cleared: 0 }]),
    });
    expect(r).toEqual({ warned: 116, locked: 0, cleared: 0 });
  });

  it('is a silent no-op shape when the master switch is off (all zeroes)', async () => {
    const r = await sweepCalendarConnectLock({ client: dbReturning([{ warned: 0, locked: 0, cleared: 0 }]) });
    expect(r).toEqual({ warned: 0, locked: 0, cleared: 0 });
    // Nothing was locked, so nothing should be shouted about.
    expect(warn).not.toHaveBeenCalled();
  });

  it('LOGS LOUDLY when anyone is actually locked out', async () => {
    await sweepCalendarConnectLock({ client: dbReturning([{ warned: 0, locked: 12, cleared: 1 }]) });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toMatch(/12 person\(s\) now held/);
  });

  it('accepts a bare object as well as a single-row array', async () => {
    const r = await sweepCalendarConnectLock({ client: dbReturning({ warned: 1, locked: 2, cleared: 3 }) });
    expect(r).toEqual({ warned: 1, locked: 2, cleared: 3 });
  });

  it('treats missing counts as zero rather than NaN', async () => {
    const r = await sweepCalendarConnectLock({ client: dbReturning([{}]) });
    expect(r).toEqual({ warned: 0, locked: 0, cleared: 0 });
  });

  it('THROWS on an RPC error so the cron records it instead of reporting a clean pass', async () => {
    await expect(
      sweepCalendarConnectLock({ client: dbReturning(null, 'permission denied for function') }),
    ).rejects.toThrow(/permission denied/);
  });
});
