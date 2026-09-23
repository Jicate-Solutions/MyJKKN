// Gmail/Drive read for the AI Assistant — the properties that must hold:
//   - bearer AND cookie auth both work, and a bad bearer never falls back to a cookie
//   - one person's token can never read another person's mail
//   - switch off → "not switched on yet", Google never called
//   - text is trimmed to 20,000 characters
//   - the OAuth state of one flow is refused by the other
//
// The fake Supabase client mirrors the database rule that matters: every
// fn_ai_google_read_* function answers for auth.uid() — the identity the
// client was created with — and takes no person id.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── fake world ───────────────────────────────────────────────────────────────

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

interface World {
  enabled: boolean;
  permitted: Set<string>;
  tokens: Record<string, string>; // supabase access token → user id
  cookieUser: string | null;
  vault: Record<string, { email: string; refresh: string; scopes: string[] } | undefined>;
  statuses: Record<string, string | undefined>;
  audit: Array<{ uid: string; tool: string; outcome: string }>;
  brokenMarked: string[];
  cookieClientCreated: number;
}

const world: World = {} as World;

function resetWorld() {
  world.enabled = true;
  world.permitted = new Set([USER_A, USER_B]);
  world.tokens = { 'tok-A': USER_A, 'tok-B': USER_B };
  world.cookieUser = null;
  world.vault = {
    [USER_A]: { email: 'a@jkkn.ac.in', refresh: 'refresh-A', scopes: [GMAIL_SCOPE, DRIVE_SCOPE] },
  };
  world.statuses = { [USER_A]: 'active' };
  world.audit = [];
  world.brokenMarked = [];
  world.cookieClientCreated = 0;
}

function fakeClient(uid: string | null) {
  return {
    auth: {
      getUser: async (token?: string) => {
        const id = token !== undefined ? world.tokens[token] : uid;
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'bad' } };
      },
    },
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      switch (name) {
        case 'fn_get_policy':
          return { data: args.p_key === 'ai.google_read.enabled' ? world.enabled : null, error: null };
        case 'is_super_admin':
        case 'is_admin':
          return { data: false, error: null };
        case 'user_has_permission':
          return { data: !!uid && args.permission_name === 'ai_query.view' && world.permitted.has(uid), error: null };
        case 'fn_ai_google_read_get_token': {
          // pinned to auth.uid(): the ONLY row this client can ever get is its own
          const row = uid ? world.vault[uid] : undefined;
          return {
            data: row ? [{ google_email: row.email, refresh_token: row.refresh, granted_scopes: row.scopes }] : [],
            error: null,
          };
        }
        case 'fn_ai_google_read_log':
          world.audit.push({ uid: uid!, tool: String(args.p_tool), outcome: String(args.p_outcome) });
          return { data: null, error: null };
        case 'fn_ai_google_read_mark_broken':
          world.brokenMarked.push(uid!);
          return { data: null, error: null };
        default:
          throw new Error(`unexpected rpc ${name}`);
      }
    },
    from: (_table: string) => {
      const chain = {
        select: () => chain,
        eq: (_col: string, value: string) => {
          // RLS: own row only, whatever id is asked for
          (chain as { asked?: string }).asked = value;
          return chain;
        },
        maybeSingle: async () => {
          const status = uid ? world.statuses[uid] : undefined;
          return { data: status ? { status } : null, error: null };
        },
      };
      return chain;
    },
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, opts: { global?: { headers?: Record<string, string> } }) => {
    const header = opts?.global?.headers?.Authorization ?? '';
    const token = header.replace(/^Bearer /, '');
    return fakeClient(world.tokens[token] ?? null);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    world.cookieClientCreated += 1;
    return fakeClient(world.cookieUser);
  },
}));

vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {},
}));

// Google: each mailbox answers only its own access token.
const MAILBOXES: Record<string, { id: string; subject: string; body: string }[]> = {
  'access-A': [{ id: 'msgA1', subject: 'A private note', body: 'hello A' }],
  'access-B': [{ id: 'msgB1', subject: 'B private note', body: 'hello B' }],
};
let googleCalls: Array<{ url: string; auth: string }> = [];
let refreshAnswer: (refresh: string) => Response;

function b64url(s: string) {
  return Buffer.from(s, 'utf8').toString('base64url');
}

