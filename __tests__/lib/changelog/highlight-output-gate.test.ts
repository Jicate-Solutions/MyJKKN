// =====================================================================
// What's New — THE OUTPUT GATE: what the writer returns is checked, not trusted
// =====================================================================
// Measured on production 2026-09-15: 64 of 475 write-ups (13%) used a
// forbidden word — student, faculty, staff — and every one of them was written
// AFTER the vocabulary went into the prompt. A rule the model follows 87% of
// the time is not a rule. These tests pin the rule that IS one:
//
//   * forbiddenVocabulary() finds the words, in any line, any case, plural or
//     not, and nothing else;
//   * accessHoleLanguage() finds a commit subject that describes a closed
//     access hole, and leaves a feature that ADDS a permission alone;
//   * THE ONE THAT MATTERS: run through the cron's collect pass, a model answer
//     carrying 'staff' can NEVER be filed as 'approved'. First hit → one retry
//     with the words named. Second hit → 'skipped' / 'vocab'.
//   * the security route files 'skipped' / 'security' without asking the model;
//   * every 'skipped' row the cron writes carries a skip_reason;
//   * a person's skip through the PUT carries skip_reason 'person';
//   * the run's summary rides out under `meta` for cron_run_log.
//
// The fixtures carry the forbidden words on purpose and live in JSON so the
// terminology gate does not scan them as copy.
// =====================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fx from './fixtures/highlight-vocab.json';
import {
  accessHoleLanguage,
  buildHighlightPrompt,
  forbiddenVocabulary,
  type HighlightSubject,
} from '@/lib/changelog/highlight-prompt';

const SUBJECT: HighlightSubject = {
  subject: 'Engagement shows each principal only their college',
  moduleLabel: 'Analytics',
  moduleHref: '/analytics',
  author: 'A',
  kind: 'fixed',
  breaking: false,
};

// ── the pure checks ──────────────────────────────────────────────────────────

describe('forbiddenVocabulary — the words no published line may carry', () => {
  it('passes a clean draft', () => {
    expect(forbiddenVocabulary(fx.clean)).toEqual([]);
  });

  it('finds the word in the affects line, not only the headline', () => {
    expect(forbiddenVocabulary(fx.staff_in_affects)).toEqual(['staff']);
  });

  it('finds the singular in the headline', () => {
    expect(forbiddenVocabulary(fx.student_in_headline)).toEqual(['student']);
  });

  it('finds the plural in the action line, whatever its case', () => {
    expect(forbiddenVocabulary(fx.plural_students_in_action)).toEqual(['students']);
  });

  it('is case-insensitive', () => {
    expect(forbiddenVocabulary(fx.faculty_uppercase)).toEqual(['faculty']);
  });

  it('reports every distinct word across all three lines, once each', () => {
    expect(forbiddenVocabulary(fx.three_words_across_lines)).toEqual(['student', 'faculty', 'staff']);
  });

  it('respects word boundaries — staffing and studentships are not hits', () => {
    expect(forbiddenVocabulary(fx.near_misses)).toEqual([]);
  });
});

describe('accessHoleLanguage — a subject that describes a closed hole', () => {
  it('catches the exact subject the model wrote up for every reader on 2026-09-15', () => {
    expect(accessHoleLanguage(fx.subjects.access_hole_49ae115)).toBeTruthy();
  });

  it('catches the other ways a developer says it', () => {
    expect(accessHoleLanguage(fx.subjects.without_permission)).toBeTruthy();
    expect(accessHoleLanguage(fx.subjects.could_see_other)).toBeTruthy();
    expect(accessHoleLanguage(fx.subjects.rls_named)).toBeTruthy();
    expect(accessHoleLanguage(fx.subjects.bypassed)).toBeTruthy();
  });

  it('leaves a feature that ADDS a permission, and an ordinary fix, alone', () => {
    expect(accessHoleLanguage(fx.subjects.benign_permission_feature)).toBeNull();
    expect(accessHoleLanguage(fx.subjects.benign_fix)).toBeNull();
    expect(accessHoleLanguage(fx.subjects.benign_any)).toBeNull();
  });
});

