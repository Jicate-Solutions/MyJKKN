/**
 * Phase B: the widget's "My bugs" drawer, served to the college apps.
 *
 *   GET  /api/v1/public/bug-reports/me
 *   GET  /api/v1/public/bug-reports/[id]
 *   GET  /api/v1/public/bug-reports/[id]/messages   (POST → 501)
 *   GET  /api/v1/public/leaderboard/[applicationId] (always empty)
 *
 * The three dynamic URLs are answered by static route files (item,
 * item-messages, leaderboard) that proxy.ts rewrites to; req() below applies
 * that same rewrite, so every call here starts from the SDK's public URL.
 *
 * The Supabase mock holds real fixture rows and APPLIES every .eq() filter
 * (including the metadata->>reporter_email path), so "another reporter's bug"
 * and "another app's bug" drop out only if the route actually filters on
 * them. Responses are also checked for the fields that must never leave:
 * screenshot, console logs, reporter email, profile id, institution, sender.
 */
import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, any>;

const MENTOR = { id: '11111111-0000-4000-8000-000000000001', slug: 'mentor', name: 'Mentor', is_active: true };
const TMS = { id: '11111111-0000-4000-8000-000000000002', slug: 'tms', name: 'TMS', is_active: true };

const MENTOR_KEY = 'jkkn_bi_' + 'ab'.repeat(24);
const TMS_KEY = 'jkkn_bi_' + 'cd'.repeat(24);
const ADMIN_KIND_KEY = 'jkkn_bi_' + 'ef'.repeat(24);
const sha = (k: string) => createHash('sha256').update(k).digest('hex');

const ME = 'faculty.one@jkkn.ac.in';
const OTHER = 'faculty.two@jkkn.ac.in';
const ME_PROFILE = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF = 'bbbbbbbb-0000-4000-8000-000000000002';

const BUG_MINE = '22222222-0000-4000-8000-000000000001';
const BUG_OTHER_REPORTER = '22222222-0000-4000-8000-000000000002';
const BUG_MINE_OTHER_APP = '22222222-0000-4000-8000-000000000003';

function bug(id: string, app: Row, email: string, extra: Row = {}): Row {
  return {
    id,
    application_id: app.id,
    display_id: `BUG-${id.slice(-4)}`,
    status: 'new',
    category: 'bug',
    description: 'x'.repeat(500),
    page_url: `https://${app.slug}.jkkn.ai/page`,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T01:00:00Z',
    resolved_at: null,
    reporter_user_id: email === ME ? ME_PROFILE : null,
    institution_id: 'inst-1',
    department_id: 'dept-1',
    screenshot_url: 'https://proj.supabase.co/storage/v1/object/public/bug-reports/x.png',
    console_logs: [{ level: 'error', message: 'secret token in a log' }],
    reporter_user_agent: 'UA',
    metadata: {
      source: 'sibling_app',
      source_app: app.slug,
      title: `Title of ${id}`,
      reporter_email: email,
      reporter_name: 'Some Person',
      reporter_verified: false,
      network_trace: [{ url: 'https://api/secret' }],
      client_metadata: { userAgent: 'UA' },
    },
    ...extra,
  };
}

const db: Record<string, Row[]> = {};

