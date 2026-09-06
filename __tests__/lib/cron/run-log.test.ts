// =====================================================================
// withCronRun — the run log for the static vercel.json cron lane
// =====================================================================
// The behaviours under test are the ones that decide whether the alarm this
// helper feeds is trustworthy:
//
//   * an UNAUTHORIZED probe must not be logged. /api/cron/* is publicly
//     routable, so without this gate anyone could curl a cron endpoint, collect
//     401s and manufacture a failure streak that pages the super admins.
//   * a run is OPENED before the work and CLOSED after it, so a run that never
//     comes back stays visible as an unclosed row rather than as no row.
//   * a handler that throws is recorded as a failure AND still throws, so Next
//     keeps producing its normal 500.
//   * logging never changes what the caller sees, and a logging failure never
//     fails the tick.
// =====================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

import { withCronRun, isCronAuthorized, statusIsOk } from '@/lib/cron/run-log';

const SECRET = 'test-cron-secret';

/** Minimal NextRequest stand-in — withCronRun only reads these three things. */
function req(opts: { secret?: string; bearer?: string; path?: string } = {}): NextRequest {
  const params = new URLSearchParams();
  if (opts.secret !== undefined) params.set('secret', opts.secret);
  return {
    headers: { get: (k: string) => (k === 'authorization' ? (opts.bearer ?? null) : null) },
    nextUrl: { searchParams: params, pathname: opts.path ?? '/api/cron/demo' },
  } as unknown as NextRequest;
}

beforeEach(() => {
  rpc.mockReset();
  // Default: the open call returns a run id, the close call returns it again.
  rpc.mockResolvedValue({ data: 'run-1', error: null });
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('isCronAuthorized', () => {
  it('accepts the Bearer header form the dispatcher sends', () => {
    expect(isCronAuthorized(req({ bearer: `Bearer ${SECRET}` }))).toBe(true);
  });

  it('accepts the ?secret= form most vercel.json entries use', () => {
    expect(isCronAuthorized(req({ secret: SECRET }))).toBe(true);
  });

  it('rejects a wrong secret and a missing one', () => {
    expect(isCronAuthorized(req({ secret: 'nope' }))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });

  it('rejects everything when CRON_SECRET is unset, rather than logging everything', () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req({ secret: 'anything' }))).toBe(false);
    expect(isCronAuthorized(req({ bearer: 'Bearer anything' }))).toBe(false);
  });
});

describe('statusIsOk', () => {
  it('treats < 400 as success and 400+ as failure', () => {
    expect(statusIsOk(200)).toBe(true);
    expect(statusIsOk(399)).toBe(true);
    expect(statusIsOk(400)).toBe(false);
    expect(statusIsOk(500)).toBe(false);
  });
});

describe('withCronRun', () => {
  it('does NOT log an unauthorized request — a 401 must not become a failure streak', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: false }, { status: 401 }));
    const wrapped = withCronRun('demo-job', handler);

    const res = await wrapped(req({ secret: 'wrong' }));

    expect(res.status).toBe(401);
    expect(handler).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('opens a run before the work and closes it ok=true on a 200', async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true, count: 3 }));
    const wrapped = withCronRun('demo-job', handler);

    const res = await wrapped(req({ secret: SECRET, path: '/api/cron/demo' }));

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);

    const [openFn, openArgs] = rpc.mock.calls[0];
    expect(openFn).toBe('fn_cron_record_run');
    expect(openArgs).toMatchObject({ p_job_key: 'demo-job', p_path: '/api/cron/demo' });
    // The OPEN call must carry no run id and no outcome — that is what makes it
    // an open row that a dead run leaves behind.
    expect(openArgs.p_run_id).toBeUndefined();
    expect(openArgs.p_ok).toBeUndefined();

    const [, closeArgs] = rpc.mock.calls[1];
    expect(closeArgs).toMatchObject({
      p_job_key: 'demo-job',
      p_run_id: 'run-1',
      p_ok: true,
      p_status_code: 200,
    });
  });

  it('opens BEFORE the handler runs, not after', async () => {
    const order: string[] = [];
    rpc.mockImplementation(async () => {
      order.push('rpc');
      return { data: 'run-1', error: null };
    });
    const handler = vi.fn(async () => {
      order.push('handler');
      return NextResponse.json({ ok: true });
    });

    await withCronRun('demo-job', handler)(req({ secret: SECRET }));

    expect(order).toEqual(['rpc', 'handler', 'rpc']);
  });

  it('closes ok=false and captures the error body on a 500', async () => {
    const handler = vi.fn(async () =>
      NextResponse.json({ ok: false, error: 'statement timeout' }, { status: 500 }),
    );

    const res = await withCronRun('demo-job', handler)(req({ secret: SECRET }));

    expect(res.status).toBe(500);
    const [, closeArgs] = rpc.mock.calls[1];
    expect(closeArgs).toMatchObject({
      p_ok: false,
      p_status_code: 500,
      p_error: 'statement timeout',
    });
  });

  it('records a thrown handler as a failure and still rethrows', async () => {
    const boom = new Error('kaboom');
    const handler = vi.fn(async () => {
      throw boom;
    });

    await expect(withCronRun('demo-job', handler)(req({ secret: SECRET }))).rejects.toThrow('kaboom');

    const [, closeArgs] = rpc.mock.calls[1];
    expect(closeArgs).toMatchObject({ p_ok: false, p_status_code: 500, p_error: 'kaboom' });
  });

  it('never fails the tick when logging itself fails', async () => {
    rpc.mockRejectedValue(new Error('db down'));
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const res = await withCronRun('demo-job', handler)(req({ secret: SECRET }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('leaves the response body intact for the caller after peeking at the error', async () => {
    const handler = vi.fn(async () =>
      NextResponse.json({ ok: false, error: 'boom' }, { status: 503 }),
    );

    const res = await withCronRun('demo-job', handler)(req({ secret: SECRET }));

    // peekError clones; the original stream must still be readable downstream.
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'boom' });
  });

  it('skips the close call when the open call could not record a run', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const res = await withCronRun('demo-job', handler)(req({ secret: SECRET }));

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1); // open attempted, close skipped
  });
});
