/**
 * GET /api/social/jkkn100/scoreboard
 *
 * Pins:
 *   - signed out                              -> 401
 *   - without social.view                     -> 403, no table read
 *   - the permission check itself failed      -> 500, not "not allowed"
 *   - ig_accounts read error                  -> 500
 *   - ig_posts read error                     -> 500
 *   - a garbage ?since=                       -> 400
 *   - tagged posts are paged in 1,000s: 2,840 rows come back in 3 pages, and
 *     the query carries the caption filter and the since lower bound
 *   - exactly the cap (5,000)                 -> 200, a complete board
 *   - one post past the cap                   -> 500, explicit message
 *   - no ?anchor at all                       -> @jkkninstitutions
 *   - ?anchor= sent empty                     -> no anchor account
 *   - ?anchor=name sets the day's clock; access_token is never selected
 *   - ?collab= puts those accounts in COLLAB; what it could not use comes
 *     back in warnings, and an over-long value is refused with 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

let currentUser: { id: string } | null = { id: 'caller' };
let permResult: { data: unknown; error: unknown } = { data: true, error: null };
let accountRows: Row[] = [];
let accountError: unknown = null;
let postRows: Row[] = [];
let postError: unknown = null;
let profileRows: Row[] = [];
const tableReads: string[] = [];
const accountSelects: string[] = [];
const postCalls: Array<{ ilike?: [string, string]; gte?: [string, string]; range: [number, number] }> = [];

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

function fakeClient() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
    rpc: (fn: string) =>
      Promise.resolve(fn === 'user_has_permission' ? permResult : { data: null, error: null }),
    from(table: string) {
      tableReads.push(table);
      const call: { ilike?: [string, string]; gte?: [string, string]; range: [number, number] } = {
        range: [0, 0],
      };
      const b: any = {
        select: (cols: string) => {
          if (table === 'ig_accounts') accountSelects.push(cols);
          return b;
        },
        ilike: (col: string, val: string) => {
          call.ilike = [col, val];
          return b;
        },
        gte: (col: string, val: string) => {
          call.gte = [col, val];
          return b;
        },
        in: () => Promise.resolve({ data: profileRows, error: null }),
        order: () => {
          if (table === 'ig_accounts') {
            return Promise.resolve({ data: accountError ? null : accountRows, error: accountError });
          }
          return b;
        },
        range: (from: number, to: number) => {
          call.range = [from, to];
          postCalls.push(call);
          // The fake enforces PostgREST's page cap: never more than 1,000 rows.
          const size = Math.min(to - from + 1, 1000);
          return Promise.resolve({
            data: postError ? null : postRows.slice(from, from + size),
            error: postError,
          });
        },
      };
      return b;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(fakeClient()),
}));

vi.mock('next/server', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, connection: () => Promise.resolve() };
});

const { GET } = await import('@/app/api/social/jkkn100/scoreboard/route');

function req(qs = '') {
  return new Request(`http://localhost/api/social/jkkn100/scoreboard${qs}`) as any;
}

const T0 = Date.parse('2026-10-09T04:30:00.000Z');
const iso = (m: number) => new Date(T0 + m * 60_000).toISOString();

beforeEach(() => {
  currentUser = { id: 'caller' };
  permResult = { data: true, error: null };
  accountRows = [
    {
      id: 'a1',
      username: 'mohan_reels',
      institution_id: null,
      department_id: null,
      status: 'active',
      metrics_source: 'graph',
      last_polled_at: '2026-12-01T00:00:00Z',
      connected_by: 'u1',
    },
    {
      id: 'a2',
      username: 'dept_a',
      institution_id: null,
      department_id: null,
      status: 'active',
      metrics_source: 'graph',
      last_polled_at: '2026-12-01T00:00:00Z',
      connected_by: null,
    },
  ];
  accountError = null;
  postRows = [];
  postError = null;
  profileRows = [{ id: 'u1', full_name: 'Priya R', email: 'p@x' }];
  tableReads.length = 0;
  accountSelects.length = 0;
  postCalls.length = 0;
});

describe('GET /api/social/jkkn100/scoreboard', () => {
  it('refuses a signed-out caller with 401', async () => {
    currentUser = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false });
    expect(tableReads).toEqual([]);
  });

  it('refuses a caller without social.view with 403 and reads nothing', async () => {
    permResult = { data: false, error: null };
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(tableReads).toEqual([]);
  });

  it('answers 500, not 403, when the permission check itself fails', async () => {
    permResult = { data: null, error: { message: 'boom' } };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(tableReads).toEqual([]);
  });

  it('answers 500 when the accounts read fails', async () => {
    accountError = { message: 'db down' };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it('answers 500 when the posts read fails', async () => {
    postError = { message: 'db down' };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('answers 400 for a since that is not a date', async () => {
    const res = await GET(req('?since=yesterday'));
    expect(res.status).toBe(400);
  });

  it('pages past 1,000 tagged posts and filters on caption and since', async () => {
    postRows = Array.from({ length: 2840 }, (_, i) => ({
      id: `p${String(i).padStart(5, '0')}`,
      account_id: i % 2 === 0 ? 'a1' : 'a2',
      caption: `#JKKN100Day${String(40 - (i % 40)).padStart(2, '0')}`,
      posted_at: iso(i),
    }));
    const res = await GET(req('?since=2026-10-05'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(postCalls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(postCalls[0]!.ilike).toEqual(['caption', '%#JKKN100Day%']);
    expect(postCalls[0]!.gte).toEqual(['posted_at', '2026-10-05T00:00:00.000Z']);
    expect(body.data.tagged_post_count).toBe(2840);
    expect(body.data.days).toHaveLength(40);
    expect(accountSelects[0]).not.toContain('access_token');
  });

  it('answers 200 for exactly the cap: 5,000 posts is a complete board', async () => {
    postRows = Array.from({ length: 5000 }, (_, i) => ({
      id: `p${String(i).padStart(5, '0')}`,
      account_id: i % 2 === 0 ? 'a1' : 'a2',
      caption: '#JKKN100Day40',
      posted_at: iso(i),
    }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tagged_post_count).toBe(5000);
    // Five full pages, then one row past the end to prove there is no more.
    expect(postCalls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
      [4000, 4999],
      [5000, 5000],
    ]);
  });

  it('answers 500 when there is one post past the cap', async () => {
    postRows = Array.from({ length: 5001 }, (_, i) => ({
      id: `p${String(i).padStart(5, '0')}`,
      account_id: 'a1',
      caption: '#JKKN100Day40',
      posted_at: iso(i),
    }));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/More than 5000 tagged posts/);
    expect(postCalls).toHaveLength(6);
  });

  it('times the day from the chosen anchor and names the runner', async () => {
    postRows = [
      { id: 'p1', account_id: 'a2', caption: '#JKKN100Day40', posted_at: iso(-3) },
      { id: 'p2', account_id: 'a1', caption: '#JKKN100Day40', posted_at: iso(0) },
    ];
    const res = await GET(req('?anchor=@mohan_reels'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.days[0]).toMatchObject({ day: 40, anchor_username: 'mohan_reels', anchor_source: 'anchor_account' });
    const dept = body.data.accounts.find((r: Row) => r.username === 'dept_a');
    expect(dept.cells['40']).toMatchObject({ status: 'yes', minutes_after_anchor: -3 });
    const mohan = body.data.accounts.find((r: Row) => r.username === 'mohan_reels');
    expect(mohan.runner_name).toBe('Priya R');
  });

  it('answers 400 for an anchor that is not an Instagram username', async () => {
    const res = await GET(req('?anchor=' + encodeURIComponent("x'; drop")));
    expect(res.status).toBe(400);
  });

  it('uses @jkkninstitutions when no anchor is asked for', async () => {
    accountRows[0]!.username = 'jkkninstitutions';
    postRows = [
      { id: 'p1', account_id: 'a2', caption: '#JKKN100Day40', posted_at: iso(-3) },
      { id: 'p2', account_id: 'a1', caption: '#JKKN100Day40', posted_at: iso(0) },
    ];
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.anchor_username).toBe('jkkninstitutions');
    expect(body.data.days[0]).toMatchObject({
      anchor_username: 'jkkninstitutions',
      anchor_source: 'anchor_account',
      date: '2026-10-09',
    });
  });

  it('takes no anchor account at all when ?anchor= is sent empty', async () => {
    accountRows[0]!.username = 'jkkninstitutions';
    postRows = [
      { id: 'p1', account_id: 'a2', caption: '#JKKN100Day40', posted_at: iso(-3) },
      { id: 'p2', account_id: 'a1', caption: '#JKKN100Day40', posted_at: iso(0) },
    ];
    const res = await GET(req('?anchor='));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.anchor_username).toBeNull();
    expect(body.data.days[0]).toMatchObject({ anchor_username: 'dept_a', anchor_source: 'earliest_any' });
  });

  it('puts the ?collab= accounts in COLLAB for that day only', async () => {
    postRows = [{ id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: iso(0) }];
    const res = await GET(req('?anchor=mohan_reels&collab=40:@Dept_A'));
    const body = await res.json();
    expect(res.status).toBe(200);
    const dept = body.data.accounts.find((r: Row) => r.username === 'dept_a');
    expect(dept.cells['40']).toMatchObject({ status: 'collab', also_posted: false });
    expect(body.data.collab).toEqual({ 40: ['dept_a'] });
    expect(body.data.warnings).toEqual([]);
  });

  it('returns what it could not use in ?collab= as warnings, and still answers 200', async () => {
    postRows = [{ id: 'p1', account_id: 'a1', caption: '#JKKN100Day40', posted_at: iso(0) }];
    const res = await GET(req('?collab=' + encodeURIComponent('nonsense;99:dept_a;40:nobody_here')));
    const body = await res.json();
    expect(res.status).toBe(200);
    // One for the part with no colon, one for the day out of range, one for
    // the username that is not on the board.
    expect(body.data.warnings).toHaveLength(3);
    expect(body.data.warnings.join(' ')).toContain('nobody_here');
  });

  it('answers 400 for an over-long collab value', async () => {
    const res = await GET(req('?collab=' + encodeURIComponent('40:' + 'a'.repeat(2100))));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/shorter than 2000/);
  });
});
