/**
 * /api/social/learner-credit — behaviour behind review findings #2 #3 #4 #9 #10
 * on PR #4193.
 *
 * WHY EACH TEST EXISTS:
 *  #2  Instagram shortcodes are case-sensitive and often contain '_', which LIKE
 *      reads as "any one character". The old ILIKE lookup could credit a learner
 *      with a different post. The filter must be case-sensitive with '_' escaped.
 *  #3  ig_post_metrics averages ~627 snapshots a post; PostgREST caps a read at
 *      1,000 rows, so two claimed posts already returned an arbitrary subset.
 *      The board must read the one-row-per-post view instead.
 *  #4  A failed read used to carry on with null data and show zeroes as success.
 *  #9  A decision is final: the update must only touch a pending claim, and a
 *      claim that was already decided must answer 409, not quietly flip.
 *  #10 A confirmed post with no snapshot yet is unknown, not zero.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { client: 'session' | 'service'; table: string; ops: unknown[][] };

const calls: Call[] = [];
let results: Record<string, Result> = {};

/** A chainable recorder: every filter is logged, and awaiting it yields results[key]. */
function fakeClient(client: 'session' | 'service') {
  return {
    from(table: string) {
      const call: Call = { client, table, ops: [] };
      calls.push(call);
      const key = () => `${client}:${table}:${call.ops.some((o) => o[0] === 'update') ? 'update' : 'read'}`;
      const settle = () => Promise.resolve(results[key()] ?? { data: [], error: null });
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'like', 'ilike', 'limit', 'update', 'insert', 'delete', 'order', 'range']) {
        b[m] = (...args: unknown[]) => {
          call.ops.push([m, ...args]);
          return b;
        };
      }
      b.maybeSingle = () => {
        call.ops.push(['maybeSingle']);
        return settle();
      };
      b.then = (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) => settle().then(ok, bad);
      return b;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: async () => ({ user: { id: 'U1' }, error: null }),
  createServerSupabaseClient: async () => fakeClient('session'),
  createServiceRoleClient: () => fakeClient('service'),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: () => {}, warn: () => {}, dev: () => {} },
}));

