/**
 * lib/services/onemark/draft-collect — the collect pass and the inline run,
 * against an in-memory service-role fake. The chat client is mocked so no
 * model is called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chat = vi.hoisted(() => ({ claudeChatForFeature: vi.fn() }));
vi.mock('@/lib/services/platform/ai-clients/chat', () => chat);

import { collectItemDrafts, runItemDraftNow } from '@/lib/services/onemark/draft-collect';

const EXAM = '11111111-1111-4111-8111-111111111111';
const JOB = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

const payload = {
  exam_definition_id: EXAM,
  exam_key: 'tn_hsc_physics',
  topic_id: null,
  tag_keys: ['concept'],
  count: 5,
  bloom_level: 'K2',
};

/** The fp_items table shape the prompt asks for. */
function item(stem: string, over: Record<string, unknown> = {}) {
  return {
    stem,
    stem_ta: 'தமிழ் ' + stem,
    options: ['one', 'two', 'three', 'four'],
    options_ta: ['ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு'],
    answer: { correct: 'C' },
    explanation: 'because',
    explanation_ta: 'ஏனெனில்',
    bloom_level: 'K2',
    tags: ['concept'],
    option_layout: 'inline_4',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Fake admin: tables + rpc, recording writes.
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let rpcCalls: Array<{ fn: string; args: any }>;
let rpcHandlers: Record<string, (args: any) => any>;

function makeAdmin() {
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let pending: { kind: 'select' } | { kind: 'insert'; rows: Row[] } | { kind: 'update'; patch: Row } = {
      kind: 'select',
    };
    let lim: number | null = null;
    const rows = () => {
      let out = [...(tables[table] ?? [])].filter((r) => filters.every((f) => f(r)));
      if (lim !== null) out = out.slice(0, lim);
      return out;
    };
    const exec = () => {
      if (pending.kind === 'insert') {
        const inserted = pending.rows.map((r, i) => ({ id: `${table}-${(tables[table] ?? []).length + i + 1}`, ...r }));
        tables[table] = [...(tables[table] ?? []), ...inserted];
        return inserted;
      }
      if (pending.kind === 'update') {
        const patch = pending.patch;
        const hit = rows();
        for (const r of hit) Object.assign(r, patch);
        return hit;
      }
      return rows();
    };
    const self: any = {
      select: () => self,
      insert: (r: Row | Row[]) => {
        pending = { kind: 'insert', rows: Array.isArray(r) ? r : [r] };
        return self;
      },
      update: (patch: Row) => {
        pending = { kind: 'update', patch };
        return self;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return self;
      },
      limit: (n: number) => {
        lim = n;
        return self;
      },
      maybeSingle: () => Promise.resolve({ data: exec()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: exec(), error: null }).then(res, rej),
    };
    return self;
  }
  return {
    from,
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      const h = rpcHandlers[fn];
      return h ? h(args) : { data: null, error: { message: `no handler for ${fn}` } };
    },
  } as any;
}

beforeEach(() => {
  tables = { fp_items: [{ id: 'x', stem: 'Already in the bank', exam_definition_id: EXAM }], ai_jobs: [], ai_job_types: [] };
  rpcCalls = [];
  rpcHandlers = {};
  chat.claudeChatForFeature.mockReset();
});

describe('collectItemDrafts', () => {
  it('files a finished job: inserts valid drafts inactive, records inserted + rejected on the job', async () => {
    const answer = JSON.stringify({
      items: [
        item('Good one'),
        item('Already in the bank'),
        item('Bad level', { bloom_level: 'A2' }),
        item('Bare answer', { answer: 'B' }),
        item('Good two', { answer: { correct: 'D' } }),
      ],
    });
    tables.ai_jobs = [{ id: JOB, job_type: 'onemark.item_draft', status: 'done', payload, result: { answer }, requested_by: USER }];
    rpcHandlers.fn_ai_collect_claim = ({ p_job_types }: any) => ({
      data: tables.ai_jobs.filter((j) => p_job_types.includes(j.job_type)),
      error: null,
    });

    const s = await collectItemDrafts(makeAdmin());

    expect(s).toMatchObject({ collected: 1, filed: 1, items_written: 2, items_rejected: 3, errors: 0 });
    const written = tables.fp_items.filter((r) => r.source_key === 'internal');
    expect(written).toHaveLength(2);
    for (const r of written) {
      expect(r.is_active).toBe(false);
      expect(r.created_by).toBe(USER);
      expect(r.exam_definition_id).toBe(EXAM);
      expect(r.tags).toEqual(['concept']);
    }
    expect(written[1].answer).toEqual({ correct: 'D' });

    const filed = tables.ai_jobs[0].result.onemark_filed;
    expect(filed.inserted).toBe(2);
    expect(filed.item_ids).toHaveLength(2);
    expect(filed.rejected.map((r: any) => r.index)).toEqual([1, 2, 3]);
    expect(filed.rejected[1].why).toMatch(/K1–K6/);
    expect(filed.rejected[2].why).toMatch(/answer must be an object/);
    expect(filed.error).toBeNull();
    // the original answer text is kept alongside the filing record
    expect(tables.ai_jobs[0].result.answer).toBe(answer);
  });

  it('records the reason and writes nothing when the text is not a draft', async () => {
    tables.ai_jobs = [{ id: JOB, job_type: 'onemark.item_draft', status: 'done', payload, result: { answer: 'sorry, no' }, requested_by: USER }];
    rpcHandlers.fn_ai_collect_claim = () => ({ data: tables.ai_jobs, error: null });

    const s = await collectItemDrafts(makeAdmin());

    expect(s).toMatchObject({ collected: 1, filed: 0, items_written: 0, errors: 1 });
    expect(tables.fp_items).toHaveLength(1);
    expect(tables.ai_jobs[0].result.onemark_filed.error).toMatch(/no parseable JSON/);
  });

  it('is a no-op when the claim returns nothing', async () => {
    rpcHandlers.fn_ai_collect_claim = () => ({ data: [], error: null });
    const s = await collectItemDrafts(makeAdmin());
    expect(s).toMatchObject({ collected: 0, filed: 0 });
    expect(rpcCalls[0].args.p_job_types).toEqual(['onemark.item_draft']);
  });
});

