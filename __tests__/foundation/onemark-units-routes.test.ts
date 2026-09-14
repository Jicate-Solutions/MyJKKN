/**
 * OneMark — /api/foundation/onemark/units route handlers (Wave 3 Lane U).
 *
 * WHY THIS FILE EXISTS. Lane U's spec item 5 names four test cases; the first
 * round shipped two of them (re-order planning, the sentinel) as pure-function
 * tests and left the two ROUTE behaviours — "add-unit writes both rows" and
 * "DELETE -> 405" — with no coverage at all. That left the most dangerous path
 * in the lane completely untested: the compensating
 * `admin.from(TOPICS_TABLE).delete()` that runs when the junction insert fails.
 * If that path is wrong, an unmapped taxonomy row is stranded in a table CDC
 * shares — the exact state the route's own comment calls "worse than none".
 *
 * The shape follows __tests__/foundation/onemark-attempt-routes.test.ts, the
 * established pattern for route handlers in this module: hoisted mocks for the
 * two Supabase clients, then the handlers imported after them.
 *
 * The load-bearing assertions here are the WRITE assertions. Every insert,
 * update and delete is recorded with the client that issued it, so a test can
 * say not just "a row was written" but "the taxonomy row went through the
 * service-role client and the junction row went through the session client" —
 * which is the whole two-client argument the lane rests on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PHYSICS_ID = '11111111-2222-4333-8444-555555555555';
const NEW_TOPIC_ID = '33333333-2222-4333-8444-555555555555';
const UNIT_TOPIC_ID = '44444444-2222-4333-8444-555555555555';

interface Write {
  client: 'session' | 'service';
  op: 'insert' | 'update' | 'delete';
  table: string;
  row?: Record<string, unknown>;
  filters: string[];
}

let currentUser: { id: string } | null = { id: 'user-author' };
let permissionAllowed = true;
let writes: Write[] = [];
/** Per-table, per-op error injection: `${table}:${op}` -> message. */
let failOn: Record<string, string> = {};

let examRows: Array<Record<string, unknown>> = [];
let mapRows: Array<Record<string, unknown>> = [];
let topicRows: Array<Record<string, unknown>> = [];

function tableData(table: string): Array<Record<string, unknown>> {
  switch (table) {
    case 'exam_definitions':
      return examRows;
    case 'exam_topic_map':
      return mapRows;
    case 'cdc_exam_syllabus_topics':
      return topicRows;
    case 'fp_items':
      return [];
    default:
      return [];
  }
}

function builder(table: string, client: 'session' | 'service') {
  const filters: string[] = [];
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn((c: string, v: unknown) => {
      filters.push(`${c}=${String(v)}`);
      return b;
    }),
    in: vi.fn((c: string, v: unknown[]) => {
      filters.push(`${c}in(${v.join(',')})`);
      return b;
    }),
    like: vi.fn((c: string, v: string) => {
      filters.push(`${c}like${v}`);
      return b;
    }),
    order: vi.fn(() => b),
    range: vi.fn(() => Promise.resolve({ data: tableData(table), error: null })),
    insert: vi.fn((row: Record<string, unknown>) => {
      const err = failOn[`${table}:insert`];
      writes.push({ client, op: 'insert', table, row, filters: [...filters] });
      const created =
        table === 'cdc_exam_syllabus_topics' ? { id: NEW_TOPIC_ID, ...row } : { ...row };
      const res = err
        ? { data: null, error: { message: err } }
        : { data: created, error: null };
      const ins: any = {
        select: vi.fn(() => ins),
        single: vi.fn(() => Promise.resolve(res)),
        maybeSingle: vi.fn(() => Promise.resolve(res)),
        then: (resolve: any) => resolve(err ? { data: null, error: { message: err } } : { data: [created], error: null }),
      };
      return ins;
    }),
    update: vi.fn((row: Record<string, unknown>) => {
      const upd: any = {
        eq: vi.fn((c: string, v: unknown) => {
          filters.push(`${c}=${String(v)}`);
          return upd;
        }),
        like: vi.fn((c: string, v: string) => {
          filters.push(`${c}like${v}`);
          return upd;
        }),
        select: vi.fn(() => upd),
        maybeSingle: vi.fn(() => {
          const err = failOn[`${table}:update`];
          writes.push({ client, op: 'update', table, row, filters: [...filters] });
          return Promise.resolve(
            err ? { data: null, error: { message: err } } : { data: { id: UNIT_TOPIC_ID, ...row }, error: null },
          );
        }),
        then: (resolve: any) => {
          const err = failOn[`${table}:update`];
          writes.push({ client, op: 'update', table, row, filters: [...filters] });
          return resolve(err ? { data: null, error: { message: err } } : { data: [], error: null });
        },
      };
      return upd;
    }),
    delete: vi.fn(() => {
      const del: any = {
        eq: vi.fn((c: string, v: unknown) => {
          const err = failOn[`${table}:delete`];
          writes.push({ client, op: 'delete', table, filters: [`${c}=${String(v)}`] });
          return Promise.resolve(err ? { data: null, error: { message: err } } : { data: null, error: null });
        }),
      };
      return del;
    }),
    maybeSingle: vi.fn(() => {
      const d = tableData(table).filter((r) =>
        filters.every((f) => {
          const [c, v] = f.split('=');
          return v === undefined || String(r[c]) === v;
        }),
      );
      return Promise.resolve({ data: d[0] ?? null, error: null });
    }),
    then: (resolve: any) => resolve({ data: tableData(table), error: null }),
  };
  return b;
}