function resetDb() {
  db.api_keys = [
    { id: 'key-mentor', key_value: sha(MENTOR_KEY), is_active: true, expires_at: null, key_kind: 'bug_intake', sibling_app_id: MENTOR.id },
    { id: 'key-tms', key_value: sha(TMS_KEY), is_active: true, expires_at: null, key_kind: 'bug_intake', sibling_app_id: TMS.id },
    { id: 'key-admin', key_value: sha(ADMIN_KIND_KEY), is_active: true, expires_at: null, key_kind: 'admin', sibling_app_id: null },
  ];
  db.sibling_apps = [MENTOR, TMS];
  db.bug_reports = [
    bug(BUG_MINE, MENTOR, ME),
    bug(BUG_OTHER_REPORTER, MENTOR, OTHER),
    bug(BUG_MINE_OTHER_APP, TMS, ME),
  ];
  db.bug_report_messages = [
    { id: 'm1', bug_report_id: BUG_MINE, message_text: 'We are looking at it', message_type: 'text', sender_user_id: STAFF, is_internal: false, is_deleted: false, created_at: '2026-10-10T02:00:00Z' },
    { id: 'm2', bug_report_id: BUG_MINE, message_text: 'INTERNAL: blame module X', message_type: 'text', sender_user_id: STAFF, is_internal: true, is_deleted: false, created_at: '2026-10-10T03:00:00Z' },
    { id: 'm3', bug_report_id: BUG_MINE, message_text: 'deleted', message_type: 'text', sender_user_id: STAFF, is_internal: false, is_deleted: true, created_at: '2026-10-10T04:00:00Z' },
    { id: 'm4', bug_report_id: BUG_MINE, message_text: 'Thanks', message_type: 'text', sender_user_id: ME_PROFILE, is_internal: false, is_deleted: false, created_at: '2026-10-10T05:00:00Z' },
    { id: 'm5', bug_report_id: BUG_OTHER_REPORTER, message_text: 'someone else', message_type: 'text', sender_user_id: STAFF, is_internal: false, is_deleted: false, created_at: '2026-10-10T02:00:00Z' },
    { id: 'm6', bug_report_id: BUG_MINE_OTHER_APP, message_text: 'tms thread', message_type: 'text', sender_user_id: STAFF, is_internal: false, is_deleted: false, created_at: '2026-10-10T02:00:00Z' },
  ];
}

function read(row: Row, col: string) {
  const json = /^(\w+)->>(\w+)$/.exec(col);
  return json ? row[json[1]]?.[json[2]] : row[col];
}

const queries: { table: string; filters: [string, unknown][]; select: string }[] = [];

function builder(table: string) {
  const q = { table, filters: [] as [string, unknown][], select: '' };
  queries.push(q);
  const rows = () =>
    (db[table] ?? [])
      .filter((r) => q.filters.every(([c, v]) => read(r, c) === v))
      .map((r) =>
        // Emulate PostgREST's `alias:metadata->>key` in the select list, but
        // hand back every other column too, so the projection is what is tested.
        q.select.includes('title:metadata->>title')
          ? { ...r, title: r.metadata?.title, source_app: r.metadata?.source_app }
          : r
      );
  const b: Record<string, any> = {};
  b.select = (s: string) => {
    q.select = s;
    return b;
  };
  b.eq = (col: string, val: unknown) => {
    q.filters.push([col, val]);
    return b;
  };
  b.or = () => b;
  b.order = () => b;
  b.range = () => b;
  b.limit = () => b;
  b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
  b.then = (resolve: (v: unknown) => unknown) => {
    const r = rows();
    return Promise.resolve({ data: r, error: null, count: r.length }).then(resolve);
  };
  return b;
}

const fromSpy = vi.fn((t: string) => builder(t));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: fromSpy })),
}));

vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: vi.fn(),
  extractRequestMeta: () => ({ ipAddress: '203.0.113.9', userAgent: 'test-agent' }),
}));

import { GET as listMine, OPTIONS as meOptions } from '@/app/api/v1/public/bug-reports/me/route';
import { GET as getOne } from '@/app/api/v1/public/bug-reports/item/route';
import { GET as getMessages, POST as postMessage } from '@/app/api/v1/public/bug-reports/item-messages/route';
import { GET as getLeaderboard } from '@/app/api/v1/public/leaderboard/route';
import { resolveSiblingIntakeRewrite } from '@/lib/bug-reports/sibling-intake-rewrites';
import { _resetForTesting } from '@/lib/api-keys/rate-limiter';

const BASE = 'https://www.jkkn.ai';

// The SDK's public URL, rewritten to its static route file exactly as proxy.ts does.
function req(path: string, key: string | null, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key !== null) headers['x-api-key'] = key;
  const url = new URL(`${BASE}${path}`);
  const rewrite = resolveSiblingIntakeRewrite(url.pathname);
  if (rewrite) {
    url.pathname = rewrite.pathname;
    if (rewrite.id !== undefined) url.searchParams.set('id', rewrite.id);
  }
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
const q = (email: string | null, extra = '') =>
  `?${email === null ? '' : `reporter_email=${encodeURIComponent(email)}`}${extra}`;