describe('the prompt', () => {
  it('states the vocabulary as a rule, and teaches the access-hole refusal by example', () => {
    const p = buildHighlightPrompt(SUBJECT);
    expect(p).toContain('JKKN VOCABULARY');
    expect(p).toContain('Write learner or learners');
    expect(p).toContain('Write Senior Learners');
    expect(p).toContain('Write team members');
    expect(p).toContain('A FIX THAT CLOSES AN ACCESS HOLE HAS NO USER-VISIBLE EFFECT');
    expect(p).toContain('WORKED EXAMPLE 3');
  });

  it('names the offending words on the retry, and only on the retry', () => {
    const words = forbiddenVocabulary(fx.three_words_across_lines);
    const first = buildHighlightPrompt(SUBJECT);
    const retry = buildHighlightPrompt(SUBJECT, { rewriteWithout: words });
    expect(first).not.toContain('YOUR PREVIOUS ANSWER WAS REJECTED');
    expect(retry).toContain('YOUR PREVIOUS ANSWER WAS REJECTED');
    expect(retry).toContain(words.join(', '));
  });
});

// ── the cron's collect pass, end to end through the route ────────────────────

type Upsert = Record<string, unknown>;

const enqueueJobsLane = vi.fn();
const collectJobsLane = vi.fn();
vi.mock('@/lib/services/platform/ai-jobs-lane', () => ({
  enqueueJobsLane: (...a: unknown[]) => enqueueJobsLane(...a),
  collectJobsLane: (...a: unknown[]) => collectJobsLane(...a),
}));
// The run-log wrapper is under its own test; here the handler is called bare.
vi.mock('@/lib/cron/run-log', () => ({
  withCronRun: (_key: string, handler: unknown) => handler,
}));

const upserts: Upsert[] = [];
const updates: Upsert[] = [];
let entries: Record<string, unknown>[] = [];
let priorHighlights: Record<string, unknown>[] = [];

/** A builder that answers the operators the cron route uses, on a fixed table. */
function table(rows: Record<string, unknown>[], name: string) {
  let out = [...rows];
  const result = () => ({ data: out, error: null });
  const b: any = {
    select: () => b,
    in: (col: string, vals: string[]) => {
      out = out.filter((r) => vals.includes(r[col] as string));
      return b;
    },
    eq: (col: string, v: unknown) => {
      out = out.filter((r) => r[col] === v);
      return b;
    },
    gte: (col: string, v: string) => {
      out = out.filter((r) => (r[col] as string) >= v);
      return b;
    },
    order: () => b,
    limit: async () => result(),
    range: async (from: number, to: number) => {
      out = out.slice(from, to + 1);
      return result();
    },
    upsert: async (row: Upsert) => {
      upserts.push({ _table: name, ...row });
      return { error: null };
    },
    update: (row: Upsert) => {
      const u: any = {
        eq: (col: string, v: unknown) => {
          u[col] = v;
          return u;
        },
        then: (resolve: any) => {
          updates.push({ _table: name, ...row, _where: { app_key: u.app_key, sha: u.sha } });
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return u;
    },
    then: (resolve: any) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

const MODULES = [{ key: 'analytics', label: 'Analytics', perm: ['analytics'], href: '/analytics' }];

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: async () => ({ data: null, error: null }),
    from: (t: string) =>
      t === 'changelog_entries'
        ? table(entries, t)
        : t === 'changelog_highlights'
          ? table(priorHighlights, t)
          : t === 'changelog_modules'
            ? table(MODULES, t)
            : table([], t),
  }),
}));

function job(sha: string, text: string, ctx: Record<string, unknown> = {}) {
  return {
    jobId: `job-${sha}`,
    jobType: 'whats_new.highlight_draft',
    context: {
      app_key: 'myjkkn',
      sha,
      subject: 'Engagement shows each principal only their college',
      writer: SUBJECT,
      ...ctx,
    },
    message: { content: [{ type: 'text', text }] },
  };
}

function entryRow(sha: string, subject: string, over: Record<string, unknown> = {}) {
  return {
    sha,
    app_key: 'myjkkn',
    entry_date: '2026-09-14',
    kind: 'fixed',
    module_key: 'analytics',
    subject,
    author: 'A',
    pr_number: 1,
    breaking: false,
    hidden: false,
    reverted_by_sha: null,
    ...over,
  };
}

async function runCron(): Promise<Record<string, any>> {
  const { GET } = await import('@/app/api/cron/whats-new-highlight-drafts/route');
  const req = {
    headers: { get: (k: string) => (k === 'authorization' ? 'Bearer s3cret' : null) },
    nextUrl: { searchParams: new URLSearchParams(), pathname: '/api/cron/whats-new-highlight-drafts' },
  } as unknown as NextRequest;
  const res = await GET(req);
  return res.json();
}

