// @vitest-environment jsdom
/**
 * useAIQuery when a conversation is REOPENED — the Ask panel remembers its chat
 * across pages, and a notice link reopens one on /ai-query.
 *
 *  1. Reopened on a DIFFERENT page, the next question carries that page's note;
 *     on the same page it does not repeat. (Before: the note rode only on the
 *     first question ever, so the AI kept answering about the old page.)
 *  2. "While you were away" answers that rendered (and were acknowledged) before
 *     the reopened conversation loaded stay on screen — they never come back.
 *
 * fetch and the Supabase browser client are faked; the hook itself is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { withPageNote } from '@/components/ai-query/AskAssistantRules';

const CONV = '0b3c9a6e-5d1f-4a7e-9c2b-1f2e3d4c5b6a';
const RECEIPTS = { path: '/billing/receipts', title: 'Receipts' };
const ATTENDANCE = { path: '/academic/attendance', title: 'Attendance' };

let turns: Array<{ id: string; question: string; answer: string | null; status: string; asked_at: string }> = [];
let turnsDelay: Promise<void> = Promise.resolve();

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    rpc: async (fn: string) => {
      if (fn === 'fn_ai_conversation_turns') {
        await turnsDelay;
        return { data: turns, error: null };
      }
      return { data: [], error: null };
    },
  }),
}));

import { useAIQuery } from '@/hooks/use-ai-query';

type Sent = { method: string; body: Record<string, any> | null };
let sent: Sent[] = [];
let inbox: Array<{ id: string; message: string; answer: string; completed_at: string }> = [];

beforeEach(() => {
  sent = [];
  inbox = [];
  turns = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      question: withPageNote('What does this page show?', RECEIPTS),
      answer: 'It lists receipts.',
      status: 'done',
      asked_at: '2026-09-23T08:00:00Z',
    },
  ];
  turnsDelay = Promise.resolve();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push({ method, body });
    const json =
      method === 'GET'
        ? { inbox }
        : method === 'POST'
          ? { background: true, job_id: 'job-2', conversation_id: body?.conversation_id }
          : { ok: true };
    return new Response(JSON.stringify(json), { status: method === 'POST' ? 202 : 200 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const posts = () => sent.filter((s) => s.method === 'POST').map((s) => s.body!);

describe('reopening a conversation on another page', () => {
  it('tells the AI about the NEW page on the next question', async () => {
    const { result } = renderHook(() => useAIQuery({ pageContext: ATTENDANCE }));
    await act(async () => {
      await result.current.loadConversation(CONV);
    });
    await act(async () => {
      await result.current.sendMessage('What does this page show?', { background: true });
    });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].conversation_id).toBe(CONV);
    expect(posts()[0].page_context).toEqual(ATTENDANCE);
  });

  it('does not repeat the note when reopened on the SAME page', async () => {
    const { result } = renderHook(() => useAIQuery({ pageContext: RECEIPTS }));
    await act(async () => {
      await result.current.loadConversation(CONV);
    });
    await act(async () => {
      await result.current.sendMessage('And yesterday?', { background: true });
    });
    expect(posts()[0]).not.toHaveProperty('page_context');
  });

  it('notes the page once, then not again for the next question on it', async () => {
    const { result } = renderHook(() => useAIQuery({ pageContext: ATTENDANCE }));
    await act(async () => {
      await result.current.sendMessage('one', { background: true });
    });
    await act(async () => {
      await result.current.sendMessage('two', { background: true });
    });
    expect(posts()[0].page_context).toEqual(ATTENDANCE);
    expect(posts()[1]).not.toHaveProperty('page_context');
  });
});

describe('inbox answers survive a reopened conversation', () => {
  it('keeps an acknowledged inbox answer that rendered before the thread loaded', async () => {
    inbox = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        message: 'An older question',
        answer: 'An answer from another conversation',
        completed_at: '2026-09-23T07:00:00Z',
      },
    ];
    let release!: () => void;
    turnsDelay = new Promise<void>((r) => {
      release = r;
    });
    const { result } = renderHook(() => useAIQuery({}));
    let loading!: Promise<void>;
    act(() => {
      loading = result.current.loadConversation(CONV);
    });
    // The inbox renders and is acknowledged while the thread is still loading.
    await waitFor(() => expect(sent.some((s) => s.method === 'PATCH')).toBe(true));
    expect(result.current.messages.some((m) => m.id === '22222222-2222-4222-8222-222222222222')).toBe(true);
    await act(async () => {
      release();
      await loading;
    });
    const ids = result.current.messages.map((m) => m.id);
    expect(ids).toContain('22222222-2222-4222-8222-222222222222');
    expect(ids).toContain('11111111-1111-4111-8111-111111111111');
  });
});
