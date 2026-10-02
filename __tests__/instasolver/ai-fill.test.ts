// __tests__/instasolver/ai-fill.test.ts
// ============================================================================
// InstaSolver "Fill it for me" (app/api/instasolver/ai-fill + lib/instasolver/ai-fill).
//
// Director ruling, 1 Oct 2026: the fill runs on the Windows box's Claude Max
// lane, model Opus, at no API cost. POST queues an `instasolver.ai_fill` job
// (fn_ai_enqueue_system) and GET ?job= reads it back. The queue is faked here
// — these tests pin what the route queues and what it does with a finished
// job's reply, not what a real model would say. Whether the model actually
// understands Tamil is NOT something a fake queue can prove.
// ============================================================================

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AI_FILL_DEDUPE_WINDOW_MS,
  AI_FILL_FALLBACK_MESSAGE,
  AI_FILL_JOB_TYPE,
  AI_FILL_LIMIT_PER_WINDOW,
  INSTASOLVER_TRADES,
  distinctPlaces,
  mergeDangerous,
  mergeFilledChoice,
  mergeFilledField,
  parseAiFill,
  resetAiFillSlots
} from '@/lib/instasolver/ai-fill';

const getUser = vi.fn();
const profileMaybeSingle = vi.fn();
let resourceRows: Array<Record<string, string | null>> = [];
let tablesRead: string[] = [];
/** Every builder call made on the `resources` read, in order: [method, ...args]. */
let resourceCalls: unknown[][] = [];

function makeSessionClient() {
  return {
    auth: { getUser },
    rpc: () => {
      throw new Error('ai-fill must queue through the service role, not the session');
    },
    from: (table: string) => {
      tablesRead.push(table);
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }) };
      }
      if (table === 'resources') {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'or', 'order']) {
          q[m] = (...args: unknown[]) => {
            resourceCalls.push([m, ...args]);
            return q;
          };
        }
        q.limit = async (...args: unknown[]) => {
          resourceCalls.push(['limit', ...args]);
          return { data: resourceRows, error: null };
        };
        return q;
      }
      throw new Error(`unexpected session read of ${table}`);
    }
  };
}

// ── A fake ai_jobs queue behind the service-role client ────────────────────
interface FakeJob {
  id: string;
  job_type: string;
  status: string;
  result: unknown;
  payload: Record<string, unknown>;
  requested_at: string;
}
let jobs: FakeJob[] = [];
let enqueueCalls: Array<{ p_job_type: string; p_payload: Record<string, unknown>; p_dedupe_key: string }> = [];
let enqueueOverride: ((args: Record<string, unknown>) => unknown) | null = null;
let jobSeq = 0;

function newId() {
  jobSeq += 1;
  return `00000000-0000-4000-8000-${String(jobSeq).padStart(12, '0')}`;
}

function makeAdminClient() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'fn_ai_enqueue_system') throw new Error(`unexpected rpc ${fn}`);
      enqueueCalls.push(args as (typeof enqueueCalls)[number]);
      if (enqueueOverride) return { data: enqueueOverride(args), error: null };
      const key = args.p_dedupe_key as string;
      if (
        jobs.some(
          (j) =>
            j.job_type === args.p_job_type &&
            ['pending', 'claimed', 'running'].includes(j.status) &&
            j.payload._dedupe === key
        )
      ) {
        return { data: { ok: false, error: 'in_flight' }, error: null };
      }
      const id = newId();
      jobs.push({
        id,
        job_type: args.p_job_type as string,
        status: 'pending',
        result: null,
        payload: { ...(args.p_payload as Record<string, unknown>), _dedupe: key },
        requested_at: new Date().toISOString()
      });
      return { data: { ok: true, job_id: id }, error: null };
    },
    from: (table: string) => {
      if (table !== 'ai_jobs') throw new Error(`unexpected service-role read of ${table}`);
      const preds: Array<(j: FakeJob) => boolean> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: keyof FakeJob, v: unknown) => {
          preds.push((j) => j[col] === v);
          return q;
        },
        filter: (col: string, op: string, v: unknown) => {
          if (col !== 'payload->>_dedupe' || op !== 'eq') throw new Error(`unexpected filter ${col}`);
          preds.push((j) => j.payload._dedupe === v);
          return q;
        },
        in: (col: keyof FakeJob, vs: unknown[]) => {
          preds.push((j) => vs.includes(j[col]));
          return q;
        },
        gte: (col: keyof FakeJob, v: string) => {
          preds.push((j) => String(j[col]) >= v);
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const hit = jobs
            .filter((j) => preds.every((p) => p(j)))
            .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
          return { data: hit ?? null, error: null };
        }
      };
      return q;
    }
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSessionClient(),
  createServiceRoleClient: () => makeAdminClient()
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

