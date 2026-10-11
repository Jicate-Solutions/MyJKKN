/**
 * POST /api/v1/public/bug-reports — the college apps' bug button.
 *
 * The route must:
 *   - accept ONLY a live bug_intake key sent as X-API-Key (an admin key —
 *     like the apps' learner-reading MYJKKN_API_KEY — is refused, never looked
 *     up when it lacks the jkkn_bi_ prefix, and refused by kind when it has it)
 *   - refuse an oversize screenshot before inserting anything
 *   - insert into bug_reports with application_id = the key's app, status
 *     'unverified' (quarantine), and NO reporter: the claimed email is never matched to a profile
 *     (reporter_user_id, institution_id, department_id stay null), so nobody
 *     can plant a bug in a colleague's list; email and name stay in metadata
 *   - rate-limit per IP before any lookup, cap each app per day, and answer a
 *     double-submit with the bug already filed
 *   - store the screenshot in the 'bug-reports' bucket at <id>/screenshot.png
 *   - answer in the SDK's envelope { success, data: { bug_report, message } }
 */
import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const state = {
  keyRow: null as Row | null,
  app: null as Row | null,
  todayCount: 0,
  // rows with no over_cap flag (full rows) today
  fullCount: 0,
  callerCount: 0,
  shotCount: 0,
  countError: null as { message: string } | null,
  recent: [] as Row[],
  winner: [] as Row[],
  insertError: null as { message: string } | null,
  inserted: [] as Row[],
  updates: [] as Row[],
  uploads: [] as { bucket: string; path: string; size: number; contentType?: string }[],
  lookups: [] as { table: string; col: string; val: unknown }[],
};