beforeEach(() => {
  vi.resetModules();
  upserts.length = 0;
  updates.length = 0;
  entries = [];
  priorHighlights = [];
  enqueueJobsLane.mockReset();
  collectJobsLane.mockReset();
  enqueueJobsLane.mockResolvedValue({ ok: true, jobId: 'retry-1' });
  collectJobsLane.mockResolvedValue([]);
  process.env.CRON_SECRET = 's3cret';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

const highlightWrites = () => upserts.filter((u) => u._table === 'changelog_highlights');

describe("the cron's collect pass — a draft carrying 'staff' cannot reach 'approved'", () => {
  it('sends the FIRST hit back once, naming the words, and files nothing', async () => {
    collectJobsLane.mockResolvedValue([job('aaa1111', fx.model_answers.with_staff)]);

    const body = await runCron();

    // Nothing filed — least of all an approved row.
    expect(highlightWrites()).toEqual([]);
    // One retry, same dedupe key as the original, words named in the prompt,
    // and the context marked so the NEXT answer is final.
    expect(enqueueJobsLane).toHaveBeenCalledTimes(1);
    const args = enqueueJobsLane.mock.calls[0][1];
    expect(args.dedupeKey).toBe('whats_new_highlight|myjkkn|aaa1111');
    expect(args.prompt).toContain('YOUR PREVIOUS ANSWER WAS REJECTED');
    expect(args.prompt).toContain('staff');
    expect(args.context.vocab_retry).toEqual(['staff']);
    expect(body.vocab_retried).toBe(1);
    expect(body.published).toBe(0);
  });

  it("files the SECOND hit as 'skipped' / 'vocab' — never 'approved'", async () => {
    collectJobsLane.mockResolvedValue([
      job('aaa1111', fx.model_answers.with_students_and_faculty, { vocab_retry: ['staff'] }),
    ]);

    const body = await runCron();

    expect(enqueueJobsLane).not.toHaveBeenCalled();
    const [w] = highlightWrites();
    expect(w).toMatchObject({ sha: 'aaa1111', status: 'skipped', skip_reason: 'vocab', source: 'ai' });
    expect(w.headline).toBeNull();
    expect(w.affects).toBeNull();
    expect(w.action).toBeNull();
    expect(body.vocab_rejected).toBe(1);
    expect(body.published).toBe(0);
  });

  it('never writes status approved for a forbidden-word answer, first or second time', async () => {
    for (const ctx of [{}, { vocab_retry: ['staff'] }]) {
      upserts.length = 0;
      collectJobsLane.mockResolvedValue([job('aaa1111', fx.model_answers.with_staff, ctx)]);
      await runCron();
      expect(highlightWrites().filter((u) => u.status === 'approved')).toEqual([]);
    }
  });

  it('re-queues, rather than publishes, a pre-gate job that carries no writer context', async () => {
    // A job enqueued before the gate shipped has no `writer` to rebuild the
    // prompt from. It must not be published with the word in it, and it must
    // not be retired without a retry either: file nothing, so the entry has no
    // row and selection offers it again with the new context.
    const j = job('aaa1111', fx.model_answers.with_staff);
    delete (j.context as any).writer;
    collectJobsLane.mockResolvedValue([j]);

    const body = await runCron();

    expect(highlightWrites()).toEqual([]);
    expect(enqueueJobsLane).not.toHaveBeenCalled();
    expect(body.vocab_requeued).toBe(1);
  });

  it("publishes a clean answer as 'approved' with no skip_reason", async () => {
    collectJobsLane.mockResolvedValue([job('bbb2222', fx.model_answers.clean)]);

    const body = await runCron();

    const [w] = highlightWrites();
    expect(w).toMatchObject({ sha: 'bbb2222', status: 'approved', skip_reason: null });
    expect(body.published).toBe(1);
  });

  it("files the writer's own refusal as 'skipped' / 'ai_refused' — the reason was never set before", async () => {
    collectJobsLane.mockResolvedValue([job('ccc3333', fx.model_answers.refusal)]);

    const body = await runCron();

    const [w] = highlightWrites();
    expect(w).toMatchObject({ sha: 'ccc3333', status: 'skipped', skip_reason: 'ai_refused' });
    expect(body.skipped_no_effect).toBe(1);
  });

  it("routes an in-flight access-hole job to 'skipped' / 'security' whatever the model wrote", async () => {
    collectJobsLane.mockResolvedValue([
      job('49ae115', fx.model_answers.clean, { subject: fx.subjects.access_hole_49ae115 }),
    ]);

    const body = await runCron();

    const [w] = highlightWrites();
    expect(w).toMatchObject({ sha: '49ae115', status: 'skipped', skip_reason: 'security' });
    expect(w.headline).toBeNull();
    expect(body.security_routed).toBe(1);
    expect(body.published).toBe(0);
  });

  it("every 'skipped' row the collect pass writes carries a skip_reason", async () => {
    collectJobsLane.mockResolvedValue([
      job('ccc3333', fx.model_answers.refusal),
      job('aaa1111', fx.model_answers.with_staff, { vocab_retry: ['staff'] }),
      job('49ae115', fx.model_answers.clean, { subject: fx.subjects.access_hole_49ae115 }),
    ]);

    await runCron();

    const skipped = highlightWrites().filter((u) => u.status === 'skipped');
    expect(skipped).toHaveLength(3);
    for (const w of skipped) expect(typeof w.skip_reason).toBe('string');
  });
});

describe("the cron's submit pass — the security route never asks the model", () => {
  it("files an access-hole subject as 'skipped' / 'security' and enqueues nothing for it", async () => {
    entries = [
      entryRow('49ae115', fx.subjects.access_hole_49ae115),
      entryRow('ddd4444', fx.subjects.benign_fix),
    ];

    const body = await runCron();

    const sec = highlightWrites().find((u) => u.sha === '49ae115');
    expect(sec).toMatchObject({ status: 'skipped', skip_reason: 'security', source: 'ai' });
    expect(sec?.headline).toBeNull();
    // The benign one was enqueued; the hole was not.
    expect(enqueueJobsLane).toHaveBeenCalledTimes(1);
    expect(enqueueJobsLane.mock.calls[0][1].context.sha).toBe('ddd4444');
    expect(body.security_routed).toBe(1);
    expect(body.enqueued).toBe(1);
  });

  it("treats a commit typed 'security' the same way, whatever its subject says", async () => {
    entries = [entryRow('eee5555', fx.subjects.benign_fix, { kind: 'security' })];

    await runCron();

    expect(highlightWrites().find((u) => u.sha === 'eee5555')).toMatchObject({
      status: 'skipped',
      skip_reason: 'security',
    });
    expect(enqueueJobsLane).not.toHaveBeenCalled();
  });

  it('carries the writer context on every job it enqueues, so the retry can rebuild the prompt', async () => {
    entries = [entryRow('ddd4444', fx.subjects.benign_fix)];

    await runCron();

    const ctx = enqueueJobsLane.mock.calls[0][1].context;
    expect(ctx.writer).toMatchObject({ subject: fx.subjects.benign_fix, moduleLabel: 'Analytics', kind: 'fixed' });
    expect(ctx.vocab_retry).toBeUndefined();
  });
});

describe('the ledger — the run summary rides out under `meta`', () => {
  it('carries the counts and the takedown list, not the drafted text', async () => {
    entries = [entryRow('49ae115', fx.subjects.access_hole_49ae115)];
    collectJobsLane.mockResolvedValue([
      job('bbb2222', fx.model_answers.clean),
      job('ccc3333', fx.model_answers.refusal),
    ]);

    const body = await runCron();

    expect(body.meta).toMatchObject({
      published: 1,
      skipped_no_effect: 1,
      security_routed: 1,
      vocab_retried: 0,
      vocab_rejected: 0,
      retracted: [],
    });
    expect(body.meta.drafted).toBeUndefined();
  });
});

// ── a person's skip through the PUT ──────────────────────────────────────────

describe("the approver's PUT — a person's skip says so", () => {
  let putUpserts: Upsert[];
  let client: any;

  beforeEach(() => {
    putUpserts = [];
    client = {
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      rpc: async () => ({ data: true, error: null }),
      from: () => ({
        upsert: async (row: Upsert) => {
          putUpserts.push(row);
          return { error: null };
        },
      }),
    };
  });

  async function put(body: Record<string, unknown>) {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => client,
      createServiceRoleClient: () => client,
    }));
    const { PUT } = await import('@/app/api/whats-new/highlights/route');
    return PUT(new Request('https://x.test/api/whats-new/highlights', { method: 'PUT', body: JSON.stringify(body) }));
  }

  it("stamps skip_reason 'person' on a skip", async () => {
    const res = await put({ sha: 'abc1234', status: 'skipped' });
    expect(res.status).toBe(200);
    expect(putUpserts[0]).toMatchObject({ sha: 'abc1234', status: 'skipped', skip_reason: 'person' });
  });

  it('leaves skip_reason untouched on approve and on draft — the last takedown stays on record', async () => {
    await put({ sha: 'abc1234', status: 'approved', headline: 'h', affects: 'a', action: 'x' });
    await put({ sha: 'abc1234', status: 'draft' });
    for (const u of putUpserts) expect('skip_reason' in u).toBe(false);
  });
});