async function get(jobId: string) {
  const { GET } = await import('@/app/api/instasolver/ai-fill/route');
  const request = {
    nextUrl: new URL(`http://localhost/api/instasolver/ai-fill?job=${encodeURIComponent(jobId)}`)
  } as unknown as Parameters<typeof GET>[0];
  return GET(request);
}

/** The Windows box finishing a job: result shape is { answer: "<raw CLI text>" }. */
function finish(jobId: string, reply: unknown, status = 'done') {
  const j = jobs.find((x) => x.id === jobId);
  if (!j) throw new Error('no such job');
  j.status = status;
  j.result = { answer: typeof reply === 'string' ? reply : JSON.stringify(reply) };
}

/** POST, let the box answer, then GET — the whole round trip. */
async function fillRoundTrip(text: string, reply: unknown) {
  const res = await post({ text });
  const queued = await res.json();
  finish(queued.job_id, reply);
  return get(queued.job_id);
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
  jobs = [];
  enqueueCalls = [];
  enqueueOverride = null;
  resourceRows = [
    { name: 'Room 101', building_number: 'Main Building', block_number: 'A' },
    { name: 'Room 102', building_number: 'Main Building', block_number: 'A' },
    { name: 'Lab', building_number: null, block_number: 'Block B' }
  ];
  tablesRead = [];
  resourceCalls = [];
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  profileMaybeSingle.mockResolvedValue({
    data: { id: 'user-1', role: 'staff', institution_id: 'inst-1', is_active: true },
    error: null
  });
});

describe('ai-fill — runs on the Max lane, never a paid API key', () => {
  it('queues one instasolver.ai_fill job with only the typed text, the places and who asked', async () => {
    const text = 'A block first floor la switch board spark aagudhu';
    const res = await post({ text });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ success: true, status: 'pending' });
    expect(typeof body.job_id).toBe('string');

    expect(enqueueCalls).toHaveLength(1);
    const call = enqueueCalls[0];
    expect(call.p_job_type).toBe('instasolver.ai_fill');
    expect(AI_FILL_JOB_TYPE).toBe('instasolver.ai_fill');
    expect(call.p_payload.text).toBe(text);
    // The known places go in the prompt; the photo never does (JSON text only).
    expect(call.p_payload.places).toContain('Main Building · Block A');
    expect(call.p_payload.places).not.toContain('Building Main Building');
    expect(call.p_payload.places).toContain('Block B');
    expect(call.p_payload._ctx).toEqual({
      requester: 'user-1',
      places: ['Main Building · Block A', 'Block B']
    });
    const hash = createHash('sha256').update(text).digest('hex');
    expect(call.p_dedupe_key).toBe(`instasolver-ai-fill:user-1:${hash}`);
    // Places are read under the caller's own session, never service-role.
    expect(tablesRead).toContain('resources');
  });

  it('the route no longer imports the paid model client or names a feature key', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/api/instasolver/ai-fill/route.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/ai-clients\/chat/);
    expect(src).not.toMatch(/claudeChatForFeature|FEATURE_KEY|@anthropic-ai\/sdk/);
    expect(src).toMatch(/fn_ai_enqueue_system/);
  });

  it('the job type is registered on the max lane, Opus, batch drain, seat-owner only', () => {
    const sql = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261230090300_instasolver_ai_fill_job_type.sql'),
      'utf8'
    );
    const values = sql.slice(sql.indexOf('VALUES'));
    expect(values).toContain("('instasolver.ai_fill',");
    // lane, provider, model_id, tool_set, output_target, allow_rule
    expect(values).toContain("'max', 'anthropic', 'opus', 'none', 'job.result', 'seat_owner',");
    // interactive=false (the batch drain claims it), schedulable=false, enabled=true
    expect(values).toMatch(/'seat_owner',\s*false, false, true,/);
    expect(sql).toContain('{{text}}');
    expect(sql).toContain('{{places}}');
    // The prompt's trade list matches the one the form validates against.
    for (const t of INSTASOLVER_TRADES) expect(sql).toContain(JSON.stringify(t));
  });

  it('returns the parsed fields once the job is done', async () => {
    const res = await fillRoundTrip('A block first floor la switch board spark aagudhu', GOOD);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe('done');
    expect(body.fill).toMatchObject({
      trade: 'Electrical',
      urgency: 'dangerous',
      place: 'Block A, first floor corridor',
      confidence: 0.9,
      one_question: null
    });
  });

  it('answers "pending" while the box has not finished', async () => {
    const queued = await (await post({ text: 'fan not working' })).json();
    jobs[0].status = 'claimed';
    const res = await get(queued.job_id);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ success: true, status: 'pending', job_id: queued.job_id });
  });

  it('clamps a long place and description to the form limits', async () => {
    const res = await fillRoundTrip('something long', {
      ...GOOD,
      place: 'x'.repeat(300),
      description: 'y'.repeat(900)
    });
    const body = await res.json();
    expect(body.fill.place.length).toBe(120);
    expect(body.fill.description.length).toBe(500);
  });

  it('reads only resource rows that name a building or block, in a stable order, own college only', async () => {
    await post({ text: 'fan not working' });
    const methods = resourceCalls.map((c) => c[0]);
    expect(resourceCalls).toContainEqual(['eq', 'institution_id', 'inst-1']);
    expect(resourceCalls).toContainEqual([
      'or',
      'building_number.not.is.null,block_number.not.is.null'
    ]);
    expect(methods).toContain('order');
    // The filter and the order come before the row cap, not after it.
    expect(methods.indexOf('or')).toBeLessThan(methods.indexOf('limit'));
    expect(methods.indexOf('order')).toBeLessThan(methods.indexOf('limit'));
  });

  it('accepts a reply wrapped in a json code fence', () => {
    const fill = parseAiFill('```json\n' + JSON.stringify(GOOD) + '\n```');
    expect(fill?.trade).toBe('Electrical');
  });
});

