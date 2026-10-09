// __tests__/instasolver/complaint-privacy-lib.test.ts
//
// The pure rules behind the Director's ruling that a complainant can follow up
// using only the tracking code (30 Sep 2026, kept by the 9 Oct ruling):
//   lib/grievance/track-conversation.ts — what the tracking page may show and
//                                         send for questions and the rating.
// (#4156's ICC-only, committee-reader and answer-window cases are not carried:
// those routing rulings were overruled on 8 Oct.)

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadConversation,
  sendAnswer,
  sendRating,
  validateAnswer,
  validateRating,
  type TrackRpc,
} from '@/lib/grievance/track-conversation';

afterEach(() => vi.restoreAllMocks());

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
