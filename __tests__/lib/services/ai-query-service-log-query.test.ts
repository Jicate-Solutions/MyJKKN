import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AIQueryService } from '@/lib/services/ai-query-service';

// ---------------------------------------------------------------------------
// log_ai_query(p_user_id uuid, p_institution_id uuid, p_query_text text, ...)
// has NO default on its first three parameters (read live 2026-09-29 with
// pg_get_function_arguments). PostgREST picks the function by the names of the
// keys it receives, and JSON.stringify drops a key whose value is undefined.
// So when a person with no college asks a question, institutionId is
// undefined, the key vanishes on the wire, PostgREST answers PGRST202
// ("no function matches") and the question is never logged.
// ---------------------------------------------------------------------------

const REQUIRED_KEYS = ['p_user_id', 'p_institution_id', 'p_query_text'] as const;

function makeClient(result: { data: unknown; error: unknown } = { data: 'log-1', error: null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  AIQueryService.initialize({ rpc } as unknown as SupabaseClient);
  return rpc;
}

/** The body PostgREST actually receives: the args object after JSON encoding. */
function wireBody(rpc: ReturnType<typeof vi.fn>): Record<string, unknown> {
  expect(rpc).toHaveBeenCalledTimes(1);
  const [fn, args] = rpc.mock.calls[0];
  expect(fn).toBe('log_ai_query');
  return JSON.parse(JSON.stringify(args));
}

describe('AIQueryService.logQuery — rpc args for log_ai_query', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends p_institution_id: null when the person has no college', async () => {
    const rpc = makeClient();

    await AIQueryService.logQuery({
      userId: 'user-1',
      institutionId: undefined,
      queryText: 'How many learners joined this week?',
    });

    const [, args] = rpc.mock.calls[0];
    expect(args).toHaveProperty('p_institution_id', null);
  });

  it('keeps every no-default parameter in the JSON body PostgREST receives', async () => {
    const rpc = makeClient();

    await AIQueryService.logQuery({
      userId: 'user-1',
      queryText: 'How many learners joined this week?',
    });

    const body = wireBody(rpc);
    for (const key of REQUIRED_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(body, key), `${key} missing from wire body`).toBe(true);
    }
    expect(body.p_user_id).toBe('user-1');
    expect(body.p_institution_id).toBeNull();
    expect(body.p_query_text).toBe('How many learners joined this week?');
  });

  it('passes a real institution id through unchanged', async () => {
    const rpc = makeClient();

    await AIQueryService.logQuery({
      userId: 'user-1',
      institutionId: 'inst-1',
      queryText: 'q',
    });

    const body = wireBody(rpc);
    expect(body.p_institution_id).toBe('inst-1');
  });

  it('returns the new log id on success and null when the rpc errors', async () => {
    makeClient({ data: 'log-42', error: null });
    await expect(
      AIQueryService.logQuery({ userId: 'user-1', queryText: 'q' })
    ).resolves.toBe('log-42');

    makeClient({ data: null, error: { code: 'PGRST202', message: 'no function matches' } });
    await expect(
      AIQueryService.logQuery({ userId: 'user-1', queryText: 'q' })
    ).resolves.toBeNull();
  });
});