describe('ai-fill — the same words twice within 10 minutes reuse one job', () => {
  it('a second tap with the same text (spaces aside) gets the same job, nothing new queued', async () => {
    const first = await (await post({ text: 'fan  not working' })).json();
    const second = await (await post({ text: '  fan not   working ' })).json();
    expect(second.job_id).toBe(first.job_id);
    expect(enqueueCalls).toHaveLength(1);
  });

  it('a finished job is reused too, and answers with the fill straight away', async () => {
    const first = await (await post({ text: 'fan not working' })).json();
    finish(first.job_id, GOOD);
    const res = await post({ text: 'fan not working' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: 'done', job_id: first.job_id });
    expect(body.fill.trade).toBe('Electrical');
    expect(enqueueCalls).toHaveLength(1);
  });

  it('a reuse does not use up an hourly slot', async () => {
    for (let i = 0; i < AI_FILL_LIMIT_PER_WINDOW + 3; i += 1) {
      expect((await post({ text: 'fan not working' })).status).toBe(202);
    }
    expect(enqueueCalls).toHaveLength(1);
  });

  it('after 10 minutes the same words queue a new job', async () => {
    const first = await (await post({ text: 'fan not working' })).json();
    finish(first.job_id, GOOD);
    jobs[0].requested_at = new Date(Date.now() - AI_FILL_DEDUPE_WINDOW_MS - 1000).toISOString();
    const second = await (await post({ text: 'fan not working' })).json();
    expect(second.job_id).not.toBe(first.job_id);
    expect(enqueueCalls).toHaveLength(2);
  });

  it('a job that failed is not reused — the next tap queues a fresh one', async () => {
    const first = await (await post({ text: 'fan not working' })).json();
    finish(first.job_id, 'boom', 'error');
    const second = await (await post({ text: 'fan not working' })).json();
    expect(second.job_id).not.toBe(first.job_id);
  });

  it("the same words from someone else are that person's own job", async () => {
    const first = await (await post({ text: 'fan not working' })).json();
    getUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });
    profileMaybeSingle.mockResolvedValue({
      data: { id: 'user-2', role: 'staff', institution_id: 'inst-1', is_active: true },
      error: null
    });
    const second = await (await post({ text: 'fan not working' })).json();
    expect(second.job_id).not.toBe(first.job_id);
    expect(enqueueCalls[1].p_dedupe_key).toContain(':user-2:');
  });

  it('losing a race to an identical tap reuses the winner instead of failing', async () => {
    jobs.push({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      job_type: 'instasolver.ai_fill',
      status: 'pending',
      result: null,
      payload: { _ctx: { requester: 'user-1', places: [] } },
      requested_at: new Date().toISOString()
    });
    // The lookup misses (no _dedupe yet), then the RPC reports the racer.
    enqueueOverride = (args) => {
      jobs[0].payload._dedupe = args.p_dedupe_key;
      return { ok: false, error: 'in_flight' };
    };
    const res = await post({ text: 'fan not working' });
    expect(res.status).toBe(202);
    expect((await res.json()).job_id).toBe('aaaaaaaa-0000-4000-8000-000000000001');
  });
});

describe('ai-fill — only the person who asked can read the fill', () => {
  it("someone else's job id answers 404", async () => {
    const first = await (await post({ text: 'fan not working' })).json();
    finish(first.job_id, GOOD);
    getUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });
    const res = await get(first.job_id);
    expect(res.status).toBe(404);
  });

  it('a job id that is not a uuid is refused', async () => {
    expect((await get('not-a-uuid')).status).toBe(400);
  });
});