beforeEach(() => {
  resetWorld();
  googleCalls = [];
  refreshAnswer = (refresh) =>
    new Response(JSON.stringify({ access_token: refresh.replace('refresh-', 'access-') }), { status: 200 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.GOOGLE_CAL_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CAL_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_TOKEN_MASTER_SECRET = 'master-secret';

  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
    googleCalls.push({ url, auth });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const refresh = new URLSearchParams(String(init?.body)).get('refresh_token') ?? '';
      return refreshAnswer(refresh);
    }
    const access = auth.replace('Bearer ', '');
    const box = MAILBOXES[access];
    if (!box) return new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }), { status: 401 });
    const m = /\/users\/me\/messages(?:\/([^?]+))?\?/.exec(url);
    if (m && !m[1]) {
      return new Response(JSON.stringify({ messages: box.map((x) => ({ id: x.id })) }), { status: 200 });
    }
    if (m && m[1]) {
      const msg = box.find((x) => x.id === decodeURIComponent(m[1]));
      if (!msg) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
      return new Response(
        JSON.stringify({
          id: msg.id,
          snippet: msg.body,
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'someone@jkkn.ac.in' },
              { name: 'Subject', value: msg.subject },
              { name: 'Date', value: 'Tue, 22 Sep 2026 10:00:00 +0530' },
            ],
            body: { data: b64url(msg.body) },
          },
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 404 });
  });
});