const URL_ = 'https://example.test/api/social/learner-credit';

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(URL_, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const tablesRead = (client: 'session' | 'service') =>
  calls.filter((c) => c.client === client).map((c) => c.table);

beforeEach(() => {
  calls.length = 0;
  results = {};
  vi.resetModules();
});

describe('#2 a pasted link resolves to exactly one post', () => {
  beforeEach(() => {
    results['session:profiles:read'] = { data: { learner_id: 'L1' }, error: null };
    results['session:ig_learner_post_claims:read'] = { data: { id: 'C1', status: 'pending', origin: 'learner_link' }, error: null };
  });

  it("escapes '_' and matches case-sensitively — never ILIKE", async () => {
    results['service:ig_posts:read'] = { data: [{ id: 'P1' }], error: null };
    const { POST } = await import('@/app/api/social/learner-credit/route');
    const res = await POST(req('POST', { ig_url: 'https://www.instagram.com/p/Ab_Cd-9/' }));
    expect(res.status).toBe(200);

    const lookup = calls.find((c) => c.client === 'service' && c.table === 'ig_posts')!;
    expect(lookup.ops).toContainEqual(['like', 'permalink', '%/Ab\\_Cd-9/%']);
    expect(lookup.ops.some((o) => o[0] === 'ilike')).toBe(false);
  });

  it('the escaped pattern does not match a near-miss permalink', async () => {
    results['service:ig_posts:read'] = { data: [{ id: 'P1' }], error: null };
    const { POST } = await import('@/app/api/social/learner-credit/route');
    await POST(req('POST', { ig_url: 'https://www.instagram.com/p/Ab_Cd/' }));
    const pattern = calls.find((c) => c.table === 'ig_posts')!.ops.find((o) => o[0] === 'like')![2] as string;

    // Postgres LIKE semantics with '\' as the escape character, case-sensitive.
    const asRegex = new RegExp(
      '^' +
        pattern
          .replace(/\\(.)|([%_])|([^\\%_])/g, (_m, esc, wild, lit) =>
            esc !== undefined
              ? esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              : wild === '%'
                ? '.*'
                : wild === '_'
                  ? '.'
                  : lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          ) +
        '$'
    );
    expect(asRegex.test('https://www.instagram.com/p/Ab_Cd/')).toBe(true);
    expect(asRegex.test('https://www.instagram.com/p/AbXCd/')).toBe(false); // '_' is not a wildcard
    expect(asRegex.test('https://www.instagram.com/p/ab_cd/')).toBe(false); // case matters
  });

  it('refuses a link that matches more than one post', async () => {
    results['service:ig_posts:read'] = { data: [{ id: 'P1' }, { id: 'P2' }], error: null };
    const { POST } = await import('@/app/api/social/learner-credit/route');
    const res = await POST(req('POST', { ig_url: 'https://www.instagram.com/p/Ab_Cd/' }));
    expect(res.status).toBe(409);
    expect(tablesRead('session')).not.toContain('ig_learner_post_claims');
  });

  it('refuses a shortcode carrying a pattern character before any lookup', async () => {
    const { POST } = await import('@/app/api/social/learner-credit/route');
    const res = await POST(req('POST', { ig_url: 'https://www.instagram.com/p/Ab%25*/' }));
    expect(res.status).toBe(400);
    expect(tablesRead('service')).not.toContain('ig_posts');
  });
});

describe('the board', () => {
  beforeEach(() => {
    results['session:ig_learner_post_claims:read'] = {
      data: [
        { learner_id: 'L1', ig_post_id: 'P1', status: 'confirmed', institution_id: 'I1' },
        { learner_id: 'L1', ig_post_id: 'P2', status: 'confirmed', institution_id: 'I1' },
        { learner_id: 'L2', ig_post_id: 'P1', status: 'pending', institution_id: 'I2' },
      ],
      error: null,
    };
    results['service:ig_posts:read'] = {
      data: [
        { id: 'P1', account_id: 'A1' },
        { id: 'P2', account_id: 'A1' },
      ],
      error: null,
    };
    // Only P1 has ever been measured.
    results['service:v_ig_post_latest_metrics:read'] = {
      data: [{ post_id: 'P1', snapshot_at: '2026-10-01T00:00:00Z', saves: 2, shares: 1, comments: 3, likes: 10, reach: null }],
      error: null,
    };
    results['session:learners_profiles:read'] = {
      data: [{ id: 'L1', first_name: 'Asha', last_name: 'K', institution_id: 'I1' }],
      error: null,
    };
    results['service:ig_accounts:read'] = { data: [{ id: 'A1', metrics_source: 'graph' }], error: null };
  });

  it('#3 reads the latest-metrics view, never ig_post_metrics', async () => {
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    expect(tablesRead('service')).toContain('v_ig_post_latest_metrics');
    expect(calls.map((c) => c.table)).not.toContain('ig_post_metrics');
    const view = calls.find((c) => c.table === 'v_ig_post_latest_metrics')!;
    expect(view.ops).toContainEqual(['in', 'post_id', ['P1', 'P2']]);
  });

  it('#10 a confirmed post with no snapshot is reported unknown, not zero', async () => {
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const body = await (await GET(req('GET'))).json();
    const l1 = body.rows.find((r: { learner_id: string }) => r.learner_id === 'L1');
    expect(l1.confirmed_posts).toBe(2);
    expect(l1.posts_not_yet_measured).toBe(1);
    expect(l1.real_signal).toBe(6); // P1 only
    expect(l1.engagement).toBe(16);
    expect(body.caveats.join(' ')).toMatch(/no engagement reading yet/i);
    expect(body.caveats.join(' ')).toMatch(/unknown, not zero/i);
  });

  it('#8 a claim whose learner profile is hidden still makes a row', async () => {
    const { GET } = await import('@/app/api/social/learner-credit/route');
    const body = await (await GET(req('GET'))).json();
    const l2 = body.rows.find((r: { learner_id: string }) => r.learner_id === 'L2');
    expect(l2).toBeDefined();
    expect(l2.pending_claims).toBe(1);
    expect(l2.institution_id).toBe('I2');
    expect(body.caveats.join(' ')).toMatch(/shown without a name/i);
  });

  for (const key of [
    'service:ig_posts:read',
    'service:v_ig_post_latest_metrics:read',
    'session:learners_profiles:read',
    'service:ig_accounts:read',
  ]) {
    it(`#4 a failed read (${key.split(':')[1]}) returns 500, not a board of zeroes`, async () => {
      results[key] = { data: null, error: { message: 'boom', code: 'XX000' } };
      const { GET } = await import('@/app/api/social/learner-credit/route');
      const res = await GET(req('GET'));
      expect(res.status).toBe(500);
      expect((await res.json()).success).toBe(false);
    });
  }
});

describe('#4 a failed profile read on POST is a 500, not "not a learner account"', () => {
  it('returns 500', async () => {
    results['session:profiles:read'] = { data: null, error: { message: 'boom' } };
    const { POST } = await import('@/app/api/social/learner-credit/route');
    const res = await POST(req('POST', { ig_url: 'https://www.instagram.com/p/AbC123/' }));
    expect(res.status).toBe(500);
  });
});

describe('#9 deciding a claim', () => {
  it('only updates a pending claim, and answers 409 when the claim is already decided', async () => {
    results['session:ig_learner_post_claims:update'] = { data: null, error: null };
    results['session:ig_learner_post_claims:read'] = { data: { id: 'C1', status: 'confirmed' }, error: null };
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    const res = await PATCH(req('PATCH', { claim_id: 'C1', status: 'rejected' }));

    const upd = calls.find((c) => c.ops.some((o) => o[0] === 'update'))!;
    expect(upd.ops).toContainEqual(['eq', 'id', 'C1']);
    expect(upd.ops).toContainEqual(['eq', 'status', 'pending']);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already confirmed/i);
  });

  it('answers 404, not "already decided", for a claim the caller cannot see or that does not exist', async () => {
    results['session:ig_learner_post_claims:update'] = { data: null, error: null };
    results['session:ig_learner_post_claims:read'] = { data: null, error: null };
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    const res = await PATCH(req('PATCH', { claim_id: 'C404', status: 'rejected' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).not.toMatch(/already/i);
  });

  it('answers 403 when the caller can see the pending claim but may not decide it', async () => {
    results['session:ig_learner_post_claims:update'] = { data: null, error: null };
    results['session:ig_learner_post_claims:read'] = { data: { id: 'C1', status: 'pending' }, error: null };
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    const res = await PATCH(req('PATCH', { claim_id: 'C1', status: 'confirmed' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).not.toMatch(/already/i);
  });

  it('answers 500 when the follow-up lookup itself fails', async () => {
    results['session:ig_learner_post_claims:update'] = { data: null, error: null };
    results['session:ig_learner_post_claims:read'] = { data: null, error: { message: 'boom' } };
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    expect((await PATCH(req('PATCH', { claim_id: 'C1', status: 'rejected' }))).status).toBe(500);
  });

  it('maps the database guard (23514) to 409 and self-review (42501) to 403', async () => {
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    results['session:ig_learner_post_claims:update'] = {
      data: null,
      error: { code: '23514', message: 'ig_learner_post_claims: this claim was already confirmed; a decision is final' },
    };
    expect((await PATCH(req('PATCH', { claim_id: 'C1', status: 'confirmed' }))).status).toBe(409);
    // Any other CHECK failure is not "already decided".
    results['session:ig_learner_post_claims:update'] = {
      data: null,
      error: { code: '23514', message: 'new row violates check constraint "ck_review_note_length"' },
    };
    const other = await PATCH(req('PATCH', { claim_id: 'C1', status: 'confirmed' }));
    expect(other.status).toBe(400);
    expect((await other.json()).error).not.toMatch(/already decided/i);
    results['session:ig_learner_post_claims:update'] = { data: null, error: { code: '42501', message: 'self' } };
    expect((await PATCH(req('PATCH', { claim_id: 'C1', status: 'confirmed' }))).status).toBe(403);
  });

  it('a pending claim that matched is decided', async () => {
    results['session:ig_learner_post_claims:update'] = { data: { id: 'C1', status: 'confirmed' }, error: null };
    const { PATCH } = await import('@/app/api/social/learner-credit/route');
    const res = await PATCH(req('PATCH', { claim_id: 'C1', status: 'confirmed' }));
    expect(res.status).toBe(200);
  });
});
