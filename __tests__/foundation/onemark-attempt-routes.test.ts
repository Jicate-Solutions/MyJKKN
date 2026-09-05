/**
 * OneMark — /api/foundation/onemark/attempts route handlers.
 *
 * The load-bearing tests are the leak tests. fp_items carries the answer key
 * and is operator-gated under RLS, so these routes read it with the
 * service-role client — which means RLS is NOT the boundary any more, this
 * code is. The mocked table returns `answer`, `explanation` and
 * `explanation_ta` on every row, and the tests assert they are absent from
 * what a learner receives before responding, and present only after.
 *
 * Correctness is never computed here: the tests assert the respond route
 * reports whatever fn_onemark_record_response returned, even when the mocked
 * `chosen` would compare equal to the key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted above the handler imports.
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-learner' };
let learnerRow: Record<string, unknown> | null = null;
let attemptRow: Record<string, unknown> | null = null;
let assessmentRow: Record<string, unknown> | null = null;
let itemRows: Array<Record<string, unknown>> = [];
let responseRows: Array<Record<string, unknown>> = [];
let enrolmentRows: Array<Record<string, unknown>> = [];
let paperItemRows: Array<Record<string, unknown>> = [];
let insertedAttempts: Array<Record<string, unknown>> = [];
let rpcCalls: Array<{ fn: string; args: any }> = [];
let rpcResult: any = { is_correct: false, vault_status: 'active', streak: 0 };
let rpcError: any = null;
let permissionAllowed = true;
let selects: string[] = [];
let eqCalls: string[] = [];

// The served-set token is signed with the estate's JWT secret convention.
process.env.SUPABASE_JWT_SECRET = 'onemark-test-secret';

const EXAM_ID = '11111111-2222-4333-8444-555555555555';
const POOL_ID = '22222222-2222-4333-8444-555555555555';
const PAPER_ID = '55555555-2222-4333-8444-555555555555';
const ATTEMPT_ID = '99999999-8888-4777-8666-555555555555';
const ITEM_ID = '33333333-2222-4333-8444-555555555555';

function tableData(table: string): any {
  switch (table) {
    case 'fp_students':
      return learnerRow;
    case 'fp_attempts':
      return attemptRow;
    case 'fp_assessments':
      return assessmentRow;
    case 'fp_items':
      return itemRows;
    case 'fp_responses':
      return responseRows;
    case 'fp_enrollments':
      return enrolmentRows;
    case 'fp_assessment_items':
      return paperItemRows;
    case 'exam_definitions':
      return [{ id: EXAM_ID, config_key: 'tn_hsc_physics', display_name: 'Physics', is_active: true }];
    default:
      return [];
  }
}

/** One builder for both clients: every terminal resolves from tableData. */
function builder(table: string) {
  let headCount = false;
  const b: any = {
    select: vi.fn((cols: string, opts?: any) => {
      selects.push(`${table}:${cols}`);
      // A head-count select stays chainable (.eq().eq()) and resolves to
      // { count } when awaited, like the real builder.
      if (opts?.head) headCount = true;
      return b;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push(`${table}:${col}=${String(val)}`);
      return b;
    }),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve({ data: tableData(table), error: null })),
    maybeSingle: vi.fn(() => {
      const d = tableData(table);
      return Promise.resolve({ data: Array.isArray(d) ? d[0] ?? null : d, error: null });
    }),
    single: vi.fn(() => Promise.resolve({ data: insertedAttempts[insertedAttempts.length - 1] ?? null, error: null })),
    insert: vi.fn((row: any) => {
      if (table === 'fp_attempts') {
        const created = {
          id: ATTEMPT_ID,
          started_at: '2026-09-04T05:00:00.000Z',
          submitted_at: null,
          score: null,
          ...row,
        };
        insertedAttempts.push(created);
      }
      return b;
    }),
    then: (resolve: any) => {
      const d = tableData(table);
      if (headCount) {
        return resolve({ count: Array.isArray(d) ? d.length : d ? 1 : 0, error: null });
      }
      return resolve({ data: Array.isArray(d) ? d : d ? [d] : [], error: null });
    },
  };
  return b;
}