function builder(table: string) {
  const b: Record<string, any> = {};
  let pendingInsert: Row | null = null;
  let pendingUpdate: Row | null = null;
  let isCount = false;
  let byCaller = false;
  let byDedupIn = false;
  let byShot = false;
  let byFull = false;
  b.is = (col: string, val: unknown) => {
    if (col === 'metadata->>over_cap' && val === null) byFull = true;
    return b;
  };
  b.select = (_cols?: string, opts?: { head?: boolean }) => {
    if (opts?.head) isCount = true;
    return b;
  };
  b.limit = () => b;
  b.gte = () => b;
  b.eq = (col: string, val: unknown) => {
    state.lookups.push({ table, col, val });
    if (col === 'metadata->>client_ip_hash') byCaller = true;
    return b;
  };
  b.not = () => {
    byShot = true;
    return b;
  };
  b.in = () => {
    byDedupIn = true;
    return b;
  };
  b.insert = (row: Row) => {
    pendingInsert = row;
    return b;
  };
  b.update = (row: Row) => {
    pendingUpdate = row;
    return b;
  };
  b.maybeSingle = async () => {
    if (table === 'api_keys') return { data: state.keyRow, error: null };
    if (table === 'sibling_apps') return { data: state.app, error: null };
    return { data: null, error: null };
  };
  b.single = async () => {
    if (table === 'bug_reports' && pendingInsert) {
      if (state.insertError) return { data: null, error: state.insertError };
      state.inserted.push(pendingInsert);
      return {
        data: { ...pendingInsert, id: 'bug-1', display_id: 'BUG-009001', created_at: '2026-10-10T00:00:00Z' },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  b.then = (resolve: (v: unknown) => unknown) => {
    if (table === 'bug_reports' && pendingUpdate) {
      state.updates.push(pendingUpdate);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    }
    if (isCount) {
      const count = byCaller
        ? state.callerCount
        : byShot
          ? state.shotCount
          : byFull
            ? state.fullCount
            : state.todayCount;
      return Promise.resolve({ data: null, count, error: state.countError }).then(resolve);
    }
    const data = table !== 'bug_reports' ? [] : byDedupIn ? state.recent : state.winner;
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return b;
}

const fromSpy = vi.fn((t: string) => builder(t));
const storage = {
  from: (bucket: string) => ({
    upload: async (path: string, buf: Buffer, opts: { contentType?: string }) => {
      state.uploads.push({ bucket, path, size: buf.length, contentType: opts?.contentType });
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` },
    }),
  }),
};

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: fromSpy, storage })),
}));

vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: vi.fn(),
  extractRequestMeta: () => ({ ipAddress: '203.0.113.9', userAgent: 'test-agent' }),
}));

import { POST, OPTIONS } from '@/app/api/v1/public/bug-reports/route';
import { _resetForTesting } from '@/lib/api-keys/rate-limiter';
import { MAX_SCREENSHOT_BYTES } from '@/lib/bug-reports/sibling-intake';

const INTAKE_KEY = 'jkkn_bi_' + 'ab'.repeat(24);
const INTAKE_HASH = createHash('sha256').update(INTAKE_KEY).digest('hex');
const APP = { id: 'app-mentor', slug: 'mentor', name: 'Mentor', is_active: true };

// 1x1 transparent PNG
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function body(extra: Row = {}): Row {
  return {
    title: 'Save button does nothing',
    description: 'Clicking save on the mentor notes page does nothing at all.',
    page_url: 'https://mentor.jkkn.ai/notes/42',
    category: 'bug',
    screenshot_data_url: PNG_DATA_URL,
    console_logs: [{ level: 'error', message: 'boom' }],
    network_trace: [],
    metadata: { userAgent: 'UA', viewport: '1280x720', screenResolution: '1920x1080', timestamp: 't' },
    reporter_email: 'Mentor.One@jkkn.ac.in',
    reporter_name: 'Mentor One',
    ...extra,
  };
}

function post(key: string | null, payload: unknown = body()) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-vercel-forwarded-for': '203.0.113.9',
  };
  if (key !== null) headers['x-api-key'] = key;
  return POST(
    new NextRequest('https://www.jkkn.ai/api/v1/public/bug-reports', {
      method: 'POST',
      headers,
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
  );
}

beforeEach(() => {
  _resetForTesting();
  process.env.BUG_INTAKE_IP_PEPPER = 'test-pepper';
  process.env.VERCEL = '1';
  fromSpy.mockClear();
  state.keyRow = {
    id: 'key-1',
    is_active: true,
    expires_at: null,
    key_kind: 'bug_intake',
    sibling_app_id: APP.id,
  };
  state.app = { ...APP };
  state.todayCount = 0;
  state.fullCount = 0;
  state.callerCount = 0;
  state.shotCount = 0;
  state.countError = null;
  state.recent = [];
  state.winner = [];
  state.insertError = null;
  state.inserted = [];
  state.updates = [];
  state.uploads = [];
  state.lookups = [];
});

describe('POST /api/v1/public/bug-reports — happy path', () => {
  it('files the bug for the key\'s app, stores the screenshot, and answers in the SDK envelope', async () => {
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.message).toMatch(/submitted/i);
    expect(json.data.bug_report).toMatchObject({
      id: 'bug-1',
      display_id: 'BUG-009001',
      status: 'unverified',
      title: 'Save button does nothing',
      // the stored picture's public URL is never handed back
      screenshot_url: null,
    });

    // the key was looked up by its SHA-256, never by plaintext
    expect(state.lookups).toContainEqual({ table: 'api_keys', col: 'key_value', val: INTAKE_HASH });
    expect(JSON.stringify(state.lookups)).not.toContain(INTAKE_KEY);

    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0] as Record<string, any>;
    expect(row).toMatchObject({
      application_id: APP.id,
      reporter_user_id: null,
      institution_id: null,
      department_id: null,
      // quarantine: no automation reads 'unverified'
      status: 'unverified',
      category: 'bug',
      page_url: 'https://mentor.jkkn.ai/notes/42',
    });
    // module_name is a GENERATED column — writing it would fail the insert
    expect(row).not.toHaveProperty('module_name');
    expect(row).not.toHaveProperty('display_id');
    expect(row.metadata).toMatchObject({
      source: 'sibling_app',
      source_app: 'mentor',
      source_app_name: 'Mentor',
      title: 'Save button does nothing',
      reporter_email: 'mentor.one@jkkn.ac.in',
      reporter_name: 'Mentor One',
      reporter_verified: false,
      intake_dedup_key: expect.stringMatching(/^[0-9a-f]{64}$/),
      client_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    // the caller's IP is stored only as a hash
    expect(JSON.stringify(row)).not.toContain('203.0.113.9');

    // the claimed email is never looked up against MyJKKN profiles
    expect(fromSpy.mock.calls.map((c) => c[0])).not.toContain('profiles');

    expect(state.uploads).toEqual([
      {
        bucket: 'bug-reports',
        // unguessable: the bug id alone does not give the file's URL
        path: expect.stringMatching(/^sibling\/bug-1\/[0-9a-f-]{36}\.png$/),
        size: expect.any(Number),
        contentType: 'image/png',
      },
    ]);
    expect(state.updates).toEqual([
      { screenshot_url: expect.stringMatching(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/bug-reports\/sibling\/bug-1\//) },
    ]);
  });

  it('cannot plant a bug on a colleague: even a colleague email files with no reporter', async () => {
    const res = await post(INTAKE_KEY, body({ reporter_email: 'principal@jkkn.ac.in' }));
    expect(res.status).toBe(201);
    const row = state.inserted[0] as Record<string, any>;
    expect(row.reporter_user_id).toBeNull();
    expect(row.institution_id).toBeNull();
    expect(row.department_id).toBeNull();
    expect(row.metadata.reporter_email).toBe('principal@jkkn.ac.in');
    expect(row.metadata.reporter_verified).toBe(false);
  });

  it('answers the CORS preflight with X-API-Key allowed', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toMatch(/X-API-Key/i);
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
  });
});

describe('POST /api/v1/public/bug-reports — keys', () => {
  it('refuses a request with no key (401) and touches nothing', async () => {
    const res = await post(null);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toMatch(/X-API-Key/);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('refuses a key sent as Authorization: Bearer instead of X-API-Key', async () => {
    const res = await POST(
      new NextRequest('https://www.jkkn.ai/api/v1/public/bug-reports', {
        method: 'POST',
        headers: { authorization: `Bearer ${INTAKE_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(body()),
      })
    );
    expect(res.status).toBe(401);
  });

  it('refuses a wrong bug-intake key (no such row) with 401', async () => {
    state.keyRow = null;
    const res = await post('jkkn_bi_' + 'cd'.repeat(24));
    expect(res.status).toBe(401);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses an administrator key (jkkn_…) without even looking it up', async () => {
    const res = await post('jkkn_' + 'e'.repeat(32));
    expect(res.status).toBe(401);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses a personal key (jkkn_pk_…) without looking it up', async () => {
    const res = await post('jkkn_pk_' + 'f'.repeat(48));
    expect(res.status).toBe(401);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('refuses a row of kind admin even when the presented key has the intake prefix (403)', async () => {
    state.keyRow = { id: 'key-9', is_active: true, expires_at: null, key_kind: 'admin', sibling_app_id: null };
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(403);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses an expired intake key', async () => {
    state.keyRow = { ...state.keyRow!, expires_at: '2020-01-01T00:00:00Z' };
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(401);
  });

  it('refuses when the key\'s app is turned off (403)', async () => {
    state.app = { ...APP, is_active: false };
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(403);
    expect(state.inserted).toHaveLength(0);
  });

  it('rate-limits one caller on one key after 60 a minute', async () => {
    for (let i = 0; i < 60; i++) {
      const ok = await post(INTAKE_KEY, { not: 'valid' });
      expect(ok.status).toBe(400);
    }
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST /api/v1/public/bug-reports — abuse limits', () => {
  it('limits a flood of made-up keys from one IP before any database lookup', async () => {
    state.keyRow = null;
    for (let i = 0; i < 60; i++) {
      const res = await post('jkkn_bi_' + String(i).padStart(48, '0'));
      expect(res.status).toBe(401);
    }
    const lookupsBefore = fromSpy.mock.calls.length;
    const res = await post('jkkn_bi_' + 'z'.repeat(48));
    expect(res.status).toBe(429);
    expect(fromSpy.mock.calls.length).toBe(lookupsBefore);
  });

  it('past the full-row budget, still files the report, MINIMAL: title, description and page_url only', async () => {
    state.todayCount = 300;
    state.fullCount = 300;
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(201);
    const row = state.inserted[0] as any;
    expect(row.metadata.over_cap).toBe('app');
    expect(row.metadata.screenshot_dropped).toBe('over_cap');
    expect(state.uploads).toHaveLength(0);
    expect(row).toMatchObject({
      description: 'Clicking save on the mentor notes page does nothing at all.',
      page_url: 'https://mentor.jkkn.ai/notes/42',
      console_logs: null,
      reporter_user_agent: null,
    });
    expect(row.metadata.title).toBe('Save button does nothing');
    for (const k of ['reporter_email', 'reporter_name', 'client_metadata', 'network_trace', 'browser_info', 'system_info']) {
      expect(row.metadata, k).not.toHaveProperty(k);
    }
  });

  it('minimal rows never use up the full-row budget: the budget counts only rows with no over_cap flag', async () => {
    state.todayCount = 1500; // many minimal rows today ...
    state.fullCount = 10; // ... but only 10 full ones
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(201);
    const row = state.inserted[0] as any;
    expect(row.metadata.over_cap).toBeNull();
    expect(row.console_logs).toEqual([{ level: 'error', message: 'boom' }]);
  });

  it('a heavy caller is refused at the ceiling; a light caller still has the reserve', async () => {
    state.todayCount = 2000;
    state.fullCount = 300;
    state.callerCount = 40; // heavy
    const heavy = await post(INTAKE_KEY);
    expect(heavy.status).toBe(429);
    expect((await heavy.json()).error.code).toBe('RATE_LIMITED');
    expect(state.inserted).toHaveLength(0);

    state.callerCount = 3; // light, same day, same app
    const light = await post(INTAKE_KEY, body({ title: 'another bug' }));
    expect(light.status).toBe(201);
    expect((state.inserted[0] as any).metadata.over_cap).toBe('app');
  });

  it('a light caller is refused only past ceiling + reserve (2,500)', async () => {
    state.todayCount = 2499;
    state.fullCount = 300;
    expect((await post(INTAKE_KEY)).status).toBe(201);
    state.todayCount = 2500;
    const res = await post(INTAKE_KEY, body({ title: 'one more' }));
    expect(res.status).toBe(429);
    expect(state.inserted).toHaveLength(1);
  });

  it('refuses with 503 when BUG_INTAKE_IP_PEPPER is not set (no reversible hash)', async () => {
    delete process.env.BUG_INTAKE_IP_PEPPER;
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(503);
    expect(state.inserted).toHaveLength(0);
  });

  it('groups IPv6 callers by /64', async () => {
    const send = (ip: string, title: string) =>
      POST(
        new NextRequest('https://www.jkkn.ai/api/v1/public/bug-reports', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': INTAKE_KEY, 'x-vercel-forwarded-for': ip },
          body: JSON.stringify(body({ title })),
        })
      );
    await send('2001:db8:aa:bb:1:2:3:4', 'first');
    await send('2001:db8:aa:bb:ffff::9', 'second');
    await send('2001:db8:aa:cc::1', 'third');
    const [a, b, c] = state.inserted.map((r: any) => r.metadata.client_ip_hash);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('over one caller\'s cap, still files the report, flagged and without its screenshot', async () => {
    state.callerCount = 40;
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(201);
    expect((state.inserted[0] as any).metadata.over_cap).toBe('caller');
    expect(state.uploads).toHaveLength(0);
  });

  it('fails closed (503) when the cap cannot be counted', async () => {
    state.countError = { message: 'db down' };
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(503);
    expect(state.inserted).toHaveLength(0);
  });

  it('answers a retry with the bug already filed even when the app is at its cap', async () => {
    state.todayCount = 300;
    state.recent = [{ id: 'bug-0', display_id: 'BUG-009000', description: 'd', category: 'bug', status: 'new', page_url: 'p', screenshot_url: null, created_at: 't' }];
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(200);
    expect((await res.json()).data.bug_report.id).toBe('bug-0');
  });

  it('when two identical submits race, the loser answers with the winner', async () => {
    state.insertError = { message: 'duplicate key value violates unique constraint "uq_bug_reports_intake_dedup"' };
    state.winner = [{ id: 'bug-w', display_id: 'BUG-009002', description: 'd', category: 'bug', status: 'new', page_url: 'p', screenshot_url: null, created_at: 't' }];
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(200);
    expect((await res.json()).data.bug_report.id).toBe('bug-w');
  });

  it('keeps the report but drops the screenshot past the daily screenshot budget', async () => {
    state.shotCount = 100;
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(201);
    expect(state.uploads).toHaveLength(0);
    expect((state.inserted[0] as any).metadata.screenshot_dropped).toBe('daily_budget');
  });

  it('never echoes a stored screenshot URL on a repeat', async () => {
    state.recent = [{ id: 'bug-0', display_id: 'B', description: 'd', category: 'bug', status: 'unverified', page_url: 'p', screenshot_url: 'https://x/secret.png', created_at: 't' }];
    const res = await post(INTAKE_KEY);
    expect((await res.json()).data.bug_report.screenshot_url).toBeNull();
  });

  it('with no platform IP, skips the double-submit check and the per-caller cap', async () => {
    state.callerCount = 999; // would refuse if the per-caller cap ran
    state.recent = [{ id: 'bug-0', display_id: 'B', description: 'd', category: 'bug', status: 'unverified', page_url: 'p', screenshot_url: null, created_at: 't' }];
    const res = await POST(
      new NextRequest('https://www.jkkn.ai/api/v1/public/bug-reports', {
        method: 'POST',
        // a client-set x-forwarded-for is NOT trusted as the caller
        headers: { 'content-type': 'application/json', 'x-api-key': INTAKE_KEY, 'x-forwarded-for': '198.51.100.7' },
        body: JSON.stringify(body()),
      })
    );
    expect(res.status).toBe(201);
    const row = state.inserted[0] as any;
    expect(row.metadata.client_ip_hash).toBeNull();
    expect(row.metadata.intake_dedup_key).toBeNull();
  });

  it('answers a double-submit with the bug already filed, inserting nothing', async () => {
    state.recent = [
      {
        id: 'bug-0',
        display_id: 'BUG-009000',
        description: 'Clicking save on the mentor notes page does nothing at all.',
        category: 'bug',
        status: 'new',
        page_url: 'https://mentor.jkkn.ai/notes/42',
        screenshot_url: null,
        created_at: '2026-10-10T00:00:00Z',
      },
    ];
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.bug_report.id).toBe('bug-0');
    expect(state.inserted).toHaveLength(0);
    expect(state.uploads).toHaveLength(0);
  });

  it('a double-submit hit never reveals the stored bug\'s triage status or text', async () => {
    state.recent = [{ id: 'bug-0', display_id: 'BUG-009000', created_at: 't', status: 'in_progress', description: 'other' }];
    const json = await (await post(INTAKE_KEY)).json();
    expect(json.data.bug_report).toMatchObject({
      id: 'bug-0',
      display_id: 'BUG-009000',
      status: 'unverified',
      description: 'Clicking save on the mentor notes page does nothing at all.',
    });
  });

  it('IPv6 addresses inside one /64 share the per-minute bucket, so rotating them opens no new one', async () => {
    state.keyRow = null;
    const send = (ip: string) =>
      POST(
        new NextRequest('https://www.jkkn.ai/api/v1/public/bug-reports', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': 'jkkn_bi_' + '1'.repeat(48), 'x-vercel-forwarded-for': ip },
          body: JSON.stringify(body()),
        })
      );
    for (let i = 0; i < 60; i++) expect((await send(`2001:db8:aa:bb::${(i + 1).toString(16)}`)).status).toBe(401);
    const before = fromSpy.mock.calls.length;
    expect((await send('2001:db8:aa:bb:ffff:1:2:3')).status).toBe(429);
    expect(fromSpy.mock.calls.length).toBe(before);
    // another /64 is another caller
    expect((await send('2001:db8:aa:cc::1')).status).toBe(401);
  });

  it('an IPv4-mapped IPv6 caller is its IPv4 address, not one shared ::/64 bucket', async () => {
    const send = (ip: string, title: string) =>
      POST(
        new NextRequest('https://www.jkkn.ai/api/v1/public/bug-reports', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': INTAKE_KEY, 'x-vercel-forwarded-for': ip },
          body: JSON.stringify(body({ title })),
        })
      );
    await send('::ffff:203.0.113.9', 'mapped');
    await send('203.0.113.9', 'plain');
    await send('::ffff:198.51.100.7', 'stranger');
    const [mapped, plain, stranger] = state.inserted.map((r: any) => r.metadata.client_ip_hash);
    expect(mapped).toBe(plain);
    expect(mapped).not.toBe(stranger);
  });
});

describe('POST /api/v1/public/bug-reports — every stored row is size-bounded', () => {
  const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');
  const big = (n: number) => 'x'.repeat(n);

  it('console_logs + network_trace together are trimmed to 64 KB, newest kept', async () => {
    const logs = Array.from({ length: 200 }, (_, i) => ({ i, message: big(2_000) }));
    const trace = Array.from({ length: 50 }, (_, i) => ({ i, url: big(2_000) }));
    const res = await post(INTAKE_KEY, body({ console_logs: logs, network_trace: trace, screenshot_data_url: null }));
    expect(res.status).toBe(201);
    const row = state.inserted[0] as any;
    expect(bytes(row.console_logs) + (row.metadata.network_trace ? bytes(row.metadata.network_trace) : 0)).toBeLessThanOrEqual(
      64_000
    );
    expect(row.console_logs.at(-1).i).toBe(199); // newest kept
    expect(row.metadata.over_cap).toBeNull();
  });

  it('caps client metadata, browser and system info; one huge entry cannot blow the row', async () => {
    const res = await post(
      INTAKE_KEY,
      body({
        metadata: { userAgent: 'UA', blob: big(30_000) },
        browser_info: { blob: big(10_000) },
        system_info: big(10_000),
        console_logs: [{ message: big(100_000) }, { message: 'small' }],
        screenshot_data_url: null,
      })
    );
    expect(res.status).toBe(201);
    const row = state.inserted[0] as any;
    expect(row.metadata.client_metadata).toBeNull();
    expect(row.metadata.browser_info).toBeNull();
    expect(row.metadata.system_info).toBeNull();
    expect(row.console_logs).toEqual([{ message: 'small' }]);
    expect(bytes(row)).toBeLessThanOrEqual(200_000);
  });

  it('the largest body the schema allows still stores within 200 KB (full) or 24 KB (minimal)', async () => {
    // 20,000 three-byte characters: the most UTF-8 a description can carry
    const worst = body({
      title: '語'.repeat(300),
      description: '語'.repeat(20_000),
      page_url: 'https://mentor.jkkn.ai/' + 'a'.repeat(1_970),
      reporter_name: '語'.repeat(200),
      reporter_email: 'a'.repeat(300) + '@jkkn.ac.in',
      metadata: { userAgent: big(3_900), blob: big(15_000) },
      browser_info: big(3_900),
      system_info: big(3_900),
      console_logs: Array.from({ length: 200 }, () => ({ message: big(1_000) })),
      network_trace: Array.from({ length: 50 }, () => ({ url: big(1_000) })),
      screenshot_data_url: null,
    });
    expect((await post(INTAKE_KEY, worst)).status).toBe(201);
    expect(bytes(state.inserted[0])).toBeLessThanOrEqual(200_000);

    state.fullCount = 300; // now minimal
    expect((await post(INTAKE_KEY, { ...worst, title: '語'.repeat(299) })).status).toBe(201);
    const minimal = state.inserted[1] as any;
    expect(minimal.metadata.over_cap).toBe('app');
    expect(minimal.metadata.description_clipped).toBe(true);
    expect(bytes(minimal)).toBeLessThanOrEqual(24_000);
  });
});

describe('POST /api/v1/public/bug-reports — body', () => {
  it('refuses an oversize screenshot with 413 before inserting anything', async () => {
    const tooBig = 'data:image/png;base64,' + 'A'.repeat(Math.ceil(((MAX_SCREENSHOT_BYTES + 1024) * 4) / 3));
    const res = await post(INTAKE_KEY, body({ screenshot_data_url: tooBig }));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(state.inserted).toHaveLength(0);
    expect(state.uploads).toHaveLength(0);
  });

  it('refuses a screenshot that is not an image data URL', async () => {
    const res = await post(INTAKE_KEY, body({ screenshot_data_url: 'data:text/html;base64,PGgxPg==' }));
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses a body without title, description or page_url', async () => {
    const res = await post(INTAKE_KEY, { description: 'short' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'http://mentor.jkkn.ai/x'])(
    'refuses page_url %s (https only)',
    async (url) => {
      const res = await post(INTAKE_KEY, body({ page_url: url }));
      expect(res.status).toBe(400);
      expect(state.inserted).toHaveLength(0);
    }
  );

  it('refuses a "PNG" whose bytes are not a PNG', async () => {
    const fake = 'data:image/png;base64,' + Buffer.from('<html>not an image</html>').toString('base64');
    const res = await post(INTAKE_KEY, body({ screenshot_data_url: fake }));
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses a body that is not JSON', async () => {
    const res = await post(INTAKE_KEY, 'not json{');
    expect(res.status).toBe(400);
  });

  it('files a report with no screenshot', async () => {
    const res = await post(INTAKE_KEY, body({ screenshot_data_url: undefined }));
    expect(res.status).toBe(201);
    expect(state.uploads).toHaveLength(0);
    const json = await res.json();
    expect(json.data.bug_report.screenshot_url).toBeNull();
  });
});
