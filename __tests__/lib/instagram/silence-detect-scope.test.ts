// __tests__/lib/instagram/silence-detect-scope.test.ts
//
// Regression guard for the 2026-09-09 silence-detector repair.
//
// The defect this pins: the detector filtered `.eq('status','active')` while
// the metrics poller flips an account to `dormant` at
// ig.dormancy_threshold_days (live value 14) and this cron alerts at
// ig.alert_dormant_after_days (live value 30). Accounts fell through that
// 16-day trapdoor and could never come back to be alerted on. Measured on
// production 2026-09-09: 12 genuinely silent Graph-connected department
// accounts (40-586 days silent) had NEVER produced an alert, while all 10
// accounts that DID alert were business-discovery rows matched only by the
// `last_post_at IS NULL` disjunct — 4 of them with zero ig_posts rows, i.e.
// told they had "gone quiet" on no evidence at all.
//
// Every assertion below fails against the pre-fix implementation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fanoutNotification = vi.fn(async () => ({
  notified: 1,
  notificationId: 'notif-1',
}));

vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: (...args: unknown[]) =>
    (fanoutNotification as unknown as (...a: unknown[]) => unknown)(...args),
}));

import { runSilenceDetect } from '@/lib/instagram/silence-detect';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

interface AccountRow {
  id: string;
  ig_user_id: string;
  username: string;
  institution_id: string;
  last_post_at: string | null;
  connected_by: string | null;
  status: string;
}

/** Calls the code made against the fake, so scope can be asserted directly. */
interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

interface FakeOptions {
  accounts: AccountRow[];
  /** ig_posts rows: [account_id, posted_at]. */
  posts: Array<[string, string]>;
  postsError?: string;
}

/**
 * Minimal PostgREST-shaped stub. Every builder method returns `this` and the
 * builder is thenable, so it resolves at whatever chain depth the code awaits.
 * Filters are RECORDED, not simulated — the point is to assert which rows the
 * production query asks for, which is exactly where the defect lived.
 */
function fakeSupabase(opts: FakeOptions) {
  const calls: RecordedCall[] = [];

  const results: Record<string, () => { data: unknown; error: unknown }> = {
    // The stub returns every account regardless of the .in() filter, so a
    // regression back to `.eq('status','active')` cannot hide behind the fake
    // — it is caught by the recorded-call assertion instead.
    ig_accounts: () => ({ data: opts.accounts, error: null }),
    ig_posts: () =>
      opts.postsError
        ? { data: null, error: { message: opts.postsError } }
        : {
            data: opts.posts.map(([account_id, posted_at]) => ({
              account_id,
              posted_at,
            })),
            error: null,
          },
    profiles: () => ({ data: [{ id: 'admin-1' }], error: null }),
    // No prior silence alerts -> nothing is suppressed.
    notifications: () => ({ data: [], error: null }),
  };

  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'in',
      'or',
      'like',
      'gte',
      'lt',
      'order',
      'range',
      'limit',
    ]) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown, reject: unknown) =>
      Promise.resolve(results[table]!()).then(resolve, reject as never);
    return builder;
  };

  return {
    calls,
    client: {
      from,
      // Policy resolver: 30-day alert threshold, 7-day re-alert window.
      rpc: async (_fn: string, params: { p_key: string; p_default: number }) => ({
        data:
          params.p_key === 'ig.alert_dormant_after_days'
            ? 30
            : params.p_key === 'ig.silence_realert_days'
              ? 7
              : params.p_default,
        error: null,
      }),
    } as never,
  };
}

const account = (over: Partial<AccountRow> & { id: string; username: string }): AccountRow => ({
  ig_user_id: `ig-${over.id}`,
  institution_id: 'inst-1',
  last_post_at: null,
  connected_by: null,
  status: 'dormant',
  ...over,
});

beforeEach(() => {
  fanoutNotification.mockClear();
});

describe('runSilenceDetect scope', () => {
  it('asks for dormant accounts too, not just active', async () => {
    // THE defect. `.eq('status','active')` made the day-30 alarm unreachable
    // because the poller had already written 'dormant' on day 14.
    const { client, calls } = fakeSupabase({
      accounts: [account({ id: 'a1', username: 'jkkn_ece', status: 'dormant' })],
      posts: [['a1', daysAgo(187)]],
    });
    await runSilenceDetect(client);

    const scope = calls.find((c) => c.table === 'ig_accounts' && c.method === 'in');
    expect(scope, 'ig_accounts must be filtered with .in(), not .eq()').toBeDefined();
    expect(scope!.args[0]).toBe('status');
    expect(scope!.args[1]).toEqual(['active', 'dormant']);

    // disconnected is deliberately NOT in scope: unplugged is not silent.
    expect(scope!.args[1]).not.toContain('disconnected');

    // And no query-time recency prefilter survives — recency is judged in JS
    // against ig_posts, because last_post_at is NULL for most accounts.
    expect(calls.some((c) => c.table === 'ig_accounts' && c.method === 'or')).toBe(false);
  });

  it('alerts a long-silent dormant account (invisible before the fix)', async () => {
    const { client } = fakeSupabase({
      accounts: [
        account({ id: 'a1', username: 'jkkneducation', status: 'dormant' }),
      ],
      posts: [['a1', daysAgo(586)]],
    });
    const out = await runSilenceDetect(client);

    expect(out.in_scope).toBe(1);
    expect(out.candidates).toBe(1);
    expect(out.alerted).toBe(1);
    expect(fanoutNotification).toHaveBeenCalledTimes(1);
    expect(out.results[0]!.status).toBe('alerted');
    expect(out.results[0]!.days_silent).toBeGreaterThanOrEqual(585);
  });
});

