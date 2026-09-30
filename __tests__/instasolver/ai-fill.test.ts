// __tests__/instasolver/ai-fill.test.ts
// ============================================================================
// InstaSolver "Fill it for me" (app/api/instasolver/ai-fill + lib/instasolver/ai-fill).
//
// The model client is mocked throughout — these tests pin what the route does
// with a reply, not what a real model would say. Whether the model actually
// understands Tamil is NOT something a mocked client can prove.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AI_FILL_FALLBACK_MESSAGE,
  AI_FILL_LIMIT_PER_WINDOW,
  INSTASOLVER_TRADES,
  distinctPlaces,
  parseAiFill,
  resetAiFillSlots
} from '@/lib/instasolver/ai-fill';

const getUser = vi.fn();
const profileMaybeSingle = vi.fn();
const claudeChatForFeature = vi.fn();
let resourceRows: Array<Record<string, string | null>> = [];
let tablesRead: string[] = [];

function makeSessionClient() {
  return {
    auth: { getUser },
    from: (table: string) => {
      tablesRead.push(table);
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }) };
      }
      if (table === 'resources') {
        return {
          select: () => ({
            eq: () => ({ limit: async () => ({ data: resourceRows, error: null }) })
          })
        };
      }
      throw new Error(`unexpected session read of ${table}`);
    }
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSessionClient(),
  createServiceRoleClient: () => {
    throw new Error('ai-fill must never use the service-role client');
  }
}));

vi.mock('@/lib/services/platform/ai-clients/chat', () => ({
  claudeChatForFeature: (...args: unknown[]) => claudeChatForFeature(...args)
}));

async function post(body: unknown) {
  const { POST } = await import('@/app/api/instasolver/ai-fill/route');
  const request = {
    json: async () => {
      if (body === '__bad__') throw new Error('bad json');
      return body;
    }
  } as unknown as Parameters<typeof POST>[0];
  return POST(request);
}

function reply(obj: unknown) {
  return { text: typeof obj === 'string' ? obj : JSON.stringify(obj), response: {}, provider: 'anthropic', model_id: 'm' };
}