/** No field that must stay inside MyJKKN appears anywhere in the body. */
function expectNoLeak(json: unknown) {
  const text = JSON.stringify(json);
  for (const leak of [
    'screenshot_url',
    'console_logs',
    'reporter_user_id',
    'reporter_email',
    'reporter_name',
    'institution_id',
    'department_id',
    'network_trace',
    'client_metadata',
    'sender_user_id',
    'secret',
    ME,
    OTHER,
    ME_PROFILE,
    STAFF,
    'INTERNAL',
  ]) {
    expect(text, `response leaks ${leak}`).not.toContain(leak);
  }
}

beforeEach(() => {
  resetDb();
  queries.length = 0;
  fromSpy.mockClear();
  _resetForTesting();
});

describe('GET /api/v1/public/bug-reports/me', () => {
  it("lists only the reporter's own bugs in the key's own app, minimal fields only", async () => {
    const res = await listMine(req(`/api/v1/public/bug-reports/me${q('Faculty.One@JKKN.ac.in ')}`, MENTOR_KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.bug_reports.map((b: Row) => b.id)).toEqual([BUG_MINE]);
    expect(json.data.pagination).toEqual({ page: 1, limit: 20, total: 1, total_pages: 1 });

    const b = json.data.bug_reports[0];
    expect(Object.keys(b).sort()).toEqual(
      ['category', 'created_at', 'description', 'display_id', 'id', 'metadata', 'resolved_at', 'status', 'updated_at'].sort()
    );
    expect(b.metadata).toEqual({ title: `Title of ${BUG_MINE}`, source_app: 'mentor' });
    expect(b.description.length).toBeLessThanOrEqual(200);
    expectNoLeak(json);

    // The scope is in the query itself, not filtered afterwards.
    const bugQuery = queries.find((x) => x.table === 'bug_reports')!;
    expect(bugQuery.filters).toEqual(
      expect.arrayContaining([
        ['application_id', MENTOR.id],
        ['metadata->>reporter_email', ME],
      ])
    );
    expect(bugQuery.select).not.toMatch(/\bmetadata\b(?!->>)/);
  });

  it("does not show another reporter's bug", async () => {
    const res = await listMine(req(`/api/v1/public/bug-reports/me${q(OTHER)}`, MENTOR_KEY));
    const json = await res.json();
    expect(json.data.bug_reports.map((b: Row) => b.id)).toEqual([BUG_OTHER_REPORTER]);
    expect(JSON.stringify(json)).not.toContain(BUG_MINE);
  });

  it("does not show the same reporter's bug from another app", async () => {
    const mentor = await (await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, MENTOR_KEY))).json();
    expect(JSON.stringify(mentor)).not.toContain(BUG_MINE_OTHER_APP);
    const tms = await (await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, TMS_KEY))).json();
    expect(tms.data.bug_reports.map((b: Row) => b.id)).toEqual([BUG_MINE_OTHER_APP]);
  });

  it('refuses a request without reporter_email instead of listing the whole app (400)', async () => {
    const res = await listMine(req('/api/v1/public/bug-reports/me', MENTOR_KEY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(queries.some((x) => x.table === 'bug_reports')).toBe(false);
  });

  it('refuses an administrator key (jkkn_…) without looking it up', async () => {
    const res = await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, 'jkkn_' + 'a'.repeat(48)));
    expect(res.status).toBe(401);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('refuses a row of kind admin even with the intake prefix (403)', async () => {
    const res = await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, ADMIN_KIND_KEY));
    expect(res.status).toBe(403);
    expect(queries.some((x) => x.table === 'bug_reports')).toBe(false);
  });

  it('refuses a wrong intake key (401) and a missing key (401)', async () => {
    const wrong = await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, 'jkkn_bi_' + '00'.repeat(24)));
    expect(wrong.status).toBe(401);
    const none = await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, null));
    expect(none.status).toBe(401);
    expect(queries.some((x) => x.table === 'bug_reports')).toBe(false);
  });

  it('validates status and sort_by; accepts duplicate (a MyJKKN status)', async () => {
    expect((await listMine(req(`/api/v1/public/bug-reports/me${q(ME, '&status=open')}`, MENTOR_KEY))).status).toBe(400);
    expect((await listMine(req(`/api/v1/public/bug-reports/me${q(ME, '&sort_by=priority')}`, MENTOR_KEY))).status).toBe(400);
    const dup = await listMine(req(`/api/v1/public/bug-reports/me${q(ME, '&status=duplicate')}`, MENTOR_KEY));
    expect(dup.status).toBe(200);
    expect((await dup.json()).data.bug_reports).toEqual([]);
  });

  it('rate-limits reads per key and caller after 60 a minute (429)', async () => {
    for (let i = 0; i < 60; i++) {
      expect((await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, MENTOR_KEY))).status).toBe(200);
    }
    const res = await listMine(req(`/api/v1/public/bug-reports/me${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });

  it('answers the CORS preflight with GET and X-API-Key allowed', async () => {
    const res = await meOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toMatch(/GET/);
    expect(res.headers.get('access-control-allow-headers')).toMatch(/X-API-Key/i);
  });
});

describe('GET /api/v1/public/bug-reports/[id]', () => {
  it("returns the reporter's own bug, minimal, with the public thread only", async () => {
    const res = await getOne(req(`/api/v1/public/bug-reports/${BUG_MINE}${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.bug_report.id).toBe(BUG_MINE);
    expect(json.data.bug_report.metadata.title).toBe(`Title of ${BUG_MINE}`);
    expect(json.data.messages.map((m: Row) => [m.id, m.author_kind])).toEqual([
      ['m1', 'team'],
      ['m4', 'reporter'],
    ]);
    expectNoLeak(json);
  });

  it('leaves the thread out with include_messages=false', async () => {
    const res = await getOne(
      req(`/api/v1/public/bug-reports/${BUG_MINE}${q(ME, '&include_messages=false')}`, MENTOR_KEY));
    const json = await res.json();
    expect(json.data.messages).toBeUndefined();
    expect(queries.some((x) => x.table === 'bug_report_messages')).toBe(false);
  });

  it("answers 404 for another reporter's bug, the same as for no bug", async () => {
    const res = await getOne(
      req(`/api/v1/public/bug-reports/${BUG_OTHER_REPORTER}${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toEqual({ code: 'BUG_REPORT_NOT_FOUND', message: 'Bug report not found' });
    const none = await getOne(
      req(`/api/v1/public/bug-reports/22222222-0000-4000-8000-00000000ffff${q(ME)}`, MENTOR_KEY));
    expect(await none.json()).toEqual(json);
  });

  it("answers 404 for the reporter's own bug filed in another app", async () => {
    const res = await getOne(
      req(`/api/v1/public/bug-reports/${BUG_MINE_OTHER_APP}${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(404);
  });

  it('answers 404 (not 500) for an id that is not a UUID', async () => {
    const res = await getOne(req(`/api/v1/public/bug-reports/BUG-1${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(404);
  });

  it('refuses an administrator key, a wrong key, and a missing reporter_email', async () => {
    const admin = await getOne(req(`/api/v1/public/bug-reports/${BUG_MINE}${q(ME)}`, 'jkkn_' + 'a'.repeat(48)));
    expect(admin.status).toBe(401);
    const wrong = await getOne(req(`/api/v1/public/bug-reports/${BUG_MINE}${q(ME)}`, 'jkkn_bi_' + '00'.repeat(24)));
    expect(wrong.status).toBe(401);
    const noEmail = await getOne(req(`/api/v1/public/bug-reports/${BUG_MINE}`, MENTOR_KEY));
    expect(noEmail.status).toBe(400);
    expect(queries.some((x) => x.table === 'bug_reports')).toBe(false);
  });
});

describe('/api/v1/public/bug-reports/[id]/messages', () => {
  it("GET returns the reporter's own public thread, authors reduced to reporter/team", async () => {
    const res = await getMessages(
      req(`/api/v1/public/bug-reports/${BUG_MINE}/messages${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.messages).toEqual([
      { id: 'm1', bug_report_id: BUG_MINE, message_text: 'We are looking at it', message_type: 'text', author_kind: 'team', created_at: '2026-10-10T02:00:00Z' },
      { id: 'm4', bug_report_id: BUG_MINE, message_text: 'Thanks', message_type: 'text', author_kind: 'reporter', created_at: '2026-10-10T05:00:00Z' },
    ]);
    expectNoLeak(json);
  });

  it("GET answers 404 for another reporter's bug and never reads its thread", async () => {
    const res = await getMessages(
      req(`/api/v1/public/bug-reports/${BUG_OTHER_REPORTER}/messages${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(404);
    expect(queries.some((x) => x.table === 'bug_report_messages')).toBe(false);
  });

  it("GET answers 404 for another app's bug", async () => {
    const res = await getMessages(
      req(`/api/v1/public/bug-reports/${BUG_MINE_OTHER_APP}/messages${q(ME)}`, MENTOR_KEY));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('tms thread');
  });

  it('GET refuses an administrator key and a wrong key', async () => {
    const admin = await getMessages(
      req(`/api/v1/public/bug-reports/${BUG_MINE}/messages${q(ME)}`, 'jkkn_' + 'a'.repeat(48)));
    expect(admin.status).toBe(401);
    const wrong = await getMessages(
      req(`/api/v1/public/bug-reports/${BUG_MINE}/messages${q(ME)}`, 'jkkn_bi_' + '00'.repeat(24)));
    expect(wrong.status).toBe(401);
  });

  it('POST answers 501 for a valid key and writes nothing', async () => {
    const res = await postMessage(
      req(`/api/v1/public/bug-reports/${BUG_MINE}/messages`, MENTOR_KEY, {
        method: 'POST',
        body: { bug_report_id: BUG_MINE, message: 'hello', reporter_email: ME },
      })
    );
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_IMPLEMENTED');
    expect(queries.some((x) => x.table === 'bug_report_messages' || x.table === 'bug_reports')).toBe(false);
  });

  it('POST still refuses an administrator key and a wrong key (401)', async () => {
    const admin = await postMessage(
      req(`/api/v1/public/bug-reports/${BUG_MINE}/messages`, 'jkkn_' + 'a'.repeat(48), { method: 'POST', body: {} })
    );
    expect(admin.status).toBe(401);
    const wrong = await postMessage(
      req(`/api/v1/public/bug-reports/${BUG_MINE}/messages`, 'jkkn_bi_' + '00'.repeat(24), { method: 'POST', body: {} })
    );
    expect(wrong.status).toBe(401);
  });
});

describe('GET /api/v1/public/leaderboard/[applicationId]', () => {
  it('answers a well-formed, switched-off, empty leaderboard', async () => {
    const res = await getLeaderboard(req('/api/v1/public/leaderboard/any-app-id?period=weekly', MENTOR_KEY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ enabled: false, leaderboard: [], period: 'weekly' });
    expect(queries.some((x) => x.table === 'bug_reports')).toBe(false);
  });

  it('defaults to all-time and rejects an unknown period', async () => {
    const ok = await (await getLeaderboard(req('/api/v1/public/leaderboard/x', MENTOR_KEY))).json();
    expect(ok.data.period).toBe('all-time');
    expect((await getLeaderboard(req('/api/v1/public/leaderboard/x?period=daily', MENTOR_KEY))).status).toBe(400);
  });

  it('refuses an administrator key and a wrong key', async () => {
    expect((await getLeaderboard(req('/api/v1/public/leaderboard/x', 'jkkn_' + 'a'.repeat(48)))).status).toBe(401);
    expect((await getLeaderboard(req('/api/v1/public/leaderboard/x', 'jkkn_bi_' + '00'.repeat(24)))).status).toBe(401);
  });
});
