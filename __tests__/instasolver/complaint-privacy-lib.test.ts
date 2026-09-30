// __tests__/instasolver/complaint-privacy-lib.test.ts
//
// The pure rules behind the Director's rulings of 30 Sep 2026:
//   lib/instasolver/complaint.ts        — which types are ICC-only, whether the
//                                         college has a committee, the answer
//                                         window shown above Send;
//   lib/grievance/track-conversation.ts — what the tracking page may show and
//                                         send for questions and the rating.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerWindowSentence,
  hasActiveIccCommittee,
  isIccOnlyCategory,
  readComplaintCategories,
} from '@/lib/instasolver/complaint';
import {
  loadConversation,
  sendAnswer,
  sendRating,
  validateAnswer,
  validateRating,
  type TrackRpc,
} from '@/lib/grievance/track-conversation';

afterEach(() => vi.restoreAllMocks());

describe('ICC-only types (ruling 2)', () => {
  it('recognises every college’s seeded harassment and ragging types', () => {
    expect(isIccOnlyCategory('Sexual Harassment (ICC)')).toBe(true);
    expect(isIccOnlyCategory('Ragging')).toBe(true);
  });

  it('recognises a renamed one', () => {
    expect(isIccOnlyCategory('Harassment')).toBe(true);
    expect(isIccOnlyCategory('Anti-ragging')).toBe(true);
    expect(isIccOnlyCategory('ICC complaint')).toBe(true);
  });

  it('leaves ordinary types alone', () => {
    for (const name of ['Academic', 'Infrastructure / Hostel', 'Other', 'Accounts', '', null]) {
      expect(isIccOnlyCategory(name)).toBe(false);
    }
  });
});

describe('is there an active ICC committee? (ruling 3)', () => {
  function client(resp: { data?: unknown; error?: unknown } | 'throw') {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = () => chain;
    chain.limit = () => (resp === 'throw' ? Promise.reject(new Error('down')) : Promise.resolve(resp));
    return { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }) };
  }

  it('yes when one is active', async () => {
    expect(await hasActiveIccCommittee(client({ data: [{ id: 'c' }], error: null }), 'i')).toBe('yes');
  });

  it('no when none is', async () => {
    expect(await hasActiveIccCommittee(client({ data: [], error: null }), 'i')).toBe('no');
  });

  it('unknown when the read fails or throws — never a quiet "yes"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await hasActiveIccCommittee(client({ data: null, error: { message: 'x' } }), 'i')).toBe('unknown');
    expect(await hasActiveIccCommittee(client('throw'), 'i')).toBe('unknown');
  });
});

describe('the answer window above Send (ruling 8)', () => {
  const cat = (h: number | null) => ({ id: 'c', name: 'Other', allow_anonymous: true, default_sla_hours: h });

  it('says the type’s own hours', () => {
    expect(answerWindowSentence(cat(72))).toBe('Usually answered within 72 hours');
    expect(answerWindowSentence(cat(1))).toBe('Usually answered within 1 hour');
  });

  it('promises nothing when the type has no window, or none is chosen', () => {
    expect(answerWindowSentence(cat(null))).toBeNull();
    expect(answerWindowSentence(null)).toBeNull();
  });

  it('reads default_sla_hours with the categories, in both read paths', async () => {
    const seen: string[] = [];
    const responses = [
      { data: null, error: { code: '42703', message: 'no column' } },
      { data: [{ id: 'c', name: 'Other', default_sla_hours: '240' }], error: null },
    ];
    let call = 0;
    const chain: Record<string, unknown> = {};
    chain.select = (cols: string) => {
      seen.push(cols);
      return chain;
    };
    chain.eq = () => chain;
    chain.order = () => Promise.resolve(responses[call++]);
    const result = await readComplaintCategories({ from: () => chain, rpc: () => null }, 'i');
    expect(seen.every((s) => s.includes('default_sla_hours'))).toBe(true);
    expect(result.ok && result.categories[0].default_sla_hours).toBe(240);
  });
});

describe('the tracking page conversation (rulings 5 and 6)', () => {
  const TOKEN = 'anon_abcdefghijklmnopqrstuvwxyz';

  function rpcReturning(data: unknown, error: { message: string; code?: string } | null = null) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const rpc: TrackRpc = (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ data, error });
    };
    return { rpc, calls };
  }

  it('keeps only the four message fields — an author id can never reach the page', async () => {
    const { rpc } = rpcReturning({
      messages: [{ id: 'm1', direction: 'question', body: 'Which block?', created_at: '2026-10-01T00:00:00Z', author_id: 'someone' }],
      can_answer: true,
      can_rate: false,
      satisfaction_rating: null,
    });
    const res = await loadConversation(rpc, TOKEN);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.conversation.messages[0]).toEqual({
      id: 'm1',
      direction: 'question',
      body: 'Which block?',
      created_at: '2026-10-01T00:00:00Z',
    });
    expect(res.conversation.canAnswer).toBe(true);
  });

  it('says nothing for a wrong code, and "not ready" before the migration', async () => {
    expect((await loadConversation(rpcReturning(null).rpc, TOKEN)).kind).toBe('none');
    expect((await loadConversation(rpcReturning(null, { message: 'x', code: 'PGRST202' }).rpc, TOKEN)).kind).toBe('not-ready');
    expect((await loadConversation(rpcReturning(null, { message: 'x', code: '500' }).rpc, TOKEN)).kind).toBe('error');
  });

  it('refuses an empty answer without calling the database', async () => {
    const { rpc, calls } = rpcReturning({ success: true });
    expect(validateAnswer('   ')).not.toBeNull();
    expect((await sendAnswer(rpc, TOKEN, '   ')).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('sends a trimmed answer with the code, and nothing that names her', async () => {
    const { rpc, calls } = rpcReturning({ success: true });
    expect((await sendAnswer(rpc, TOKEN, '  Block C  ')).ok).toBe(true);
    expect(calls[0]).toEqual({ fn: 'fn_grievance_track_answer', args: { p_token: TOKEN, p_body: 'Block C' } });
  });

  it('shows the database’s own refusal in words', async () => {
    const { rpc } = rpcReturning({ success: false, error: 'This complaint is closed, so it cannot take new answers.' });
    const res = await sendAnswer(rpc, TOKEN, 'x');
    expect(res).toEqual({ ok: false, error: 'This complaint is closed, so it cannot take new answers.' });
  });

  it('only 1 to 5 stars', async () => {
    expect(validateRating(null, '')).not.toBeNull();
    expect(validateRating(0, '')).not.toBeNull();
    expect(validateRating(6, '')).not.toBeNull();
    expect(validateRating(2.5, '')).not.toBeNull();
    expect(validateRating(5, '')).toBeNull();
  });

  it('sends the rating and a trimmed note (or none)', async () => {
    const { rpc, calls } = rpcReturning({ success: true });
    await sendRating(rpc, TOKEN, 4, '  Took a while ');
    await sendRating(rpc, TOKEN, 5, '   ');
    expect(calls[0].args).toEqual({ p_token: TOKEN, p_rating: 4, p_note: 'Took a while' });
    expect(calls[1].args).toEqual({ p_token: TOKEN, p_rating: 5, p_note: null });
  });
});