const GOOD = {
  trade: 'Electrical',
  place: 'Block A, first floor corridor',
  urgency: 'dangerous',
  title: 'Sparking switch board',
  description: 'The switch board in the first floor corridor of Block A is sparking.',
  confidence: 0.9,
  one_question: null
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAiFillSlots();
  resourceRows = [
    { name: 'Room 101', building_number: 'Main Building', block_number: 'A' },
    { name: 'Room 102', building_number: 'Main Building', block_number: 'A' },
    { name: 'Lab', building_number: null, block_number: 'Block B' }
  ];
  tablesRead = [];
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  profileMaybeSingle.mockResolvedValue({
    data: { id: 'user-1', role: 'staff', institution_id: 'inst-1', is_active: true },
    error: null
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ai-fill — a clean reply fills the form', () => {
  it('returns the parsed fields and sends only the typed text to the model', async () => {
    claudeChatForFeature.mockResolvedValue(reply(GOOD));

    const res = await post({ text: 'A block first floor la switch board spark aagudhu' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.fill).toMatchObject({
      trade: 'Electrical',
      urgency: 'dangerous',
      place: 'Block A, first floor corridor',
      confidence: 0.9,
      one_question: null
    });

    const [featureKey, params, options] = claudeChatForFeature.mock.calls[0];
    expect(featureKey).toBe('instasolver.ai_fill');
    // A timeout and no retries, so the fallback comes quickly.
    expect(options).toMatchObject({ maxRetries: 0 });
    expect(typeof options.timeout).toBe('number');
    // The known places go in the prompt; the photo never does (JSON text only).
    expect(params.system).toContain('Main Building · Block A');
    expect(params.system).not.toContain('Building Main Building');
    expect(params.system).toContain('Block B');
    expect(JSON.stringify(params.messages)).toContain('spark aagudhu');
    // Places are read under the caller's own session, never service-role.
    expect(tablesRead).toContain('resources');
  });

  it('clamps a long place and description to the form limits', async () => {
    claudeChatForFeature.mockResolvedValue(
      reply({ ...GOOD, place: 'x'.repeat(300), description: 'y'.repeat(900) })
    );
    const body = await (await post({ text: 'something long' })).json();
    expect(body.fill.place.length).toBe(120);
    expect(body.fill.description.length).toBe(500);
  });

  it('accepts a reply wrapped in a json code fence', () => {
    const fill = parseAiFill('```json\n' + JSON.stringify(GOOD) + '\n```');
    expect(fill?.trade).toBe('Electrical');
  });
});

describe('ai-fill — the one question', () => {
  it('passes a usable question through as tap-to-pick options', async () => {
    claudeChatForFeature.mockResolvedValue(
      reply({
        ...GOOD,
        place: '',
        confidence: 0.4,
        one_question: {
          field: 'place',
          text: 'Which block is this in?',
          options: ['Main Building · Block A', 'Block B', 'Block Z (made up)']
        }
      })
    );
    const body = await (await post({ text: 'fan not working' })).json();

    expect(body.fill.one_question.field).toBe('place');
    expect(body.fill.one_question.text).toBe('Which block is this in?');
    // A place chip must name a real place — the invented one is dropped.
    expect(body.fill.one_question.options).toEqual(['Main Building · Block A', 'Block B']);
  });

  it('keeps only real trades as options for a trade question', () => {
    const fill = parseAiFill(
      JSON.stringify({
        ...GOOD,
        one_question: {
          field: 'trade',
          text: 'What kind of problem is it?',
          options: ['Electrical', 'Plumbing & water', 'Magic']
        }
      })
    );
    expect(fill?.one_question?.options).toEqual(['Electrical', 'Plumbing & water']);
  });

  it('drops a question with fewer than two usable options rather than showing one chip', () => {
    const fill = parseAiFill(
      JSON.stringify({
        ...GOOD,
        one_question: { field: 'urgency', text: 'Is it dangerous?', options: ['maybe'] }
      })
    );
    expect(fill).not.toBeNull();
    expect(fill?.one_question).toBeNull();
  });
});

describe('ai-fill — graceful fallback to the plain form', () => {
  it('a reply that is not the agreed JSON returns the fallback message', async () => {
    claudeChatForFeature.mockResolvedValue(reply('Sorry, I cannot help with that.'));
    const res = await post({ text: 'fan not working' });
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ success: false, fallback: true, error: AI_FILL_FALLBACK_MESSAGE });
  });

  it('an unknown trade fails the parse (never invents a thirteenth kind)', () => {
    expect(parseAiFill(JSON.stringify({ ...GOOD, trade: 'Gardening' }))).toBeNull();
    expect(parseAiFill(JSON.stringify({ ...GOOD, urgency: 'high' }))).toBeNull();
  });

  it("the SDK's own timeout error returns 504 with the fallback message", async () => {
    const err = new Error('Request timed out.');
    err.name = 'APIConnectionTimeoutError';
    claudeChatForFeature.mockRejectedValue(err);
    const res = await post({ text: 'fan not working' });
    const body = await res.json();
    expect(res.status).toBe(504);
    expect(body).toMatchObject({ success: false, fallback: true, error: AI_FILL_FALLBACK_MESSAGE });
  });

  it('a model call that never answers is abandoned by the overall timeout', async () => {
    vi.useFakeTimers();
    claudeChatForFeature.mockReturnValue(new Promise(() => {}));
    const pending = post({ text: 'fan not working' });
    await vi.advanceTimersByTimeAsync(16_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBe(AI_FILL_FALLBACK_MESSAGE);
  });

  it('a missing API key (the wrapper throws) is a fallback, not a 500', async () => {
    claudeChatForFeature.mockRejectedValue(new Error('ANTHROPIC_API_KEY not configured'));
    const res = await post({ text: 'fan not working' });
    expect(res.status).toBe(502);
    expect((await res.json()).fallback).toBe(true);
  });
});

describe('ai-fill — who may spend it', () => {
  it(`refuses the ${AI_FILL_LIMIT_PER_WINDOW + 1}th fill in an hour with 429 and no model call`, async () => {
    claudeChatForFeature.mockResolvedValue(reply(GOOD));
    for (let i = 0; i < AI_FILL_LIMIT_PER_WINDOW; i += 1) {
      expect((await post({ text: 'fan not working' })).status).toBe(200);
    }
    const res = await post({ text: 'fan not working' });
    expect(res.status).toBe(429);
    expect((await res.json()).fallback).toBe(true);
    expect(claudeChatForFeature).toHaveBeenCalledTimes(AI_FILL_LIMIT_PER_WINDOW);
  });

  it('refuses a guest account before any model call', async () => {
    profileMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', role: 'guest', institution_id: 'inst-1', is_active: true },
      error: null
    });
    const res = await post({ text: 'fan not working' });
    expect(res.status).toBe(403);
    expect(claudeChatForFeature).not.toHaveBeenCalled();
  });

  it('refuses someone not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ text: 'fan not working' })).status).toBe(401);
    expect(claudeChatForFeature).not.toHaveBeenCalled();
  });

  it('refuses text that is too short, before any model call', async () => {
    expect((await post({ text: 'hi' })).status).toBe(400);
    expect((await post('__bad__')).status).toBe(400);
    expect(claudeChatForFeature).not.toHaveBeenCalled();
  });
});

describe('ai-fill — the trade list and places', () => {
  it('has the 11 clean trades with Other last', () => {
    expect(INSTASOLVER_TRADES).toHaveLength(11);
    expect(INSTASOLVER_TRADES[INSTASOLVER_TRADES.length - 1]).toBe('Other');
  });

  it('reduces resource rows to distinct building/block labels', () => {
    expect(
      distinctPlaces([
        { building_number: 'Main', block_number: 'A' },
        { building_number: 'Main', block_number: 'A' },
        { building_number: null, block_number: 'Block B' },
        { building_number: null, block_number: null }
      ])
    ).toEqual(['Building Main · Block A', 'Block B']);
  });
});
