/**
 * Adoption loop — the four write routes.
 *
 *   POST /api/admin/adoption/register   label a shipped feature
 *   POST /api/admin/adoption/ask-why    ask the non-users why not
 *   POST /api/admin/adoption/propose    raise a simplify/retrain/retire card
 *   POST /api/admin/adoption/decide     the Director's tap
 *
 * All four are thin on purpose: authorization is the DATABASE's, enforced by a
 * SECURITY DEFINER body that raises 42501 unless the caller is a super admin.
 * So the load-bearing assertions here are about the SEAM, not the rules:
 *
 *   - a signed-out caller never reaches an RPC at all (no accidental write
 *     with an anonymous session),
 *   - a 42501 from the database becomes an explicit 403 and not a masked 500
 *     — a silent failure would leave a super-admin page that looks like it
 *     worked (CLAUDE.md #27),
 *   - a {success:false} answer becomes a 400 carrying the database's own
 *     reason, so "feature is younger than 14 days" reaches the screen instead
 *     of being flattened into a generic error,
 *   - and the routes run as the SIGNED-IN USER's client, never the service
 *     role, which is what keeps the permission check in one place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handlers are imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'admin-1' };

/** What the next rpc() call answers. Each test sets one of the two. */
let rpcData: unknown = null;
let rpcError: { code?: string; message: string } | null = null;

// Typed parameters on purpose: an untyped `vi.fn(() => ...)` gives mock.calls
// the tuple type `[]`, and every `mock.calls[0][1]` assertion below then fails
// the type check even though the test passes at runtime.
type RpcArgs = Record<string, unknown> | undefined;

const userRpc = vi.fn((_name: string, _args?: RpcArgs) =>
  Promise.resolve({ data: rpcData, error: rpcError })
);
const serviceRpc = vi.fn((_name: string, _args?: RpcArgs) =>
  Promise.resolve({ data: null, error: null })
);

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: {
        getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }),
      },
      rpc: userRpc,
    }),
  createServiceRoleClient: () => ({ rpc: serviceRpc }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// Handlers imported AFTER the mocks.
import { POST as registerPost } from '@/app/api/admin/adoption/register/route';
import { POST as syncPost } from '@/app/api/admin/adoption/sync/route';
import { POST as askWhyPost } from '@/app/api/admin/adoption/ask-why/route';
import { POST as proposePost } from '@/app/api/admin/adoption/propose/route';
import { POST as decidePost } from '@/app/api/admin/adoption/decide/route';

type Handler = (request: Request) => Promise<Response>;

function post(path: string, body: unknown) {
  return new Request(`https://jkkn.ai/api/admin/adoption/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The smallest body each route accepts, so a test can vary one thing. */
const VALID_BODY: Record<string, Record<string, unknown>> = {
  register: {
    feature_key: 'gate.pass_issue',
    title: 'Gate pass',
    core_action: 'issue a gate pass',
  },
  'ask-why': { feature_key: 'gate.pass_issue' },
  propose: { feature_key: 'gate.pass_issue', option: 'simplify' },
  decide: { proposal_id: '11111111-1111-4111-8111-111111111111', option: 'keep' },
  sync: { days: 30 },
};

const ROUTES: Array<{ path: string; handler: Handler; rpc: string }> = [
  { path: 'register', handler: registerPost, rpc: 'fn_adoption_register' },
  { path: 'sync', handler: syncPost, rpc: 'fn_adoption_sync_usage_events' },
  { path: 'ask-why', handler: askWhyPost, rpc: 'fn_adoption_ask_why' },
  { path: 'propose', handler: proposePost, rpc: 'fn_adoption_propose' },
  { path: 'decide', handler: decidePost, rpc: 'fn_adoption_decide' },
];

beforeEach(() => {
  currentUser = { id: 'admin-1' };
  rpcData = { success: true };
  rpcError = null;
  userRpc.mockClear();
  serviceRpc.mockClear();
});

describe('adoption write routes — the shared seam', () => {
  for (const { path, handler, rpc } of ROUTES) {
    describe(`POST /api/admin/adoption/${path}`, () => {
      it('answers 401 without a signed-in user and runs no RPC', async () => {
        currentUser = null;
        const res = await handler(post(path, VALID_BODY[path]));
        expect(res.status).toBe(401);
        expect(userRpc).not.toHaveBeenCalled();
        expect(serviceRpc).not.toHaveBeenCalled();
        expect((await res.json()).error).toBeTruthy();
      });

      it('turns the database refusal (42501) into an explicit 403', async () => {
        rpcError = { code: '42501', message: 'super admin required' };
        const res = await handler(post(path, VALID_BODY[path]));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toMatch(/super administrator/i);
        expect(body.ok).toBeUndefined();
      });

      it('answers 400 with the database’s own reason when success is false', async () => {
        rpcData = { success: false, error: 'feature is younger than 14 days' };
        const res = await handler(post(path, VALID_BODY[path]));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('feature is younger than 14 days');
      });

      it('answers 500, never a 403, when the RPC fails for another reason', async () => {
        rpcError = { code: '08006', message: 'connection failure' };
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await handler(post(path, VALID_BODY[path]));
        expect(res.status).toBe(500);
        spy.mockRestore();
      });

      it('answers 400 on an unreadable body without touching the database', async () => {
        const request = new Request(`https://jkkn.ai/api/admin/adoption/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not json at all',
        });
        const res = await handler(request);
        expect(res.status).toBe(400);
        expect(userRpc).not.toHaveBeenCalled();
      });

      it('runs its own RPC as the signed-in user, never the service role', async () => {
        rpcData = { success: true };
        await handler(post(path, VALID_BODY[path]));
        expect(userRpc).toHaveBeenCalledTimes(1);
        expect(userRpc.mock.calls[0][0]).toBe(rpc);
        expect(serviceRpc).not.toHaveBeenCalled();
      });

      it('never lets a caller cache the answer', async () => {
        const res = await handler(post(path, VALID_BODY[path]));
        expect(res.headers.get('cache-control')).toBe('private, no-store');
      });
    });
  }
});