describe('runSilenceDetect silence evidence', () => {
  it('never alerts when nothing is known — unknown is not silent', async () => {
    // The 4 business-discovery accounts with zero ig_posts rows AND a NULL
    // column. Before the fix these were the alerts that actually fired, told
    // their recipients the account had "gone quiet for more than 30 days".
    const { client } = fakeSupabase({
      accounts: [
        account({
          id: 'a1',
          username: 'jkkn_pharmacology',
          status: 'active',
          last_post_at: null,
        }),
      ],
      posts: [],
    });
    const out = await runSilenceDetect(client);

    expect(out.unknown).toBe(1);
    expect(out.candidates).toBe(0);
    expect(out.alerted).toBe(0);
    expect(fanoutNotification).not.toHaveBeenCalled();
    expect(out.results[0]!.status).toBe('unknown');
    expect(out.results[0]!.days_silent).toBeNull();
  });

  it('trusts ig_posts over a stale last_post_at column', async () => {
    // The column is the denormalised value; ig_posts is the truth two other
    // production files already read. A stale column must not manufacture an
    // alert for an account that posted three days ago.
    const { client } = fakeSupabase({
      accounts: [
        account({
          id: 'a1',
          username: 'jkkn_textile',
          status: 'dormant',
          last_post_at: daysAgo(400),
        }),
      ],
      posts: [['a1', daysAgo(3)]],
    });
    const out = await runSilenceDetect(client);

    expect(out.recent).toBe(1);
    expect(out.candidates).toBe(0);
    expect(out.alerted).toBe(0);
    expect(fanoutNotification).not.toHaveBeenCalled();
  });

  it('falls back to the column only when the account has no posts at all', async () => {
    const { client } = fakeSupabase({
      accounts: [
        account({ id: 'a1', username: 'jkkn_eee', last_post_at: daysAgo(40) }),
      ],
      posts: [],
    });
    const out = await runSilenceDetect(client);

    expect(out.candidates).toBe(1);
    expect(out.alerted).toBe(1);
  });

  it('does not alert a dormant account that posted inside the threshold', async () => {
    // The coupled regression: including dormant while still treating a NULL
    // column as "silent" would have false-alarmed exactly this shape
    // (jkkn_textile 5d, jkkn_english 15d, jkkn_bba 19d, jkkn_microbiology 28d
    // — all dormant, all NULL-column, all posting).
    const { client } = fakeSupabase({
      accounts: [
        account({
          id: 'a1',
          username: 'jkkn_microbiology',
          status: 'dormant',
          last_post_at: null,
        }),
      ],
      posts: [['a1', daysAgo(28)]],
    });
    const out = await runSilenceDetect(client);

    expect(out.recent).toBe(1);
    expect(out.alerted).toBe(0);
    expect(fanoutNotification).not.toHaveBeenCalled();
  });
});

describe('runSilenceDetect counters', () => {
  it('in_scope decomposes into candidates + unknown + recent', async () => {
    const { client } = fakeSupabase({
      accounts: [
        account({ id: 'silent', username: 'jkkn_ece' }),
        account({ id: 'fresh', username: 'jkkn_bba' }),
        account({ id: 'blank', username: 'jkkn_bcom', status: 'active' }),
      ],
      posts: [
        ['silent', daysAgo(187)],
        ['fresh', daysAgo(4)],
      ],
    });
    const out = await runSilenceDetect(client);

    expect(out.in_scope).toBe(3);
    expect(out.candidates).toBe(1);
    expect(out.recent).toBe(1);
    expect(out.unknown).toBe(1);
    expect(out.in_scope).toBe(out.candidates + out.unknown + out.recent);
    expect(out.candidates).toBe(
      out.alerted + out.suppressed + out.deduplicated + out.failed
    );
  });
});

describe('runSilenceDetect read failure', () => {
  it('throws rather than silently alerting nobody when ig_posts is unreadable', async () => {
    // Failing OPEN here would mark every account `unknown`, and unknown never
    // alerts — a silence detector that goes silent. The route turns this throw
    // into a 502 so the failure is loud.
    const { client } = fakeSupabase({
      accounts: [account({ id: 'a1', username: 'jkkneducation' })],
      posts: [],
      postsError: 'connection reset',
    });

    await expect(runSilenceDetect(client)).rejects.toThrow(/ig_posts read failed/);
    expect(fanoutNotification).not.toHaveBeenCalled();
  });
});