async function call(path: 'mail-search' | 'mail-read' | 'drive-search' | 'drive-read', body: unknown, headers: Record<string, string> = {}) {
  const endpoint = await import('../endpoint');
  const spec = {
    'mail-search': endpoint.MAIL_SEARCH,
    'mail-read': endpoint.MAIL_READ,
    'drive-search': endpoint.DRIVE_SEARCH,
    'drive-read': endpoint.DRIVE_READ,
  }[path];
  const req = new Request(`https://www.jkkn.ai/api/ai-tools/google/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const res = await endpoint.handleGoogleReadTool(req, spec as never);
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

// ── auth: bearer and cookie ──────────────────────────────────────────────────

describe('auth', () => {
  it('accepts the person\'s Supabase access token as a Bearer header', async () => {
    const r = await call('mail-search', { query: '' }, { Authorization: 'Bearer tok-A' });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.messages.map((m: { id: string }) => m.id)).toEqual(['msgA1']);
    expect(world.cookieClientCreated).toBe(0);
  });

  it('accepts the normal cookie session', async () => {
    world.cookieUser = USER_A;
    const r = await call('mail-search', { query: '' });
    expect(r.status).toBe(200);
    expect(r.json.messages[0].subject).toBe('A private note');
  });

  it('a bearer that does not validate is 401 and never falls back to the cookie', async () => {
    world.cookieUser = USER_A;
    const r = await call('mail-search', { query: '' }, { Authorization: 'Bearer forged' });
    expect(r.status).toBe(401);
    expect(world.cookieClientCreated).toBe(0);
    expect(googleCalls).toHaveLength(0);
  });

  it('no bearer and no session is 401', async () => {
    const r = await call('mail-search', { query: '' });
    expect(r.status).toBe(401);
  });

  it('someone without ai_query.view is refused before Google is asked', async () => {
    world.permitted.delete(USER_A);
    const r = await call('mail-search', { query: '' }, { Authorization: 'Bearer tok-A' });
    expect(r.status).toBe(403);
    expect(googleCalls).toHaveLength(0);
  });
});

// ── isolation ────────────────────────────────────────────────────────────────

describe('one person can never read another person\'s mail', () => {
  it('naming someone else in the body changes nothing — the caller gets only their own mail', async () => {
    world.vault[USER_B] = { email: 'b@jkkn.ac.in', refresh: 'refresh-B', scopes: [GMAIL_SCOPE] };
    const r = await call(
      'mail-search',
      { query: '', profile_id: USER_B, user_id: USER_B, host_profile_id: USER_B },
      { Authorization: 'Bearer tok-A' },
    );
    expect(r.json.messages.map((m: { id: string }) => m.id)).toEqual(['msgA1']);
    expect(googleCalls.some((c) => c.auth === 'Bearer access-B')).toBe(false);
    expect(googleCalls.some((c) => (c.url + c.auth).includes('refresh-B'))).toBe(false);
  });

  it('a person who has not connected is told so, and nobody else\'s token is used', async () => {
    const r = await call('mail-search', { query: '' }, { Authorization: 'Bearer tok-B' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: false, code: 'not_connected' });
    expect(r.json.message).toMatch(/has not connected/);
    expect(googleCalls).toHaveLength(0);
  });

  it('reading another person\'s message id with your own token finds nothing', async () => {
    const r = await call('mail-read', { id: 'msgB1' }, { Authorization: 'Bearer tok-A' });
    expect(r.json).toMatchObject({ ok: false, code: 'not_found' });
    expect(googleCalls.every((c) => !c.auth.includes('access-B'))).toBe(true);
  });

  it('the audit row names the caller and the tool — never the query or content', async () => {
    await call('mail-search', { query: 'from:principal secret audit' }, { Authorization: 'Bearer tok-A' });
    expect(world.audit).toEqual([{ uid: USER_A, tool: 'google_mail_search', outcome: 'ok' }]);
    expect(JSON.stringify(world.audit)).not.toMatch(/principal|secret|A private note/);
  });
});

// ── the switch ───────────────────────────────────────────────────────────────

describe('switch off', () => {
  it.each(['mail-search', 'mail-read', 'drive-search', 'drive-read'] as const)(
    '%s answers "not switched on yet" and never calls Google',
    async (path) => {
      world.enabled = false;
      const r = await call(path, { query: 'x', id: 'abc' }, { Authorization: 'Bearer tok-A' });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ ok: false, code: 'disabled' });
      expect(r.json.message).toMatch(/not switched on yet/);
      expect(googleCalls).toHaveLength(0);
    },
  );
});

// ── setup states ─────────────────────────────────────────────────────────────

describe('setup states', () => {
  it('a connection without the Gmail box ticked says so instead of asking Google', async () => {
    world.vault[USER_A] = { email: 'a@jkkn.ac.in', refresh: 'refresh-A', scopes: [DRIVE_SCOPE] };
    const r = await call('mail-search', { query: '' }, { Authorization: 'Bearer tok-A' });
    expect(r.json).toMatchObject({ ok: false, code: 'missing_scope' });
    expect(googleCalls.some((c) => c.url.includes('gmail'))).toBe(false);
  });

  it('invalid_grant marks the caller\'s own connection broken and asks them to reconnect', async () => {
    refreshAnswer = () => new Response('{"error":"invalid_grant"}', { status: 400 });
    const r = await call('mail-search', { query: '' }, { Authorization: 'Bearer tok-A' });
    expect(r.json).toMatchObject({ ok: false, code: 'reconnect_needed' });
    expect(world.brokenMarked).toEqual([USER_A]);
  });

  it('refuses an id that is not an id', async () => {
    const r = await call('mail-read', { id: '../../users/other/messages' }, { Authorization: 'Bearer tok-A' });
    expect(r.status).toBe(400);
    expect(googleCalls).toHaveLength(0);
  });
});

// ── trimming and readers ─────────────────────────────────────────────────────

describe('trimming', () => {
  it('mail-read trims the body to 20,000 characters and says so', async () => {
    MAILBOXES['access-A'].push({ id: 'msgLong', subject: 'long', body: 'x'.repeat(25_000) });
    const r = await call('mail-read', { id: 'msgLong' }, { Authorization: 'Bearer tok-A' });
    expect(r.json.ok).toBe(true);
    expect(r.json.message.text).toHaveLength(20_000);
    expect(r.json.message.truncated).toBe(true);
    MAILBOXES['access-A'].pop();
  });

  it('a short body is untouched', async () => {
    const r = await call('mail-read', { id: 'msgA1' }, { Authorization: 'Bearer tok-A' });
    expect(r.json.message).toMatchObject({ text: 'hello A', truncated: false, subject: 'A private note' });
  });
});

describe('readers', () => {
  it('trimText cuts at exactly the limit', async () => {
    const { trimText } = await import('../readers');
    expect(trimText('a'.repeat(20_000))).toEqual({ text: 'a'.repeat(20_000), truncated: false });
    expect(trimText('a'.repeat(20_001)).truncated).toBe(true);
    expect(trimText('a'.repeat(20_001)).text).toHaveLength(20_000);
  });

  it('clampLimit keeps 1..10', async () => {
    const { clampLimit } = await import('../readers');
    expect(clampLimit(50, 5)).toBe(10);
    expect(clampLimit(0, 5)).toBe(1);
    expect(clampLimit(undefined, 5)).toBe(5);
    expect(clampLimit(3.9, 5)).toBe(3);
  });

  it('prefers the plain-text part and ignores attachments; falls back to HTML', async () => {
    const { extractMailText } = await import('../readers');
    const plain = extractMailText({
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('plain body') } },
        { mimeType: 'text/html', body: { data: b64url('<p>html body</p>') } },
        { mimeType: 'text/plain', filename: 'notes.txt', body: { data: b64url('ATTACHMENT') } },
      ],
    });
    expect(plain).toBe('plain body');
    const html = extractMailText({
      mimeType: 'text/html',
      body: { data: b64url('<style>p{}</style><p>Hi&nbsp;there</p><p>Fee &amp; dues</p>') },
    });
    expect(html).toBe('Hi there\nFee & dues');
  });

  it('escapes Drive query literals', async () => {
    const { buildDriveQuery } = await import('../readers');
    expect(buildDriveQuery('')).toBe('trashed = false');
    expect(buildDriveQuery("O'Brien \\ plan")).toBe(
      "(name contains 'O\\'Brien \\\\ plan' or fullText contains 'O\\'Brien \\\\ plan') and trashed = false",
    );
  });

  it('Docs export as text, Sheets as CSV, anything else is name + link only', async () => {
    const { readMyDriveFile } = await import('../readers');
    const files: Record<string, { mimeType: string; name: string }> = {
      doc1: { mimeType: 'application/vnd.google-apps.document', name: 'Plan' },
      sheet1: { mimeType: 'application/vnd.google-apps.spreadsheet', name: 'Marks' },
      pdf1: { mimeType: 'application/pdf', name: 'Circular' },
    };
    const exported: string[] = [];
    const fakeFetch = (async (input: string | URL) => {
      const url = String(input);
      const m = /\/files\/([^/?]+)(\/export)?\?/.exec(url)!;
      const f = files[m[1]];
      if (m[2]) {
        exported.push(m[1]);
        const mime = new URL(url).searchParams.get('mimeType');
        return new Response(mime === 'text/csv' ? 'a,b\n1,2' : '﻿' + 'y'.repeat(20_010), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: m[1], name: f.name, mimeType: f.mimeType, webViewLink: `https://drive/${m[1]}` }),
        { status: 200 },
      );
    }) as typeof fetch;

    const doc = await readMyDriveFile('t', 'doc1', fakeFetch);
    expect(doc).toMatchObject({ format: 'text', truncated: true, type: 'Google Doc' });
    expect(doc.text).toHaveLength(20_000);
    expect(doc.text.startsWith('y')).toBe(true);

    const sheet = await readMyDriveFile('t', 'sheet1', fakeFetch);
    expect(sheet).toMatchObject({ format: 'csv', text: 'a,b\n1,2', truncated: false });

    const pdf = await readMyDriveFile('t', 'pdf1', fakeFetch);
    expect(pdf.format).toBe('none');
    expect(pdf.text).toContain('https://drive/pdf1');
    expect(exported).toEqual(['doc1', 'sheet1']);
  });
});