describe('ai-fill — the one question', () => {
  it('passes a usable question through as tap-to-pick options', async () => {
    const body = await (
      await fillRoundTrip('fan not working', {
        ...GOOD,
        place: '',
        confidence: 0.4,
        one_question: {
          field: 'place',
          text: 'Which block is this in?',
          options: ['Main Building · Block A', 'Block B', 'Block Z (made up)']
        }
      })
    ).json();

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
    const res = await fillRoundTrip('fan not working', 'Sorry, I cannot help with that.');
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ success: false, fallback: true, error: AI_FILL_FALLBACK_MESSAGE });
  });

  it('an unknown trade fails the parse (never invents a twelfth kind)', () => {
    expect(parseAiFill(JSON.stringify({ ...GOOD, trade: 'Gardening' }))).toBeNull();
    expect(parseAiFill(JSON.stringify({ ...GOOD, urgency: 'high' }))).toBeNull();
  });

  it('a job that ended in error is a fallback, not a 500', async () => {
    const queued = await (await post({ text: 'fan not working' })).json();
    finish(queued.job_id, 'runner crashed', 'error');
    const res = await get(queued.job_id);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ fallback: true, error: AI_FILL_FALLBACK_MESSAGE });
  });

  it('a queue that refuses the job (type not applied yet, no seat owner) is a fallback', async () => {
    enqueueOverride = () => ({ ok: false, error: 'unknown or disabled job_type' });
    const res = await post({ text: 'fan not working' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: true, error: AI_FILL_FALLBACK_MESSAGE });
  });
});

describe('ai-fill — who may queue it', () => {
  it(`refuses the ${AI_FILL_LIMIT_PER_WINDOW + 1}th new fill in an hour with 429 and nothing queued`, async () => {
    for (let i = 0; i < AI_FILL_LIMIT_PER_WINDOW; i += 1) {
      expect((await post({ text: `fan not working ${i}` })).status).toBe(202);
    }
    const res = await post({ text: 'fan not working again' });
    expect(res.status).toBe(429);
    expect((await res.json()).fallback).toBe(true);
    expect(enqueueCalls).toHaveLength(AI_FILL_LIMIT_PER_WINDOW);
  });

  it('refuses a guest account before anything is queued', async () => {
    profileMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', role: 'guest', institution_id: 'inst-1', is_active: true },
      error: null
    });
    const res = await post({ text: 'fan not working' });
    expect(res.status).toBe(403);
    expect(enqueueCalls).toHaveLength(0);
  });

  it('refuses someone not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await post({ text: 'fan not working' })).status).toBe(401);
    expect(enqueueCalls).toHaveLength(0);
  });

  it('refuses text that is too short, before anything is queued', async () => {
    expect((await post({ text: 'hi' })).status).toBe(400);
    expect((await post('__bad__')).status).toBe(400);
    expect(enqueueCalls).toHaveLength(0);
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

describe('ai-fill — the AI never overrules what the person set', () => {
  it('can turn "dangerous" on, never off', () => {
    expect(mergeDangerous(true, 'normal')).toBe(true);
    expect(mergeDangerous(true, undefined)).toBe(true);
    expect(mergeDangerous(false, 'dangerous')).toBe(true);
    expect(mergeDangerous(true, 'dangerous')).toBe(true);
    expect(mergeDangerous(false, 'normal')).toBe(false);
  });

  it("fills an empty field, replaces its own earlier fill, keeps the person's words", () => {
    expect(mergeFilledField('', null, 'Block A')).toBe('Block A');
    expect(mergeFilledField('   ', null, 'Block A')).toBe('Block A');
    expect(mergeFilledField('Block A', 'Block A', 'Block B')).toBe('Block B');
    expect(mergeFilledField('near the canteen tap', null, 'Block A')).toBe('near the canteen tap');
    expect(mergeFilledField('Block A, edited', 'Block A', 'Block B')).toBe('Block A, edited');
  });
});

describe('ai-fill — a late fill never replaces a kind of problem picked by hand', () => {
  it('sets the trade when none is picked or it is still the last fill, never over a hand pick', () => {
    expect(mergeFilledChoice(null, null, 'Electrical')).toBe('Electrical');
    expect(mergeFilledChoice('Electrical', 'Electrical', 'Plumbing & water')).toBe('Plumbing & water');
    expect(mergeFilledChoice<string>('Civil & building', null, 'Electrical')).toBe('Civil & building');
    expect(mergeFilledChoice<string>('Civil & building', 'Electrical', 'Plumbing & water')).toBe('Civil & building');
  });
});