function rpc(fn: string, args: any) {
  rpcCalls.push({ fn, args });
  if (fn === 'user_has_permission') return Promise.resolve({ data: permissionAllowed, error: null });
  if (fn === 'fn_get_policy_int') return Promise.resolve({ data: args.p_default, error: null });
  if (fn === 'fn_get_policy_bool') return Promise.resolve({ data: false, error: null });
  if (rpcError) return Promise.resolve({ data: null, error: rpcError });
  return Promise.resolve({ data: rpcResult, error: null });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (t: string) => builder(t),
      rpc,
    }),
  createServiceRoleClient: () => ({
    from: (t: string) => builder(t),
    rpc,
  }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { GET as getHome, POST as startSitting } from '@/app/api/foundation/onemark/attempts/route';
import { POST as respond } from '@/app/api/foundation/onemark/attempts/[attemptId]/respond/route';
import { POST as finalize } from '@/app/api/foundation/onemark/attempts/[attemptId]/finalize/route';
import { localDayKey, upcomingVaultDays } from '@/lib/services/onemark/vault-service';
import { shuffleOptionsTogether, signServedSet, verifyServedSet } from '@/lib/services/onemark/attempt-server';
import { OneMarkPolicyDefaults, OneMarkPolicyKeys } from '@/types/onemark';

function post(body: unknown) {
  return new Request('https://jkkn.ai/x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}
const params = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });

const LACED_ITEM = {
  id: ITEM_ID,
  exam_definition_id: EXAM_ID,
  is_active: true,
  stem: 'The SI unit of capacitance is',
  stem_ta: 'மின்தேக்குத்திறனின் SI அலகு',
  options: [{ key: 'A', text: 'farad' }, { key: 'B', text: 'henry' }],
  options_ta: [{ key: 'A', text: 'ஃபாரட்' }, { key: 'B', text: 'ஹென்றி' }],
  option_layout: 'auto',
  q_type: 'mcq_single',
  topic_id: null,
  answer: 'A',
  explanation: 'One farad is one coulomb per volt.',
  explanation_ta: 'ஒரு ஃபாரட் என்பது ஒரு வோல்ட்டுக்கு ஒரு கூலூம்.',
};

beforeEach(() => {
  currentUser = { id: 'user-learner' };
  learnerRow = {
    id: 'learner-1',
    full_name: 'A Learner',
    grade: '12',
    status: 'active',
    parental_consent_at: null,
  };
  assessmentRow = { id: POOL_ID, title: 'Practice — Physics', exam_definition_id: EXAM_ID, config: {} };
  attemptRow = null;
  itemRows = [LACED_ITEM];
  responseRows = [];
  enrolmentRows = [];
  paperItemRows = [];
  insertedAttempts = [];
  rpcCalls = [];
  rpcResult = { is_correct: false, vault_status: 'active', streak: 0 };
  rpcError = null;
  permissionAllowed = true;
  selects = [];
  eqCalls = [];
});

/** The token POST /attempts would have minted for a sitting that served ITEM_ID. */
const served = (ids: string[] = [ITEM_ID]) => signServedSet(ATTEMPT_ID, ids);

/** A live paper whose window and duration are both in the past. */
function closedPaper() {
  const h = 60 * 60 * 1000;
  return {
    id: PAPER_ID,
    title: 'Unit 1 hall paper',
    exam_definition_id: EXAM_ID,
    cohort_id: 'cohort-1',
    kind: 'mock',
    is_active: true,
    config: {
      open_at: new Date(Date.now() - 3 * h).toISOString(),
      close_at: new Date(Date.now() - 1 * h).toISOString(),
      duration_min: 30,
    },
  };
}

// ---------------------------------------------------------------------------

describe('GET /api/foundation/onemark/attempts', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await getHome();
    expect(res.status).toBe(401);
  });

  it('answers learner: null for a signed-in caller who is not enrolled — not an error', async () => {
    learnerRow = null;
    const res = await getHome();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.learner).toBeNull();
    expect(body.subjects).toEqual([]);
  });

  it('gates on foundation.practice.take server-side, not only on the page', async () => {
    permissionAllowed = false;
    const res = await getHome();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/access/i);
    const gate = rpcCalls.find((c) => c.fn === 'user_has_permission');
    expect(gate?.args).toEqual({ permission_name: 'foundation.practice.take' });
  });

  it('counts only vault items still ACTIVE in the bank — the same filter the draw applies', async () => {
    await getHome();
    expect(eqCalls).toContain('onemark_mistake_vault:item.is_active=true');
  });

  it('picks the ACTIVE fp_students row when a profile has two (no UNIQUE on profile_id)', async () => {
    learnerRow = [
      { id: 'learner-old', full_name: 'A Learner', grade: '11', status: 'transferred', parental_consent_at: null },
      { id: 'learner-new', full_name: 'A Learner', grade: '12', status: 'active', parental_consent_at: null },
    ] as any;
    const body = await (await getHome()).json();
    expect(body.learner?.id).toBe('learner-new');
  });
});

