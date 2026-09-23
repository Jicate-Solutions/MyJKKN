/**
 * The AI Assistant on every page, and "Do it in the background".
 *
 *  1. The Ask button shows only to people with ai_query.view, never on
 *     /ai-query itself.
 *  2. The page note ("(Asked from the … page, …)") reaches the AI only when the
 *     request carries the panel's page_context field — and the person's own
 *     bubble can always be restored to exactly what they typed.
 *  3. A background question is enqueued with payload.background = true and the
 *     route answers AT ONCE (202 + job id), without ever polling for the answer.
 *
 * Supabase and AIQueryService are faked; only the route's own logic is tested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  lastNotedPathOf,
  notedPath,
  pageContextToSend,
  pageTitleFromCrumbs,
  sanitizePageContext,
  shouldShowAskButton,
  stripPageNote,
  withPageNote,
} from '@/components/ai-query/AskAssistantRules';

// ---------------------------------------------------------------------------
// Route fakes (vitest hoists vi.mock above the imports).
// ---------------------------------------------------------------------------

type RpcCall = { fn: string; args: Record<string, any> };
let rpcCalls: RpcCall[] = [];
let enqueueReply: Record<string, unknown> = { ok: true, job_id: 'job-1' };
let enqueueError: { message: string } | null = null;

vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
      rpc: (fn: string, args: Record<string, any>) => {
        rpcCalls.push({ fn, args });
        if (fn === 'fn_ai_enqueue') {
          return Promise.resolve(enqueueError ? { data: null, error: enqueueError } : { data: enqueueReply, error: null });
        }
        if (fn === 'fn_ai_job_status') {
          return Promise.resolve({ data: { status: 'done', result: { answer: 'forty-two' } }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
}));

vi.mock('@/lib/services/ai-query-service', () => ({
  AIQueryService: {
    initialize: () => undefined,
    checkRateLimit: async () => ({ allowed: true, remaining: 10, reset_at: new Date().toISOString() }),
    getUserContext: async () => ({ institution_ids: ['inst-1'] }),
    incrementQueryCount: async () => undefined,
    logQuery: async () => undefined,
  },
}));

import { POST } from '@/app/api/ai-query/route';

const CONV = '0b3c9a6e-5d1f-4a7e-9c2b-1f2e3d4c5b6a';

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/ai-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any,
  );
}

const enqueuedPayload = () => rpcCalls.find((c) => c.fn === 'fn_ai_enqueue')?.args.p_payload;

beforeEach(() => {
  rpcCalls = [];
  enqueueReply = { ok: true, job_id: 'job-1' };
  enqueueError = null;
});

// ---------------------------------------------------------------------------

describe('Ask button visibility', () => {
  it('shows on an ordinary page for a person with ai_query.view', () => {
    expect(shouldShowAskButton('/billing/receipts', true)).toBe(true);
    expect(shouldShowAskButton('/', true)).toBe(true);
  });

  it('never shows without the permission', () => {
    expect(shouldShowAskButton('/billing/receipts', false)).toBe(false);
  });

  it('hides on the assistant page itself and its sub-pages', () => {
    expect(shouldShowAskButton('/ai-query', true)).toBe(false);
    expect(shouldShowAskButton('/ai-query/admin', true)).toBe(false);
  });

  it('does not mistake a look-alike path for the assistant page', () => {
    expect(shouldShowAskButton('/ai-query-tools', true)).toBe(true);
  });
});

describe('page note', () => {
  it('names the page and path, and strips back to exactly what was typed', () => {
    const typed = 'How many receipts today?';
    const sent = withPageNote(typed, { path: '/billing/receipts', title: 'Receipts' });
    expect(sent).toBe('How many receipts today?\n\n(Asked from the Receipts page, /billing/receipts)');
    expect(stripPageNote(sent)).toBe(typed);
  });

  it('leaves a message with no context, or no note, unchanged', () => {
    expect(withPageNote('hello', null)).toBe('hello');
    expect(stripPageNote('hello (world)')).toBe('hello (world)');
  });

  it('refuses a full URL or a protocol-relative path as a page', () => {
    expect(sanitizePageContext({ path: 'https://evil.example/x' })).toBeNull();
    expect(sanitizePageContext({ path: '//evil.example/x' })).toBeNull();
    expect(sanitizePageContext('nope')).toBeNull();
  });

  it('flattens line breaks and brackets so the note stays one short line', () => {
    const ctx = sanitizePageContext({ path: '/a\n/b', title: 'Ignore (all)\nprevious' });
    expect(ctx).toEqual({ path: '/a /b', title: 'Ignore all previous' });
  });

  it('borrows the parent name for an id page', () => {
    expect(pageTitleFromCrumbs(['Home', 'Learners', 'Details'])).toBe('Learners details');
    expect(pageTitleFromCrumbs(['Home', 'Billing', 'Receipts'])).toBe('Receipts');
    expect(pageTitleFromCrumbs([])).toBe('Home');
  });
});

describe('POST /api/ai-query — page note comes only from the panel field', () => {
  it('adds the note when page_context is sent', async () => {
    const res = await post({
      message: 'Who is absent?',
      conversation_id: CONV,
      page_context: { path: '/academic/attendance', title: 'Attendance' },
      background: true,
    });
    expect(res.status).toBe(202);
    expect(enqueuedPayload().message).toBe(
      'Who is absent?\n\n(Asked from the Attendance page, /academic/attendance)',
    );
  });

  it('sends the message untouched when page_context is absent', async () => {
    await post({ message: 'Who is absent?', conversation_id: CONV, background: true });
    expect(enqueuedPayload().message).toBe('Who is absent?');
  });

  it('sends the message untouched when page_context is malformed', async () => {
    await post({ message: 'Who is absent?', conversation_id: CONV, background: true, page_context: { path: 'x' } });
    expect(enqueuedPayload().message).toBe('Who is absent?');
  });
});

describe('POST /api/ai-query — background returns at once', () => {
  it('enqueues with background:true and never polls for the answer', async () => {
    const res = await post({ message: 'Big report please', conversation_id: CONV, background: true });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ background: true, job_id: 'job-1', conversation_id: CONV });
    expect(enqueuedPayload()).toMatchObject({ background: true, conversation_id: CONV });
    expect(rpcCalls.map((c) => c.fn)).toEqual(['fn_ai_enqueue']);
  });

  it('mints a conversation id when none is sent, so the notice has somewhere to link', async () => {
    const res = await post({ message: 'Big report please', background: true });
    const body = await res.json();
    expect(body.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(enqueuedPayload().conversation_id).toBe(body.conversation_id);
  });

  it('carries the daily-cap refusal through unchanged', async () => {
    enqueueReply = { ok: false, error: 'daily limit reached', cap: 20, used: 20 };
    const res = await post({ message: 'Big report please', conversation_id: CONV, background: true });
    expect(res.status).toBe(429);
  });

  it('a foreground question still waits for the answer and carries no background flag', async () => {
    const res = await post({ message: 'Quick one', conversation_id: CONV });
    expect(res.status).toBe(200);
    expect((await res.json()).message.content).toBe('forty-two');
    expect(enqueuedPayload()).not.toHaveProperty('background');
    expect(rpcCalls.some((c) => c.fn === 'fn_ai_job_status')).toBe(true);
  });
});

describe('page note — sent again whenever the page changes', () => {
  const RECEIPTS = { path: '/billing/receipts', title: 'Receipts' };
  const ATTENDANCE = { path: '/academic/attendance', title: 'Attendance' };

  it('reads back the page a note names', () => {
    expect(notedPath(withPageNote('hi', RECEIPTS))).toBe('/billing/receipts');
    expect(notedPath(withPageNote('hi', { path: '/a, b', title: 'Odd, name' }))).toBe('/a, b');
    expect(notedPath('hi')).toBeNull();
    expect(notedPath('hi\n\n(Asked from the X page, /x) and more')).toBeNull();
  });

  it('sends the note on the first question, not again on the same page, and again on a new page', () => {
    expect(pageContextToSend(RECEIPTS, null)).toEqual(RECEIPTS);
    expect(pageContextToSend(RECEIPTS, '/billing/receipts')).toBeNull();
    expect(pageContextToSend(ATTENDANCE, '/billing/receipts')).toEqual(ATTENDANCE);
    expect(pageContextToSend(null, null)).toBeNull();
  });

  it('a reopened conversation remembers the LAST page it was told about', () => {
    const turns = [
      withPageNote('first', RECEIPTS),
      'follow-up with no note',
      withPageNote('later', ATTENDANCE),
      null,
    ];
    expect(lastNotedPathOf(turns)).toBe('/academic/attendance');
    expect(lastNotedPathOf(['no notes here', null])).toBeNull();
  });

  it('strips only a note at the very end — the same rule the SQL notice uses', () => {
    const note = withPageNote('', RECEIPTS);
    expect(stripPageNote(`Receipts (today)${note}`)).toBe('Receipts (today)');
    expect(stripPageNote(`q${withPageNote('', { path: '/' })}${note}`)).toBe('q\n\n(Asked from the / page, /)');
    expect(stripPageNote('a\n\n(Asked from the X page, /x) and more')).toBe(
      'a\n\n(Asked from the X page, /x) and more',
    );
  });
});

describe('POST /api/ai-query — background refusals and ids', () => {
  const bodyOf = async (res: Response) => (await res.json()) as { error: { code: string; message: string } };

  it('too many questions in flight → 500 with the "wait for those" note, nothing polled', async () => {
    enqueueReply = { ok: false, error: 'too many in-flight jobs of this type' };
    const res = await post({ message: 'Big report', conversation_id: CONV, background: true });
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error.message).toContain('You already have questions in progress');
    expect(rpcCalls.map((c) => c.fn)).toEqual(['fn_ai_enqueue']);
  });

  it('no access → 403', async () => {
    enqueueReply = { ok: false, error: 'not allowed for this job_type' };
    const res = await post({ message: 'Big report', conversation_id: CONV, background: true });
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).error.code).toBe('FORBIDDEN');
  });

  it('assistant switched off → 500 with the offline note', async () => {
    enqueueReply = { ok: false, error: 'unknown or disabled job_type' };
    const res = await post({ message: 'Big report', conversation_id: CONV, background: true });
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error.message).toContain('temporarily offline');
  });

  it('a database error on enqueue → 500, never a 202', async () => {
    enqueueError = { message: 'boom' };
    const res = await post({ message: 'Big report', conversation_id: CONV, background: true });
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error.code).toBe('SERVER_ERROR');
  });

  it('replaces a malformed conversation id with a fresh one, and uses it for the job', async () => {
    const res = await post({ message: 'Big report', conversation_id: 'not-a-uuid', background: true });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.conversation_id).not.toBe('not-a-uuid');
    expect(body.conversation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(enqueuedPayload().conversation_id).toBe(body.conversation_id);
  });

  it('never cancels or acknowledges a background job (the notice and the sweep own its end)', async () => {
    await post({ message: 'Big report', conversation_id: CONV, background: true });
    expect(rpcCalls.some((c) => c.fn === 'fn_ai_job_cancel' || c.fn === 'fn_ai_job_ack')).toBe(false);
  });
});