describe('runItemDraftNow', () => {
  it('claims the pending job, renders the template, completes it, and files the drafts', async () => {
    tables.ai_jobs = [{ id: JOB, job_type: 'onemark.item_draft', status: 'pending', payload, result: null, requested_by: USER }];
    tables.ai_job_types = [{ job_type: 'onemark.item_draft', prompt_template: 'Draft:\n{{payload}}\n{{prompt}}' }];
    chat.claudeChatForFeature.mockResolvedValue({
      text: JSON.stringify({ items: [item('Inline one')] }),
      model_id: 'claude-sonnet-4-6',
    });
    rpcHandlers.fn_ai_complete = ({ p_job_id, p_result }: any) => {
      const j = tables.ai_jobs.find((r) => r.id === p_job_id);
      if (!j || !['claimed', 'running'].includes(j.status)) return { data: { ok: false, error: 'job not claimable' }, error: null };
      Object.assign(j, { status: 'done', result: p_result });
      return { data: { ok: true }, error: null };
    };
    rpcHandlers.fn_ai_collect_claim = () => ({ data: tables.ai_jobs.filter((j) => j.status === 'done'), error: null });

    const r = await runItemDraftNow(makeAdmin(), JOB);

    expect(r.ok).toBe(true);
    expect(r.model_id).toBe('claude-sonnet-4-6');
    const [featureKey, params] = chat.claudeChatForFeature.mock.calls[0];
    expect(featureKey).toBe('onemark.item_draft');
    const prompt = params.messages[0].content as string;
    expect(prompt).toContain('"exam_key": "tn_hsc_physics"');
    expect(prompt).not.toContain('{{');
    expect(tables.ai_jobs[0].status).toBe('done');
    expect(tables.ai_jobs[0].result.via).toBe('inline:onemark-item-drafts');
    // The claim token is per invocation (runner prefix + a uuid), never the bare constant.
    expect(tables.ai_jobs[0].claimed_by).toMatch(/^inline:onemark-item-drafts:[0-9a-f-]{36}$/);
    expect(tables.fp_items.filter((x) => x.stem === 'Inline one')).toHaveLength(1);
    expect(r.collect?.items_written).toBe(1);
  });

  it('stops with claim_lost — and never calls the model — when a concurrent run claimed the job first', async () => {
    tables.ai_jobs = [{ id: JOB, job_type: 'onemark.item_draft', status: 'pending', payload, result: null, requested_by: USER }];
    tables.ai_job_types = [{ job_type: 'onemark.item_draft', prompt_template: 'Draft:\n{{payload}}' }];
    const RACER = 'inline:onemark-item-drafts:racer-token';

    // Both invocations read `pending`; the racer's UPDATE lands between our
    // read and our UPDATE. Simulated by flipping the row the moment our
    // second ai_jobs call (the claim UPDATE) is issued, so `status = 'pending'`
    // matches nothing and the re-read shows the racer's token.
    const base = makeAdmin();
    let aiJobsCalls = 0;
    const admin = {
      ...base,
      from: (table: string) => {
        if (table === 'ai_jobs' && ++aiJobsCalls === 2) {
          Object.assign(tables.ai_jobs[0], { status: 'claimed', claimed_by: RACER });
        }
        return base.from(table);
      },
    };

    const r = await runItemDraftNow(admin as any, JOB);

    expect(r).toMatchObject({ ok: false, reason: 'claim_lost' });
    expect(chat.claudeChatForFeature).not.toHaveBeenCalled();
    expect(rpcCalls.map((c) => c.fn)).not.toContain('fn_ai_complete');
    expect(tables.ai_jobs[0].claimed_by).toBe(RACER);
    expect(tables.ai_jobs[0].status).toBe('claimed');
  });

  it('refuses a job that is not pending and fails the job when the model call throws', async () => {
    tables.ai_jobs = [{ id: JOB, job_type: 'onemark.item_draft', status: 'done', payload, result: {}, requested_by: USER }];
    expect(await runItemDraftNow(makeAdmin(), JOB)).toMatchObject({ ok: false, reason: 'not_pending' });

    tables.ai_jobs[0].status = 'pending';
    tables.ai_job_types = [{ job_type: 'onemark.item_draft', prompt_template: 'x {{payload}}' }];
    chat.claudeChatForFeature.mockRejectedValue(new Error('429 rate limited'));
    rpcHandlers.fn_ai_fail = () => ({ data: { ok: true }, error: null });

    const r = await runItemDraftNow(makeAdmin(), JOB);
    expect(r).toMatchObject({ ok: false, reason: 'model_failed' });
    expect(rpcCalls.find((c) => c.fn === 'fn_ai_fail')?.args.p_error).toMatch(/429/);
  });
});