describe('POST /api/foundation/onemark/attempts', () => {
  it('rejects an unknown mode before touching the database', async () => {
    const res = await startSitting(post({ mode: 'exam', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(400);
    expect(selects).toHaveLength(0);
  });

  it('refuses a signed-in caller who is not enrolled with 403', async () => {
    learnerRow = null;
    const res = await startSitting(post({ mode: 'practice', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(403);
  });

  it('opens the attempt with mode and a session_id, and never ships the answer key', async () => {
    const res = await startSitting(post({ mode: 'timed', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0].mode).toBe('timed');
    expect(insertedAttempts[0].status).toBe('in_progress');
    expect(typeof insertedAttempts[0].session_id).toBe('string');
    expect(body.deadlineAt).not.toBeNull();

    const blob = JSON.stringify(body.questions);
    expect(blob).not.toContain('"answer"');
    expect(blob).not.toContain('explanation');
    expect(blob).not.toContain('coulomb per volt');
    expect(Object.keys(body.questions[0]).sort()).toEqual([
      'id',
      'optionLayout',
      'options',
      'optionsTa',
      'qType',
      'stem',
      'stemTa',
      'topicId',
    ]);
  });

  it('asks fp_items only for the columns a learner may see', async () => {
    await startSitting(post({ mode: 'practice', examDefinitionId: EXAM_ID }));
    const itemSelects = selects.filter((s) => s.startsWith('fp_items:'));
    expect(itemSelects.length).toBeGreaterThan(0);
    for (const s of itemSelects) {
      expect(s).not.toContain('answer');
      expect(s).not.toContain('explanation');
      expect(s).not.toContain('*');
    }
  });

  it('practice has no clock and reveals after each answer; timed has a clock and does not', async () => {
    const practice = await (await startSitting(post({ mode: 'practice', examDefinitionId: EXAM_ID }))).json();
    expect(practice.deadlineAt).toBeNull();
    expect(practice.revealAfterAnswer).toBe(true);
    const timed = await (await startSitting(post({ mode: 'timed', examDefinitionId: EXAM_ID }))).json();
    expect(timed.deadlineAt).not.toBeNull();
    expect(timed.revealAfterAnswer).toBe(false);
  });

  it('draws vault review through fn_onemark_vault_draw, never client-side', async () => {
    rpcResult = [ITEM_ID];
    const res = await startSitting(post({ mode: 'vault_review', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(200);
    const draw = rpcCalls.find((c) => c.fn === 'fn_onemark_vault_draw');
    expect(draw).toBeDefined();
    expect(draw!.args.p_student_id).toBe('learner-1');
    expect(draw!.args.p_exam_definition_id).toBe(EXAM_ID);
  });

  it('treats a SHORT vault draw as normal and reports the real number (decision 13)', async () => {
    rpcResult = [ITEM_ID]; // asked for 15, the cap left 1
    const res = await startSitting(post({ mode: 'vault_review', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drawn).toBe(1);
    expect(body.requested).toBe(OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_QUESTION_COUNT]);
    expect(body.questions).toHaveLength(1);
    expect(insertedAttempts).toHaveLength(1);
  });

  it('says so plainly when the vault has nothing due, and opens no attempt', async () => {
    rpcResult = [];
    const res = await startSitting(post({ mode: 'vault_review', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(409);
    expect(insertedAttempts).toHaveLength(0);
  });

  it('refuses a caller without foundation.practice.take with 403 before any read', async () => {
    permissionAllowed = false;
    const res = await startSitting(post({ mode: 'practice', examDefinitionId: EXAM_ID }));
    expect(res.status).toBe(403);
    expect(selects).toHaveLength(0);
  });

  it('closes an interrupted live sitting whose window has shut, instead of walling it off', async () => {
    assessmentRow = closedPaper();
    enrolmentRows = [{ id: 'enr-1', cohort_id: 'cohort-1', status: 'enrolled' }];
    attemptRow = {
      id: ATTEMPT_ID,
      student_id: 'learner-1',
      assessment_id: PAPER_ID,
      mode: 'live',
      status: 'in_progress',
      started_at: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
      submitted_at: null,
      score: null,
      session_id: 'sess-live',
    };
    paperItemRows = [
      { item_id: ITEM_ID, position: 1 },
      { item_id: 'paper-item-2', position: 2 },
      { item_id: 'paper-item-3', position: 3 },
    ];
    responseRows = [{ item_id: ITEM_ID, chosen: 'A', is_correct: true, skipped: false }];

    const res = await startSitting(post({ mode: 'live', assessmentId: PAPER_ID }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.alreadySubmitted).toBe(true);
    expect(body.autoClosed).toBe(true);
    expect(body.attemptId).toBe(ATTEMPT_ID);

    // The two paper questions never answered went in as SKIPS (decision 18),
    // the answered one was not touched, then the RPC submitted it.
    const skips = rpcCalls.filter((c) => c.fn === 'fn_onemark_record_response');
    expect(skips.map((c) => c.args.p_item_id).sort()).toEqual(['paper-item-2', 'paper-item-3']);
    expect(skips.every((c) => c.args.p_skipped === true)).toBe(true);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_finalize_attempt')).toBe(true);
    expect(insertedAttempts).toHaveLength(0);
  });

  it('binds the drawn set to the attempt with a signed token that names exactly the served ids', async () => {
    const body = await (await startSitting(post({ mode: 'practice', examDefinitionId: EXAM_ID }))).json();
    expect(typeof body.servedToken).toBe('string');
    const set = verifyServedSet(ATTEMPT_ID, body.servedToken);
    expect(set).not.toBeNull();
    expect([...set!]).toEqual(body.questions.map((q: any) => q.id));
    // Minted for one attempt only.
    expect(verifyServedSet('99999999-8888-4777-8666-000000000001', body.servedToken)).toBeNull();
  });

  it('keeps Tamil options on a shuffled live paper, paired by key', () => {
    const q = {
      id: ITEM_ID,
      stem: 's',
      stemTa: 'த',
      options: [
        { key: 'A', text: 'farad' },
        { key: 'B', text: 'henry' },
        { key: 'C', text: 'ohm' },
        { key: 'D', text: 'volt' },
      ],
      optionsTa: [
        { key: 'A', text: 'ஃபாரட்' },
        { key: 'B', text: 'ஹென்றி' },
        { key: 'C', text: 'ஓம்' },
        { key: 'D', text: 'வோல்ட்' },
      ],
      optionLayout: 'auto' as const,
      qType: 'mcq_single',
      topicId: null,
    };
    for (let i = 0; i < 20; i++) {
      const out = shuffleOptionsTogether(q);
      expect(out.optionsTa).not.toBeNull();
      expect(out.options).toHaveLength(4);
      expect(out.optionsTa).toHaveLength(4);
      (out.options as any[]).forEach((o, idx) => {
        expect((out.optionsTa as any[])[idx].key).toBe(o.key);
      });
      expect((out.options as any[]).map((o) => o.key).sort()).toEqual(['A', 'B', 'C', 'D']);
    }
    // No Tamil in the bank → still none, never a mis-pairing.
    expect(shuffleOptionsTogether({ ...q, optionsTa: null }).optionsTa).toBeNull();
  });
});

describe('POST /api/foundation/onemark/attempts/[attemptId]/respond', () => {
  beforeEach(() => {
    attemptRow = {
      id: ATTEMPT_ID,
      student_id: 'learner-1',
      assessment_id: POOL_ID,
      mode: 'practice',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      submitted_at: null,
      score: null,
      session_id: 'sess-1',
    };
  });

  it('404s an attempt RLS did not return, without confirming it exists', async () => {
    attemptRow = null;
    const res = await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).not.toMatch(/permission|denied|not yours/i);
  });

  it('records through fn_onemark_record_response and reports ITS verdict, not its own', async () => {
    // chosen equals the mocked key, yet the RPC says wrong — the record wins.
    rpcResult = { is_correct: false, vault_status: 'active', streak: 0 };
    const res = await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A', timeMs: 1200 }), params(ATTEMPT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isCorrect).toBe(false);
    const call = rpcCalls.find((c) => c.fn === 'fn_onemark_record_response');
    expect(call).toBeDefined();
    expect(call!.args).toMatchObject({
      p_attempt_id: ATTEMPT_ID,
      p_item_id: ITEM_ID,
      p_chosen: 'A',
      p_skipped: false,
      p_time_ms: 1200,
    });
  });

  it('reveals the explanation AFTER answering in practice mode only', async () => {
    const practice = await (await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'B' }), params(ATTEMPT_ID))).json();
    expect(practice.reveal.correctAnswer).toBe('A');
    expect(practice.reveal.explanation).toContain('coulomb per volt');

    attemptRow = { ...(attemptRow as any), mode: 'timed' };
    const timed = await (await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'B' }), params(ATTEMPT_ID))).json();
    expect(timed.reveal).toBeNull();
    expect(JSON.stringify(timed)).not.toContain('coulomb per volt');
  });

  it('passes a skip through as skipped, with no verdict and no reveal', async () => {
    const body = await (await respond(post({ servedToken: served(), itemId: ITEM_ID, skipped: true }), params(ATTEMPT_ID))).json();
    expect(body.skipped).toBe(true);
    expect(body.isCorrect).toBeNull();
    expect(body.reveal).toBeNull();
    const call = rpcCalls.find((c) => c.fn === 'fn_onemark_record_response');
    expect(call!.args.p_skipped).toBe(true);
    expect(call!.args.p_chosen).toBeNull();
  });

  it('refuses a late ANSWER on a timed sitting but still accepts a skip', async () => {
    attemptRow = {
      ...(attemptRow as any),
      mode: 'timed',
      started_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };
    const late = await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(late.status).toBe(409);
    expect((await late.json()).expired).toBe(true);
    const skip = await respond(post({ servedToken: served(), itemId: ITEM_ID, skipped: true }), params(ATTEMPT_ID));
    expect(skip.status).toBe(200);
  });

  it('refuses a response on a submitted sitting', async () => {
    attemptRow = { ...(attemptRow as any), status: 'submitted' };
    const res = await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(res.status).toBe(409);
  });

  it('refuses an item that was NOT served — the answer key of an unserved item is unreachable', async () => {
    const unserved = '44444444-2222-4333-8444-000000000077';
    itemRows = [LACED_ITEM, { ...LACED_ITEM, id: unserved }]; // active, same subject — still refused
    const res = await respond(
      post({ servedToken: served([ITEM_ID]), itemId: unserved, chosen: 'A' }),
      params(ATTEMPT_ID),
    );
    expect(res.status).toBe(400);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_record_response')).toBe(false);
    expect(JSON.stringify(await res.json())).not.toContain('coulomb per volt');
  });

  it('refuses a missing or tampered served token on a practice sitting', async () => {
    const missing = await respond(post({ itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(missing.status).toBe(400);
    const good = served([ITEM_ID]);
    const tampered = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
    const bad = await respond(post({ servedToken: tampered, itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(bad.status).toBe(400);
    // A 64-char MULTI-BYTE signature has the same string length as a real hex
    // one; it must be a plain 400, never a RangeError → 500 from the
    // constant-time compare.
    const multiByte = good.slice(0, good.lastIndexOf('.') + 1) + '±'.repeat(64);
    expect(verifyServedSet(ATTEMPT_ID, multiByte)).toBeNull();
    const mb = await respond(post({ servedToken: multiByte, itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(mb.status).toBe(400);
    // A token that names OTHER ids, correctly signed, still excludes this one.
    const other = served(['44444444-2222-4333-8444-000000000078']);
    const wrongSet = await respond(post({ servedToken: other, itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(wrongSet.status).toBe(400);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_record_response')).toBe(false);
  });

  it('needs no token on a LIVE paper — fp_assessment_items is the served set there', async () => {
    attemptRow = { ...(attemptRow as any), mode: 'live', assessment_id: PAPER_ID };
    assessmentRow = { ...closedPaper(), config: { open_at: new Date(Date.now() - 60_000).toISOString() } };
    paperItemRows = [{ item_id: ITEM_ID, position: 1 }];
    rpcResult = { is_correct: null, skipped: false, vault_status: null, streak: null, revealed: false };
    const res = await respond(post({ itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(res.status).toBe(200);
  });

  it('reports a withheld verdict (timed / live) as null, never as wrong', async () => {
    attemptRow = { ...(attemptRow as any), mode: 'timed' };
    rpcResult = { is_correct: null, skipped: false, vault_status: null, streak: null, revealed: false };
    const body = await (await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID))).json();
    expect(body.isCorrect).toBeNull();
    expect(body.vaultStatus).toBeNull();
    expect(body.reveal).toBeNull();
  });

  it("reads Lane S's own 'not in_progress' refusal as already submitted (409), not as a retry", async () => {
    rpcError = {
      message: `fn_onemark_record_response: attempt ${ATTEMPT_ID} is submitted, not in_progress (single submission, decision 19)`,
    };
    const res = await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).alreadySubmitted).toBe(true);
  });

  it('answers 503 in plain words while Lane S’s RPC is not yet applied', async () => {
    rpcError = { message: 'Could not find the function public.fn_onemark_record_response' };
    const res = await respond(post({ servedToken: served(), itemId: ITEM_ID, chosen: 'A' }), params(ATTEMPT_ID));
    expect(res.status).toBe(503);
  });
});

describe('POST /api/foundation/onemark/attempts/[attemptId]/finalize', () => {
  beforeEach(() => {
    attemptRow = {
      id: ATTEMPT_ID,
      student_id: 'learner-1',
      assessment_id: POOL_ID,
      mode: 'timed',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      submitted_at: null,
      score: null,
      session_id: 'sess-1',
    };
    responseRows = [
      { item_id: ITEM_ID, chosen: 'B', is_correct: false, time_ms: 900, skipped: false, created_at: '2026-09-04T05:00:01Z' },
      { item_id: 'other-item', chosen: null, is_correct: null, time_ms: null, skipped: true, created_at: '2026-09-04T05:00:02Z' },
    ];
  });

  it('closes through fn_onemark_finalize_attempt and reveals the key only then', async () => {
    const res = await finalize(post({ skippedItemIds: [] }), params(ATTEMPT_ID));
    expect(res.status).toBe(200);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_finalize_attempt')).toBe(true);
    const body = await res.json();
    expect(body.questions[0].correctAnswer).toBe('A');
    expect(body.questions[0].explanation).toContain('coulomb per volt');
  });

  it('reports a skipped question as neither right nor wrong', async () => {
    const body = await (await finalize(post({}), params(ATTEMPT_ID))).json();
    expect(body.answered).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.correct).toBe(0);
    const skipped = body.questions.find((q: any) => q.itemId === 'other-item');
    expect(skipped.isCorrect).toBeNull();
    expect(skipped.skipped).toBe(true);
  });

  it('answers a second submission with 409 AND the stored result (decision 19)', async () => {
    attemptRow = { ...(attemptRow as any), status: 'submitted', submitted_at: '2026-09-04T05:10:00Z', score: 0 };
    const res = await finalize(post({}), params(ATTEMPT_ID));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.alreadySubmitted).toBe(true);
    expect(body.questions).toHaveLength(2);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_finalize_attempt')).toBe(false);
  });

  it('caps the blanks a caller may name at ONE sitting (onemark.paper.question_count)', async () => {
    const ids = Array.from({ length: 80 }, (_, i) => `44444444-2222-4333-8444-${String(i).padStart(12, '0')}`);
    // Every named id is a real, active item of the subject — the cap alone
    // must hold the line.
    itemRows = ids.map((id) => ({ id, exam_definition_id: EXAM_ID, is_active: true }));
    responseRows = [];
    await finalize(post({ skippedItemIds: ids, servedToken: served(ids) }), params(ATTEMPT_ID));
    const skips = rpcCalls.filter((c) => c.fn === 'fn_onemark_record_response');
    expect(skips).toHaveLength(OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_QUESTION_COUNT]);
  });

  it('refuses injected blanks outside the served set — no skip, no key, 400', async () => {
    const injected = ['44444444-2222-4333-8444-000000000081', '44444444-2222-4333-8444-000000000082'];
    itemRows = injected.map((id) => ({ id, exam_definition_id: EXAM_ID, is_active: true }));
    const res = await finalize(
      post({ skippedItemIds: injected, servedToken: served([ITEM_ID, 'other-item']) }),
      params(ATTEMPT_ID),
    );
    expect(res.status).toBe(400);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_record_response')).toBe(false);
    expect(rpcCalls.some((c) => c.fn === 'fn_onemark_finalize_attempt')).toBe(false);
    const body = await res.json();
    expect(body.questions).toBeUndefined();
  });

  it('refuses named blanks with no token on a timed sitting, but closes cleanly with none named', async () => {
    const blank = '44444444-2222-4333-8444-000000000083';
    itemRows = [{ id: blank, exam_definition_id: EXAM_ID, is_active: true }];
    const noToken = await finalize(post({ skippedItemIds: [blank] }), params(ATTEMPT_ID));
    expect(noToken.status).toBe(400);
    const none = await finalize(post({ skippedItemIds: [] }), params(ATTEMPT_ID));
    expect(none.status).toBe(200);
  });

  it('records blanks that ARE in the served set', async () => {
    const blank = '44444444-2222-4333-8444-000000000084';
    itemRows = [{ id: blank, exam_definition_id: EXAM_ID, is_active: true }];
    const res = await finalize(
      post({ skippedItemIds: [blank], servedToken: served([ITEM_ID, 'other-item', blank]) }),
      params(ATTEMPT_ID),
    );
    expect(res.status).toBe(200);
    const skips = rpcCalls.filter((c) => c.fn === 'fn_onemark_record_response');
    expect(skips.map((c) => c.args.p_item_id)).toEqual([blank]);
  });

  it('derives the blanks of a LIVE paper from the paper itself and ignores caller-named ids', async () => {
    attemptRow = { ...(attemptRow as any), mode: 'live', assessment_id: PAPER_ID };
    assessmentRow = closedPaper();
    paperItemRows = [
      { item_id: ITEM_ID, position: 1 },
      { item_id: 'paper-item-2', position: 2 },
      { item_id: 'paper-item-3', position: 3 },
    ];
    responseRows = [{ item_id: ITEM_ID, chosen: 'B', is_correct: false, time_ms: 900, skipped: false, created_at: '2026-09-04T05:00:01Z' }];
    const foreign = '44444444-2222-4333-8444-000000000099';
    const res = await finalize(post({ skippedItemIds: [foreign] }), params(ATTEMPT_ID));
    expect(res.status).toBe(200);
    const skips = rpcCalls.filter((c) => c.fn === 'fn_onemark_record_response');
    expect(skips.map((c) => c.args.p_item_id).sort()).toEqual(['paper-item-2', 'paper-item-3']);
    expect(skips.some((c) => c.args.p_item_id === foreign)).toBe(false);
  });

  it("treats Lane S's 'not in_progress' refusal at finalize as already submitted and still returns the review", async () => {
    rpcError = {
      message: `fn_onemark_finalize_attempt: attempt ${ATTEMPT_ID} is submitted, not in_progress (single submission, decision 19)`,
    };
    const res = await finalize(post({ skippedItemIds: [] }), params(ATTEMPT_ID));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.alreadySubmitted).toBe(true);
    expect(body.questions).toHaveLength(2);
  });

  it('names the score unit so nobody averages a count with the legacy ratio', async () => {
    const body = await (await finalize(post({}), params(ATTEMPT_ID))).json();
    expect(body.scoreUnit).toBe('correct_count');
  });
});

describe('upcomingVaultDays', () => {
  it('buckets by the VIEWER’S calendar day, not the UTC day', () => {
    const at = new Date(2026, 8, 6, 1, 30); // 01:30 local on 6 Sep, whatever the zone
    expect(localDayKey(at)).toBe('2026-09-06');
    const rows: any[] = [{ status: 'active', next_eligible_at: at.toISOString() }];
    expect(upcomingVaultDays(rows, new Date(2026, 8, 5).getTime())).toEqual([
      { day: '2026-09-06', count: 1 },
    ]);
  });

  it('groups active future rows by day and ignores mastered and due-now rows', () => {
    const now = Date.parse('2026-09-04T06:00:00Z');
    const rows: any[] = [
      { status: 'active', next_eligible_at: '2026-09-06T03:00:00Z' },
      { status: 'active', next_eligible_at: '2026-09-06T09:00:00Z' },
      { status: 'active', next_eligible_at: '2026-09-04T05:00:00Z' }, // due now
      { status: 'mastered', next_eligible_at: '2026-09-08T00:00:00Z' },
      { status: 'active', next_eligible_at: null },
    ];
    expect(upcomingVaultDays(rows, now)).toEqual([{ day: '2026-09-06', count: 2 }]);
  });
});