function rpc(fn: string) {
  if (fn === 'user_has_permission') return Promise.resolve({ data: permissionAllowed, error: null });
  return Promise.resolve({ data: null, error: null });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (t: string) => builder(t, 'session'),
      rpc,
    }),
  createServiceRoleClient: () => ({
    from: (t: string) => builder(t, 'service'),
    rpc,
  }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { GET, POST } from '@/app/api/foundation/onemark/units/route';
import { PATCH, DELETE } from '@/app/api/foundation/onemark/units/[topicId]/route';

function post(body: unknown) {
  return new Request('https://jkkn.ai/api/foundation/onemark/units', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}
function patch(body: unknown) {
  return new Request('https://jkkn.ai/api/foundation/onemark/units/x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as any;
}
const params = (topicId: string) => ({ params: Promise.resolve({ topicId }) });

beforeEach(() => {
  currentUser = { id: 'user-author' };
  permissionAllowed = true;
  writes = [];
  failOn = {};
  examRows = [
    { id: PHYSICS_ID, config_key: 'tn_hsc_physics', display_name: 'TN State Board — HSC Physics (Class 12)', sort_order: 1 },
  ];
  mapRows = [
    { exam_definition_id: PHYSICS_ID, topic_id: UNIT_TOPIC_ID, sort_order: 1 },
    { exam_definition_id: PHYSICS_ID, topic_id: 'topic-2', sort_order: 2 },
  ];
  topicRows = [
    { id: UNIT_TOPIC_ID, config_key: 'onemark_phy_u01', display_name: 'Unit 1', description: null, is_active: true, is_system: true },
    { id: 'topic-2', config_key: 'onemark_phy_u02', display_name: 'Unit 2', description: null, is_active: true, is_system: true },
  ];
});

// ---------------------------------------------------------------------------
// Spec item 5, case 1 — "add-unit writes both rows"
// ---------------------------------------------------------------------------

describe('POST /api/foundation/onemark/units — add a unit', () => {
  it('writes BOTH rows: the taxonomy row and its junction row', async () => {
    const res = await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'Unit 12: Semiconductors' }));
    expect(res.status).toBe(201);

    const inserts = writes.filter((w) => w.op === 'insert');
    expect(inserts).toHaveLength(2);

    const topic = inserts.find((w) => w.table === 'cdc_exam_syllabus_topics');
    const map = inserts.find((w) => w.table === 'exam_topic_map');
    expect(topic).toBeTruthy();
    expect(map).toBeTruthy();
    // The junction row points at the taxonomy row that was just created — a
    // unit that is written but not mapped is invisible to the wizard.
    expect(map!.row).toMatchObject({ exam_definition_id: PHYSICS_ID, topic_id: NEW_TOPIC_ID });
  });

  it('elevates ONLY the taxonomy write; the junction row goes through the session client', async () => {
    await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'Unit 12' }));
    const topic = writes.find((w) => w.op === 'insert' && w.table === 'cdc_exam_syllabus_topics');
    const map = writes.find((w) => w.op === 'insert' && w.table === 'exam_topic_map');
    // cdc_exam_syllabus_topics write RLS is is_cdc_head_or_super() only, so it
    // must be elevated; exam_topic_map already admits foundation.items.manage,
    // so RLS must remain the boundary there.
    expect(topic!.client).toBe('service');
    expect(map!.client).toBe('session');
  });

  it('mints an onemark_ key and leaves the shared GLOBAL sort_order alone', async () => {
    await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'Unit 12: Semiconductors' }));
    const topic = writes.find((w) => w.op === 'insert' && w.table === 'cdc_exam_syllabus_topics')!;
    expect(String(topic.row!.config_key)).toMatch(/^onemark_phy_/);
    // Writing the topics table's own sort_order is what interleaves the two
    // subjects in every flat listing. The position lives on the junction row.
    expect(topic.row).not.toHaveProperty('sort_order');
    const map = writes.find((w) => w.op === 'insert' && w.table === 'exam_topic_map')!;
    expect(map.row!.sort_order).toBe(3); // one past the last real unit (1, 2)
  });

  it('ROLLS THE TAXONOMY ROW BACK when the junction insert fails — both rows or neither', async () => {
    failOn['exam_topic_map:insert'] = 'permission denied for table exam_topic_map';
    const res = await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'Unit 12' }));
    expect(res.status).toBe(500);

    const del = writes.find((w) => w.op === 'delete' && w.table === 'cdc_exam_syllabus_topics');
    expect(del, 'the compensating delete must run').toBeTruthy();
    expect(del!.client).toBe('service');
    expect(del!.filters).toContain(`id=${NEW_TOPIC_ID}`);
    expect((await res.json()).error).toMatch(/Nothing was created/);
  });

  it('names the stranded unit when the rollback ITSELF fails, instead of swallowing it', async () => {
    failOn['exam_topic_map:insert'] = 'insert failed';
    failOn['cdc_exam_syllabus_topics:delete'] = 'delete failed';
    const res = await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'Unit 12' }));
    expect(res.status).toBe(500);
    const { error } = await res.json();
    // A half-written unit nobody is told about is unfindable: the key is the
    // only handle anyone has to clean it up.
    expect(error).toMatch(/could not be removed either/);
    expect(error).toMatch(/onemark_phy_/);
  });

  it('refuses a subject that is not a OneMark subject', async () => {
    const res = await POST(post({ exam_definition_id: 'some-coaching-exam', display_name: 'X' }));
    expect(res.status).toBe(400);
    expect(writes.filter((w) => w.op === 'insert')).toHaveLength(0);
  });

  it('refuses an empty name before it writes anything', async () => {
    const res = await POST(post({ exam_definition_id: PHYSICS_ID, display_name: '   ' }));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Spec item 5, case 2 — "DELETE -> 405"
// ---------------------------------------------------------------------------

describe('DELETE /api/foundation/onemark/units/[topicId] — never a hard delete', () => {
  it('answers 405 and writes nothing', async () => {
    const res = await DELETE();
    expect(res.status).toBe(405);
    expect(writes).toHaveLength(0);
  });

  it('advertises only the verb this route actually exports', async () => {
    const res = await DELETE();
    // The Allow header is the one a client is meant to trust. There is no GET
    // on this route, so listing one would advertise a verb that 405s.
    expect(res.headers.get('Allow')).toBe('PATCH');
  });

  it('tells the caller what to do instead, in the words the screen uses', async () => {
    const { error } = await (await DELETE()).json();
    expect(error).toMatch(/Retire it instead/i);
    expect(error).toMatch(/keeps its questions/i);
  });
});

// ---------------------------------------------------------------------------
// The gate — the same key on every verb
// ---------------------------------------------------------------------------

describe('the units API gate', () => {
  it('401s an unauthenticated caller and writes nothing', async () => {
    currentUser = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'X' }))).status).toBe(401);
    expect((await PATCH(patch({ display_name: 'X' }), params(UNIT_TOPIC_ID))).status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('403s a signed-in caller without foundation.items.manage, and writes nothing', async () => {
    permissionAllowed = false;
    expect((await GET()).status).toBe(403);
    expect((await POST(post({ exam_definition_id: PHYSICS_ID, display_name: 'X' }))).status).toBe(403);
    expect((await PATCH(patch({ display_name: 'X' }), params(UNIT_TOPIC_ID))).status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('refuses a topicId that is not a uuid before it touches the database', async () => {
    const res = await PATCH(patch({ display_name: 'X' }), params('not-a-uuid'));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PATCH — the write fence, and the immutable key
// ---------------------------------------------------------------------------

describe('PATCH /api/foundation/onemark/units/[topicId]', () => {
  it('repeats the onemark_ fence inside the UPDATE statement itself', async () => {
    const res = await PATCH(patch({ display_name: 'Renamed' }), params(UNIT_TOPIC_ID));
    expect(res.status).toBe(200);
    const upd = writes.find((w) => w.op === 'update' && w.table === 'cdc_exam_syllabus_topics')!;
    expect(upd.client).toBe('service');
    // Even if the resolver were wrong, this cannot reach a coaching topic.
    expect(upd.filters.some((f) => f.startsWith('config_keylike'))).toBe(true);
  });

  it('refuses to re-key a unit — fp_items reads the key', async () => {
    const res = await PATCH(patch({ config_key: 'onemark_phy_other' }), params(UNIT_TOPIC_ID));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('404s a topic that is not a OneMark unit', async () => {
    mapRows = [];
    const res = await PATCH(patch({ display_name: 'X' }), params('99999999-2222-4333-8444-555555555555'));
    expect(res.status).toBe(404);
    expect(writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });

  it('writes the description a reviewer corrects — the Tamil-name edit path', async () => {
    const res = await PATCH(patch({ description: 'மின்னியல் (Vol. 1)' }), params(UNIT_TOPIC_ID));
    expect(res.status).toBe(200);
    const upd = writes.find((w) => w.op === 'update' && w.table === 'cdc_exam_syllabus_topics')!;
    expect(upd.row!.description).toBe('மின்னியல் (Vol. 1)');
  });

  it('clears the description when it is sent empty, rather than storing whitespace', async () => {
    await PATCH(patch({ description: '   ' }), params(UNIT_TOPIC_ID));
    const upd = writes.find((w) => w.op === 'update' && w.table === 'cdc_exam_syllabus_topics')!;
    expect(upd.row!.description).toBeNull();
  });
});
