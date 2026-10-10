/**
 * POST /api/v1/public/bug-reports — the college apps' bug button.
 *
 * The route must:
 *   - accept ONLY a live bug_intake key sent as X-API-Key (an admin key —
 *     like the apps' learner-reading MYJKKN_API_KEY — is refused, never looked
 *     up when it lacks the jkkn_bi_ prefix, and refused by kind when it has it)
 *   - refuse an oversize screenshot before inserting anything
 *   - insert into bug_reports with application_id = the key's app, status
 *     'new', reporter matched by email (null when no single match), the email
 *     and name kept in metadata
 *   - store the screenshot in the 'bug-reports' bucket at <id>/screenshot.png
 *   - answer in the SDK's envelope { success, data: { bug_report, message } }
 *     without saying whether the email matched a MyJKKN account
 */
import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const state = {
  keyRow: null as Row | null,
  app: null as Row | null,
  profiles: [] as Row[],
  inserted: [] as Row[],
  updates: [] as Row[],
  uploads: [] as { bucket: string; path: string; size: number; contentType?: string }[],
  lookups: [] as { table: string; col: string; val: unknown }[],
  ilikes: [] as unknown[],
};

function builder(table: string) {
  const b: Record<string, any> = {};
  let pendingInsert: Row | null = null;
  let pendingUpdate: Row | null = null;
  b.select = () => b;
  b.limit = () => b;
  b.eq = (col: string, val: unknown) => {
    state.lookups.push({ table, col, val });
    return b;
  };
  b.ilike = (_col: string, val: unknown) => {
    state.ilikes.push(val);
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
      state.inserted.push(pendingInsert);
      return {
        data: { ...pendingInsert, id: 'bug-1', display_id: 'BUG-009001', created_at: '2026-10-10T00:00:00Z' },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  b.then = (resolve: (v: unknown) => unknown) => {
    if (table === 'bug_reports' && pendingUpdate) state.updates.push(pendingUpdate);
    const data = table === 'profiles' ? state.profiles : [];
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
    reporter_email: 'Faculty.One@jkkn.ac.in',
    reporter_name: 'Faculty One',
    ...extra,
  };
}

function post(key: string | null, payload: unknown = body()) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
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
  fromSpy.mockClear();
  state.keyRow = {
    id: 'key-1',
    is_active: true,
    expires_at: null,
    key_kind: 'bug_intake',
    sibling_app_id: APP.id,
  };
  state.app = { ...APP };
  state.profiles = [{ id: 'user-1', institution_id: 'inst-1', department_id: 'dept-1' }];
  state.inserted = [];
  state.updates = [];
  state.uploads = [];
  state.lookups = [];
  state.ilikes = [];
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
      status: 'new',
      title: 'Save button does nothing',
      screenshot_url: 'https://proj.supabase.co/storage/v1/object/public/bug-reports/bug-1/screenshot.png',
    });
    // never tells the caller whether the email has a MyJKKN account
    expect(JSON.stringify(json)).not.toContain('user-1');

    // the key was looked up by its SHA-256, never by plaintext
    expect(state.lookups).toContainEqual({ table: 'api_keys', col: 'key_value', val: INTAKE_HASH });
    expect(JSON.stringify(state.lookups)).not.toContain(INTAKE_KEY);

    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0] as Record<string, any>;
    expect(row).toMatchObject({
      application_id: APP.id,
      reporter_user_id: 'user-1',
      institution_id: 'inst-1',
      department_id: 'dept-1',
      status: 'new',
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
      reporter_email: 'faculty.one@jkkn.ac.in',
      reporter_name: 'Faculty One',
      reporter_verified: false,
    });

    // the email is matched literally (LIKE wildcards escaped), case-insensitively
    expect(state.ilikes).toEqual(['faculty.one@jkkn.ac.in']);

    expect(state.uploads).toEqual([
      { bucket: 'bug-reports', path: 'bug-1/screenshot.png', size: expect.any(Number), contentType: 'image/png' },
    ]);
    expect(state.updates).toEqual([
      { screenshot_url: 'https://proj.supabase.co/storage/v1/object/public/bug-reports/bug-1/screenshot.png' },
    ]);
  });

  it('files with no reporter when the email matches no single profile', async () => {
    state.profiles = [];
    const res = await post(INTAKE_KEY);
    expect(res.status).toBe(201);
    const row = state.inserted[0] as Record<string, any>;
    expect(row.reporter_user_id).toBeNull();
    expect(row.institution_id).toBeNull();
    expect(row.metadata.reporter_email).toBe('faculty.one@jkkn.ac.in');
  });

  it('escapes LIKE wildcards in the claimed email', async () => {
    state.profiles = [];
    await post(INTAKE_KEY, body({ reporter_email: 'a_b%c@x.in' }));
    expect(state.ilikes).toEqual(['a\\_b\\%c@x.in']);
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