describe('POST /api/admin/adoption/register', () => {
  it('rejects a body with no feature key before calling the database', async () => {
    const res = await registerPost(post('register', { title: 'Gate pass', core_action: 'issue' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/feature key/i);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('rejects a label with no title or core action', async () => {
    const res = await registerPost(post('register', { feature_key: 'gate.pass_issue' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/core action/i);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('labels a feature and echoes the key back', async () => {
    rpcData = { success: true, feature_key: 'gate.pass_issue' };
    const res = await registerPost(
      post('register', {
        feature_key: 'gate.pass_issue',
        title: 'Gate pass',
        core_action: 'issue a gate pass',
        intended_roles: ['hod', 'principal'],
        module: 'gate',
        source_pr: 3842,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, feature_key: 'gate.pass_issue' });
    expect(userRpc).toHaveBeenCalledWith('fn_adoption_register', {
      p_feature_key: 'gate.pass_issue',
      p_title: 'Gate pass',
      p_core_action: 'issue a gate pass',
      p_intended_roles: ['hod', 'principal'],
      p_module: 'gate',
      p_source_pr: 3842,
      p_shipped_at: null,
      p_cadence: 'weekly',
      p_skip_reason: null,
      p_usage_wired: false,
      p_event_module: null,
      p_event_feature: null,
      p_event_type: null,
    });
  });

  it('passes the usage source through: a recording route and/or a usage-log event', async () => {
    rpcData = { success: true, feature_key: 'attendance.mark' };
    const res = await registerPost(
      post('register', {
        feature_key: 'attendance.mark',
        title: 'Mark attendance',
        core_action: 'mark attendance for a class',
        usage_wired: true,
        usage_event_module: ' academic/attendance ',
        usage_event_feature: 'mark_attendance',
        usage_event_type: '',
      })
    );
    expect(res.status).toBe(200);
    expect(userRpc).toHaveBeenCalledWith(
      'fn_adoption_register',
      expect.objectContaining({
        p_usage_wired: true,
        p_event_module: 'academic/attendance',
        p_event_feature: 'mark_attendance',
        p_event_type: null,
      })
    );
  });

  it('defaults the audience to everyone when no roles are given', async () => {
    rpcData = { success: true, feature_key: 'gate.pass_issue' };
    await registerPost(post('register', VALID_BODY.register));
    expect(userRpc.mock.calls[0][1]).toMatchObject({ p_intended_roles: ['all'] });
  });

  it('judges by the week unless the label says term', async () => {
    // Every feature labelled before cadence existed is weekly, so an absent
    // field must not quietly turn one seasonal.
    rpcData = { success: true, feature_key: 'gate.pass_issue' };
    await registerPost(post('register', VALID_BODY.register));
    expect(userRpc.mock.calls[0][1]).toMatchObject({ p_cadence: 'weekly' });
  });

  it('passes a seasonal label through as term', async () => {
    rpcData = { success: true, feature_key: 'academic.timetable_publish' };
    const res = await registerPost(
      post('register', {
        feature_key: 'academic.timetable_publish',
        title: 'Publish a timetable',
        core_action: 'publish a timetable for a section',
        cadence: 'term',
      })
    );
    expect(res.status).toBe(200);
    expect(userRpc.mock.calls[0][1]).toMatchObject({ p_cadence: 'term' });
  });

  it('refuses a third cadence before the database sees it', async () => {
    // 'yearly' is not a cadence the loop knows. Refusing it here gives a
    // readable sentence instead of a constraint violation from the RPC.
    const res = await registerPost(
      post('register', { ...VALID_BODY.register, cadence: 'yearly' })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/weekly or term/i);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('carries a skip reason through, trimmed', async () => {
    rpcData = { success: true, feature_key: 'ops.nightly_rollup' };
    await registerPost(
      post('register', {
        ...VALID_BODY.register,
        skip_reason: '  a cron job, nobody opens it  ',
      })
    );
    expect(userRpc.mock.calls[0][1]).toMatchObject({
      p_skip_reason: 'a cron job, nobody opens it',
    });
  });

  it('sends null for an empty skip box, which puts a feature back in the numbers', async () => {
    // The database writes whatever it is given, so an empty string would store
    // a blank skip and hide the feature from every headline with no reason
    // shown. Null is what clears the skip.
    rpcData = { success: true, feature_key: 'gate.pass_issue' };
    await registerPost(post('register', { ...VALID_BODY.register, skip_reason: '   ' }));
    expect(userRpc.mock.calls[0][1]).toMatchObject({ p_skip_reason: null });
  });

  it('drops blank and non-text entries from the audience list', async () => {
    rpcData = { success: true, feature_key: 'gate.pass_issue' };
    await registerPost(
      post('register', { ...VALID_BODY.register, intended_roles: ['hod', '  ', 7, null] })
    );
    expect(userRpc.mock.calls[0][1]).toMatchObject({ p_intended_roles: ['hod'] });
  });
});

describe('POST /api/admin/adoption/ask-why', () => {
  it('rejects a body with no feature key before asking anyone anything', async () => {
    const res = await askWhyPost(post('ask-why', {}));
    expect(res.status).toBe(400);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('returns how many people were asked', async () => {
    rpcData = { success: true, asked: 42, notification_id: 'n-1' };
    const res = await askWhyPost(post('ask-why', VALID_BODY['ask-why']));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, asked: 42, notification_id: 'n-1' });
  });

  it('treats "nobody left to ask" as a success, not an error', async () => {
    // Everyone intended has used it, been asked before, or was asked about
    // something else this week. That is the guard working, not a failure.
    rpcData = { success: true, asked: 0, notification_id: null };
    const res = await askWhyPost(post('ask-why', VALID_BODY['ask-why']));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, asked: 0, notification_id: null });
  });
});

describe('POST /api/admin/adoption/propose', () => {
  it('rejects an option that is not one of the three', async () => {
    const res = await proposePost(
      post('propose', { feature_key: 'gate.pass_issue', option: 'delete' })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/simplify, retrain or retire/i);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('rejects "keep" here — a card is proposed, not decided', async () => {
    const res = await proposePost(
      post('propose', { feature_key: 'gate.pass_issue', option: 'keep' })
    );
    expect(res.status).toBe(400);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('raises the card and returns its id', async () => {
    rpcData = { success: true, proposal_id: 'p-1' };
    const res = await proposePost(
      post('propose', {
        feature_key: 'gate.pass_issue',
        option: 'retrain',
        recommendation: 'Show it in the weekly briefing.',
        reasons: { 'Did not know it exists': 11 },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, proposal_id: 'p-1' });
    expect(userRpc).toHaveBeenCalledWith('fn_adoption_propose', {
      p_feature_key: 'gate.pass_issue',
      p_option: 'retrain',
      p_recommendation: 'Show it in the weekly briefing.',
      p_reasons: { 'Did not know it exists': 11 },
    });
  });

  it('passes an empty reasons object rather than a list', async () => {
    rpcData = { success: true, proposal_id: 'p-2' };
    await proposePost(post('propose', { ...VALID_BODY.propose, reasons: ['nope'] }));
    expect(userRpc.mock.calls[0][1]).toMatchObject({ p_reasons: {} });
  });

  it('surfaces "a card is already waiting" as a 400 a person can read', async () => {
    rpcData = { success: false, error: 'a card for this feature is already waiting' };
    const res = await proposePost(post('propose', VALID_BODY.propose));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('a card for this feature is already waiting');
  });
});

describe('POST /api/admin/adoption/decide', () => {
  it('rejects a body with no card id', async () => {
    const res = await decidePost(post('decide', { option: 'retire' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/card id/i);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('rejects an option outside the four', async () => {
    const res = await decidePost(post('decide', { ...VALID_BODY.decide, option: 'archive' }));
    expect(res.status).toBe(400);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('accepts all four answers, keep included', async () => {
    for (const option of ['simplify', 'retrain', 'retire', 'keep']) {
      userRpc.mockClear();
      rpcData = { success: true, feature_key: 'gate.pass_issue', status: option };
      const res = await decidePost(post('decide', { ...VALID_BODY.decide, option }));
      expect(res.status).toBe(200);
      expect(userRpc.mock.calls[0][1]).toMatchObject({ p_option: option });
    }
  });

  it('records the decision and returns the feature’s new status', async () => {
    rpcData = { success: true, feature_key: 'gate.pass_issue', status: 'retire' };
    const res = await decidePost(post('decide', { ...VALID_BODY.decide, option: 'retire' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      feature_key: 'gate.pass_issue',
      status: 'retire',
    });
  });

  it('surfaces a second tap on an already-decided card as a 400', async () => {
    rpcData = { success: false, error: 'no waiting card with that id' };
    const res = await decidePost(post('decide', VALID_BODY.decide));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no waiting card with that id');
  });
});


describe('POST /api/admin/adoption/sync', () => {
  it('pulls 30 days by default and echoes the counts', async () => {
    rpcData = { success: true, features: 2, rows: 41, since: '2026-08-18T00:00:00+05:30' };
    const res = await syncPost(post('sync', {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, features: 2, rows: 41, since: '2026-08-18T00:00:00+05:30' });
    expect(userRpc).toHaveBeenCalledWith('fn_adoption_sync_usage_events', { p_days: 30 });
  });

  it('clamps the window to 1..365 days', async () => {
    rpcData = { success: true, features: 0, rows: 0 };
    await syncPost(post('sync', { days: 9000 }));
    expect(userRpc).toHaveBeenCalledWith('fn_adoption_sync_usage_events', { p_days: 365 });
  });

  it('reports the switch being off as the database says it', async () => {
    rpcData = { success: false, error: 'adoption loop is switched off (policy adoption.loop.enabled)' };
    const res = await syncPost(post('sync', { days: 30 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/switched off/);
  });
});

describe('POST /api/admin/adoption/register — cadence', () => {
  it('accepts a feature that is used only when the occasion arises', async () => {
    rpcData = { success: true, feature_key: 'bug_reports.submit', cadence: 'event' };
    const res = await registerPost(
      post('register', {
        feature_key: 'bug_reports.submit',
        title: 'Report a bug',
        core_action: 'report a problem you hit',
        cadence: 'event',
      })
    );
    expect(res.status).toBe(200);
    expect(userRpc).toHaveBeenCalledWith(
      'fn_adoption_register',
      expect.objectContaining({ p_cadence: 'event' })
    );
  });

  it('still refuses a cadence nobody defined', async () => {
    const res = await registerPost(
      post('register', {
        feature_key: 'gate.pass_issue',
        title: 'Gate pass',
        core_action: 'issue a gate pass',
        cadence: 'yearly',
      })
    );
    expect(res.status).toBe(400);
  });
});