// ── OAuth: incremental consent, and states that cannot cross flows ───────────

describe('oauth', () => {
  it('asks for gmail.readonly + drive.readonly incrementally, offline, with consent', async () => {
    const { buildGoogleReadAuthUrl } = await import('../oauth');
    const url = new URL(buildGoogleReadAuthUrl(USER_A));
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')!.split(' ')).toEqual(
      expect.arrayContaining([GMAIL_SCOPE, DRIVE_SCOPE]),
    );
    expect(url.searchParams.get('scope')).not.toMatch(/gmail\.(send|modify|compose)|auth\/drive(\s|$)/);
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/integrations\/google-read\/callback$/);
  });

  it('a read-flow state verifies here and is refused by the calendar callback, and vice versa', async () => {
    const { buildGoogleReadAuthUrl, verifyGoogleReadState } = await import('../oauth');
    const { GoogleCalendarService } = await import('@/lib/services/integrations/google-calendar-service');

    const readState = new URL(buildGoogleReadAuthUrl(USER_A)).searchParams.get('state')!;
    expect(verifyGoogleReadState(readState)).toBe(USER_A);
    expect(GoogleCalendarService.verifyStateParam(readState)).toBeNull();

    const calState = new URL(GoogleCalendarService.buildAuthUrl(USER_A)).searchParams.get('state')!;
    expect(GoogleCalendarService.verifyStateParam(calState)).toBe(USER_A);
    expect(verifyGoogleReadState(calState)).toBeNull();

    expect(verifyGoogleReadState(readState.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
  });
});
