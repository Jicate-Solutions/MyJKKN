// __tests__/instasolver/resource-report.test.ts
// ============================================================================
// Scan a room's or an item's QR sticker to report a problem.
//
// Pinned here, because each of these fails silently:
//   1. OWNER ORDER — caretaker, else estate office (EAO), else principal. A
//      wrong order sends a broken projector to the principal while the lab
//      assistant who looks after it never hears.
//   2. THE RATE LIMIT — counted from the shared ledger, per reporter, over a
//      rolling 24h, and refused BEFORE anything is created.
//   3. "ADD TO THE OPEN REPORT" — joins only an OPEN report on the SAME item,
//      never creates a duplicate task, and bells the owner. A closed or
//      foreign task, or a dangerous report, files a new task instead.
//   4. SUGGESTED PLACES — the committed JSON carries only
//      { institution, place, report_count }: no names, emails, phones or ids.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── A small in-memory Supabase stand-in ──────────────────────────────────────
type Row = Record<string, any>;

function readPath(row: Row, col: string): unknown {
  const m = col.match(/^(\w+)->>(\w+)$/);
  if (m) return row[m[1]]?.[m[2]];
  return row[col];
}

type DbLog = {
  writes: Array<[string, string, any]>;
  reads: string[];
  /** Runs after each maybeSingle read — lets a test change the row in between. */
  onMaybeSingle?: (table: string) => void;
};

function makeDb(tables: Record<string, Row[]>, log: DbLog) {
  return {
    from(table: string) {
      log.reads.push(table);
      const rows = () => tables[table] ?? [];
      const filters: Array<(r: Row) => boolean> = [];
      let head = false;
      let limitN: number | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let pendingUpdate: any = null;
      let returnRows = false;
      const run = () => {
        let out = rows().filter((r) => filters.every((f) => f(r)));
        if (orderCol) {
          const c = orderCol;
          out = [...out].sort((a, b) =>
            (a[c] ?? '') < (b[c] ?? '') ? (orderAsc ? -1 : 1) : (a[c] ?? '') > (b[c] ?? '') ? (orderAsc ? 1 : -1) : 0
          );
        }
        if (limitN !== null) out = out.slice(0, limitN);
        return out;
      };
      const chain: any = {
        select(_cols?: string, opts?: { head?: boolean }) {
          head = Boolean(opts?.head);
          if (pendingUpdate) returnRows = true;
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => readPath(r, col) === val);
          return chain;
        },
        is(col: string, val: unknown) {
          filters.push((r) => (readPath(r, col) ?? null) === val);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(readPath(r, col)));
          return chain;
        },
        gte(col: string, val: string) {
          filters.push((r) => String(readPath(r, col)) >= val);
          return chain;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          if (!orderCol) {
            orderCol = col;
            orderAsc = opts?.ascending !== false;
          }
          return chain;
        },
        limit(n: number) {
          limitN = n;
          return chain;
        },
        async maybeSingle() {
          const row = run()[0] ?? null;
          const data = row ? { ...row } : null;
          log.onMaybeSingle?.(table);
          return { data, error: null };
        },
        async single() {
          return { data: run()[0] ?? null, error: null };
        },
        async insert(row: Row) {
          log.writes.push(['insert', table, row]);
          (tables[table] ??= []).push(row);
          return { error: null };
        },
        update(patch: Row) {
          pendingUpdate = patch;
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          if (pendingUpdate) {
            const hit = run();
            // trg_*_updated_at: every update bumps updated_at.
            for (const r of hit) Object.assign(r, pendingUpdate, { updated_at: `${r.updated_at ?? 't'}+` });
            log.writes.push(['update', table, pendingUpdate]);
            return Promise.resolve(returnRows ? { data: hit, error: null } : { error: null }).then(resolve, reject);
          }
          const out = run();
          return Promise.resolve(head ? { count: out.length, error: null } : { data: out, error: null }).then(
            resolve,
            reject
          );
        },
      };
      return chain;
    },
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, opts: unknown) => {
          log.writes.push(['upload', 'storage', { path, opts }]);
          return { error: null };
        },
      }),
    },
  };
}

// ── 1. Owner order ───────────────────────────────────────────────────────────
const principalsByInstitution = vi.fn();
vi.mock('@/lib/services/academic/intake-readiness-alarm', () => ({
  resolvePrincipalsByInstitution: (...a: unknown[]) => principalsByInstitution(...a),
}));

describe('resolveResourceReportOwner — caretaker, then estate office, then principal', () => {
  const log = { writes: [] as Array<[string, string, any]>, reads: [] as string[] };
  let tables: Record<string, Row[]>;

  beforeEach(() => {
    principalsByInstitution.mockReset();
    principalsByInstitution.mockResolvedValue(new Map([['inst-1', ['principal-p']]]));
    tables = {
      staff: [
        { id: 'st-care', profile_id: 'care-p', is_active: true },
        { id: 'st-gone', profile_id: 'gone-p', is_active: false },
        { id: 'st-eao-other', profile_id: 'eao-other-p', is_active: true },
        { id: 'st-eao-home', profile_id: 'eao-home-p', is_active: true },
        { id: 'st-principal', profile_id: 'principal-p', is_active: true },
      ],
      profiles: [
        { id: 'care-p', is_active: true },
        { id: 'gone-p', is_active: true },
        { id: 'eao-other-p', role: 'executive_admin_officer', is_active: true, institution_id: 'inst-9', created_at: '2020-01-01' },
        { id: 'eao-home-p', role: 'executive_admin_officer', is_active: true, institution_id: 'inst-1', created_at: '2024-01-01' },
      ],
    };
  });

  it('names the caretaker first when one is active', async () => {
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      caretaker_user_id: 'st-care',
      caretaker_user_ids: ['st-care'],
      institution_id: 'inst-1',
    });
    expect(owner).toEqual({ profileId: 'care-p', source: 'caretaker', caretakerMissing: false });
  });

  it('skips a caretaker with no active personnel record, then prefers the EAO of the item’s own college', async () => {
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      caretaker_user_id: 'st-gone',
      caretaker_user_ids: ['st-gone', 'st-unknown'],
      institution_id: 'inst-1',
    });
    // eao-other-p is older (first in the global order) but from another college.
    expect(owner).toEqual({ profileId: 'eao-home-p', source: 'estate_office', caretakerMissing: true });
  });

  it('falls back to the principal only when no EAO resolves', async () => {
    tables.profiles = tables.profiles.filter((p) => p.role !== 'executive_admin_officer');
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      caretaker_user_ids: [],
      institution_id: 'inst-1',
    });
    expect(owner).toEqual({ profileId: 'principal-p', source: 'principal', caretakerMissing: true });
    expect(principalsByInstitution).toHaveBeenCalledWith(expect.anything(), ['inst-1']);
  });

  it('returns nobody (not a guess) when the whole chain is empty', async () => {
    tables.profiles = [];
    principalsByInstitution.mockResolvedValue(new Map([['inst-1', []]]));
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      institution_id: 'inst-1',
    });
    expect(owner).toEqual({ profileId: null, source: 'none', caretakerMissing: true });
  });

  it('flags a caretaker who left JKKN (inactive personnel record) as missing — the job goes to the estate office', async () => {
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      caretaker_user_id: 'st-gone',
      institution_id: 'inst-1',
    });
    expect(owner.source).toBe('estate_office');
    expect(owner.caretakerMissing).toBe(true);
  });

  it('does NOT flag "no caretaker" when the caretaker lookup itself failed', async () => {
    const base = makeDb(tables, log);
    const failingStaff = {
      from(t: string) {
        if (t === 'staff') {
          const c: any = { select: () => c, in: async () => ({ data: null, error: { message: 'boom' } }) };
          return c;
        }
        return base.from(t);
      },
    };
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(failingStaff as any, {
      caretaker_user_id: 'st-care',
      institution_id: 'inst-1',
    });
    expect(owner.caretakerMissing).toBe(false);
  });

  it('uses the ITEM’s college for the estate office and the principal, never the reporter’s', async () => {
    tables.profiles = tables.profiles.filter((p) => p.role !== 'executive_admin_officer');
    principalsByInstitution.mockResolvedValue(new Map([['inst-pharm', ['principal-p']]]));
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, { institution_id: 'inst-pharm' });
    expect(principalsByInstitution).toHaveBeenCalledWith(expect.anything(), ['inst-pharm']);
    expect(owner.source).toBe('principal');
  });

  it('orders caretaker ids single column first, deduplicated', async () => {
    const { orderedCaretakerStaffIds } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    expect(
      orderedCaretakerStaffIds({ caretaker_user_id: 'b', caretaker_user_ids: ['a', 'b', ' ', 'c'] })
    ).toEqual(['b', 'a', 'c']);
  });
});

// ── 2 + 3. The API route ─────────────────────────────────────────────────────
const TOKEN = 'res_0123456789abcdef0123456789abcdef';
const OPEN_ID = '11111111-1111-4111-8111-111111111111';
const DONE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const getUser = vi.fn();
const createWalkTask = vi.fn();
const createBellNotification = vi.fn();
const resolveOwner = vi.fn();
let adminTables: Record<string, Row[]>;
const adminLog: DbLog = { writes: [], reads: [] };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'user-1', role: 'faculty', institution_id: 'inst-1', is_active: true },
            error: null,
          }),
        }),
      }),
    }),
  }),
  createServiceRoleClient: () => makeDb(adminTables, adminLog),
}));

vi.mock('@/lib/services/campus-walk/campus-walk-service', () => ({
  createWalkTask: (...a: unknown[]) => createWalkTask(...a),
  mapStaffToProfilesLocal: async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, `${id}-profile`])),
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...a: unknown[]) => createBellNotification(...a),
}));

vi.mock('@/lib/instasolver/resource-report-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instasolver/resource-report-owner')>();
  return { ...actual, resolveResourceReportOwner: (...a: unknown[]) => resolveOwner(...a) };
});

vi.mock('@/lib/services/pde/jpeg-metadata', () => ({
  isJpegMagic: () => true,
  stripJpegMetadata: (b: Uint8Array) => b,
  scanJpegForMetadata: () => ({ ok: true }),
}));

async function post(fields: Record<string, string>) {
  const { POST } = await import('@/app/api/instasolver/resource-report/route');
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST({ formData: async () => form } as any);
}

const RESOURCE = {
  id: 'res-1',
  name: 'Ceiling fan',
  qr_code_token: TOKEN,
  institution_id: 'inst-1',
  building_number: '2',
  block_number: 'A',
  floor_number: '1',
  room_number: '104',
  caretaker_user_id: 'st-care',
  caretaker_user_ids: ['st-care'],
  parent_category: { name: 'Equipment & Assets' },
  subcategory: null,
  institution: { name: 'JKKN Dental College' },
};

describe('POST /api/instasolver/resource-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminLog.writes = [];
    adminLog.reads = [];
    adminLog.onMaybeSingle = undefined;
    adminTables = {
      instasolver_report_ledger: [],
      resources: [structuredClone(RESOURCE)],
      project_tasks: [],
      resource_maintenance_logs: [],
      profiles: [{ id: 'care-p', full_name: 'Care Taker' }],
    };
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    resolveOwner.mockResolvedValue({ profileId: 'care-p', source: 'caretaker', caretakerMissing: false });
    createWalkTask.mockResolvedValue({
      taskId: 'task-new',
      attachmentId: null,
      dueDate: '2026-10-03',
      accountableProfileId: 'care-p',
    });
  });

  it('refuses the 11th report in 24h from the shared ledger, before anything is created', async () => {
    const recent = new Date(Date.now() - 3600_000).toISOString();
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    adminTables.instasolver_report_ledger = [
      ...Array.from({ length: 10 }, () => ({ reporter_id: 'user-1', created_at: recent })),
      { reporter_id: 'someone-else', created_at: recent },
      { reporter_id: 'user-1', created_at: old },
    ];
    const res = await post({ token: TOKEN, description: 'Fan is broken' });
    expect(res.status).toBe(429);
    expect(createWalkTask).not.toHaveBeenCalled();
    expect(adminLog.reads).not.toContain('project_tasks');
  });

  it('lets the 10th through: only this reporter’s last 24h count', async () => {
    const recent = new Date(Date.now() - 3600_000).toISOString();
    const old = new Date(Date.now() - 30 * 3600_000).toISOString();
    adminTables.instasolver_report_ledger = [
      ...Array.from({ length: 9 }, () => ({ reporter_id: 'user-1', created_at: recent })),
      ...Array.from({ length: 5 }, () => ({ reporter_id: 'user-1', created_at: old })),
      ...Array.from({ length: 5 }, () => ({ reporter_id: 'other', created_at: recent })),
    ];
    const res = await post({ token: TOKEN, description: 'Fan is broken' });
    expect(res.status).toBe(200);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
  });

  it('files a new report owned by the caretaker, with the place and the item, and logs it', async () => {
    const res = await post({ token: TOKEN, description: 'Fan is broken' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.joined).toBe(false);
    expect(body.routed_to).toBe('Care Taker');

    const input = createWalkTask.mock.calls[0][1];
    expect(input.accountableProfileId).toBe('care-p');
    expect(input.institutionId).toBe('inst-1');
    expect(input.title).toContain('Ceiling fan');
    expect(input.extraMetadata).toMatchObject({
      front_door: 'instasolver',
      resource_id: 'res-1',
      reporter_id: 'user-1',
      owner_source: 'caretaker',
    });
    expect(input.raisedByProfileId).toBe('user-1');
    expect(input.extraMetadata.location).toContain('Room 104');

    // createWalkTask does not bell a supplied owner — the route must.
    expect(createBellNotification).toHaveBeenCalledTimes(1);
    expect(createBellNotification.mock.calls[0][1].recipientIds).toEqual(['care-p']);
    // D10: the owner is never told WHO reported it.
    expect(createBellNotification.mock.calls[0][1].createdBy).not.toBe('user-1');

    // No maintenance-log row: nothing would ever close it (repair round 1 Oct).
    expect(adminTables.resource_maintenance_logs).toHaveLength(0);
    expect(adminLog.reads).not.toContain('resource_maintenance_logs');
    expect(adminTables.instasolver_report_ledger).toHaveLength(1);
  });

  it('adds to the OPEN report on the same item instead of creating a duplicate, and bells its owner', async () => {
    adminTables.project_tasks = [
      {
        id: OPEN_ID,
        title: 'Ceiling fan — noisy',
        status_key: 'todo',
        owner_staff_id: 'st-owner',
        metadata: { source: 'campus-walk', resource_id: 'res-1', additional_reports: [] },
      },
    ];
    const res = await post({ token: TOKEN, description: 'Still broken', join_task_id: OPEN_ID });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.joined).toBe(true);
    expect(createWalkTask).not.toHaveBeenCalled();
    const meta = adminTables.project_tasks[0].metadata;
    expect(meta.additional_reports).toHaveLength(1);
    expect(meta.additional_reports[0]).toMatchObject({ reporter_id: 'user-1', note: 'Still broken' });
    // Reserved lane keys untouched.
    expect(meta.source).toBe('campus-walk');
    expect(createBellNotification).toHaveBeenCalledTimes(1);
    expect(createBellNotification.mock.calls[0][1].recipientIds).toEqual(['st-owner-profile']);
    expect(createBellNotification.mock.calls[0][1].createdBy).not.toBe('user-1');
    // Still counted against the reporter's ceiling.
    expect(adminTables.instasolver_report_ledger).toHaveLength(1);
    expect(adminTables.resource_maintenance_logs).toHaveLength(0);
  });

  it('files a new report when the task to join is closed', async () => {
    adminTables.project_tasks = [
      { id: DONE_ID, status_key: 'done', metadata: { source: 'campus-walk', resource_id: 'res-1' } },
    ];
    const res = await post({ token: TOKEN, description: 'Broken again', join_task_id: DONE_ID });
    const body = await res.json();
    expect(body.joined).toBe(false);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(body.notice).toMatch(/already closed/);
  });

  it('never joins a task that belongs to a different item', async () => {
    adminTables.project_tasks = [
      { id: OTHER_ID, status_key: 'todo', metadata: { source: 'campus-walk', resource_id: 'res-OTHER' } },
    ];
    const res = await post({ token: TOKEN, description: 'Broken', join_task_id: OTHER_ID });
    expect((await res.json()).joined).toBe(false);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(adminTables.project_tasks[0].metadata.additional_reports).toBeUndefined();
  });

  it('never folds a DANGEROUS report into an open one — it gets its own urgent task', async () => {
    adminTables.project_tasks = [
      { id: OPEN_ID, status_key: 'todo', metadata: { source: 'campus-walk', resource_id: 'res-1' } },
    ];
    await post({ token: TOKEN, description: 'Sparks from the switch', dangerous: 'true', join_task_id: OPEN_ID });
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(createWalkTask.mock.calls[0][1].isUnsafe).toBe(true);
    expect(adminTables.resource_maintenance_logs).toHaveLength(0);
  });

  it('does not join a report that is waiting for sign-off — files a new one and says why', async () => {
    adminTables.project_tasks = [
      { id: OPEN_ID, status_key: 'review', updated_at: 't1', metadata: { source: 'campus-walk', resource_id: 'res-1' } },
    ];
    const res = await post({ token: TOKEN, description: 'Still dripping', join_task_id: OPEN_ID });
    const body = await res.json();
    expect(body.joined).toBe(false);
    expect(body.notice).toMatch(/waiting for sign-off/);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(adminTables.project_tasks[0].metadata.additional_reports).toBeUndefined();
  });

  it('refuses to add past the cap instead of dropping the oldest report', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ reporter_id: `r-${i}`, note: `n${i}`, photo_storage_path: null, at: 'x' }));
    adminTables.project_tasks = [
      { id: OPEN_ID, status_key: 'todo', updated_at: 't1', metadata: { source: 'campus-walk', resource_id: 'res-1', additional_reports: full } },
    ];
    const res = await post({ token: TOKEN, description: 'Again', join_task_id: OPEN_ID });
    const body = await res.json();
    expect(body.joined).toBe(false);
    expect(body.notice).toMatch(/many reports/);
    const kept = adminTables.project_tasks[0].metadata.additional_reports;
    expect(kept).toHaveLength(50);
    expect(kept[0].reporter_id).toBe('r-0');
  });

  it('refuses a join id that is not a task id, before any task is read', async () => {
    const res = await post({ token: TOKEN, description: 'Broken', join_task_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(createWalkTask).not.toHaveBeenCalled();
    expect(adminLog.reads).not.toContain('project_tasks');
  });

  it('keeps a write that landed in between: re-reads and appends on top of it', async () => {
    const task = {
      id: OPEN_ID,
      title: 'Ceiling fan — noisy',
      status_key: 'todo',
      owner_staff_id: 'st-owner',
      updated_at: 't1',
      metadata: { source: 'campus-walk', resource_id: 'res-1' } as Record<string, any>,
    };
    adminTables.project_tasks = [task];
    // The fix route writes metadata.fix right after our first read.
    let reads = 0;
    adminLog.onMaybeSingle = (table) => {
      if (table !== 'project_tasks' || ++reads !== 1) return;
      task.metadata = { ...task.metadata, fix: { note: 'done' } };
      task.updated_at = 't2';
    };
    const res = await post({ token: TOKEN, description: 'Still broken', join_task_id: OPEN_ID });
    const body = await res.json();
    expect(body.joined).toBe(true);
    const meta = adminTables.project_tasks[0].metadata;
    expect(meta.fix).toEqual({ note: 'done' });
    expect(meta.additional_reports).toHaveLength(1);
  });

  it('charges the page cap and the ledger row to the ITEM’s college, not the reporter’s', async () => {
    adminTables.resources = [{ ...structuredClone(RESOURCE), institution_id: 'inst-pharm' }];
    const recent = new Date(Date.now() - 3600_000).toISOString();
    // The reporter's own college has used its 20 pages; the item's has not.
    adminTables.instasolver_report_ledger = Array.from({ length: 20 }, () => ({
      reporter_id: 'x',
      institution_id: 'inst-1',
      paged: true,
      created_at: recent,
    }));
    await post({ token: TOKEN, description: 'Sparks from the switch', dangerous: 'true' });
    const input = createWalkTask.mock.calls[0][1];
    expect(input.urgentPaging.whatsApp).toBe(true);
    const mine = adminTables.instasolver_report_ledger.filter((r) => r.reporter_id === 'user-1');
    expect(mine).toHaveLength(1);
    expect(mine[0].institution_id).toBe('inst-pharm');
  });

  it('does not bell the owner twice when createWalkTask already sent its on-leave bell', async () => {
    adminTables.project_tasks = [{ id: 'task-new', is_blocked: true }];
    await post({ token: TOKEN, description: 'Fan is broken' });
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('stores each photo as its own object, never overwriting another report’s', async () => {
    const bytes = new Uint8Array(2048).fill(7);
    const { POST } = await import('@/app/api/instasolver/resource-report/route');
    const send = async () => {
      const form = new FormData();
      form.set('token', TOKEN);
      form.set('description', 'Fan is broken');
      form.set('photo', new File([bytes], 'a.jpg', { type: 'image/jpeg' }));
      return POST({ formData: async () => form } as any);
    };
    await send();
    await send();
    const uploads = adminLog.writes.filter((w) => w[0] === 'upload').map((w) => w[2]);
    expect(uploads).toHaveLength(2);
    expect(uploads[0].path).not.toBe(uploads[1].path);
    expect(uploads[0].opts).toMatchObject({ upsert: false });
    expect(uploads[0].path).toMatch(/^user-1\/resource-report\//);
  });

  it('refuses a code that is not a sticker code, and an unknown sticker, with reasons', async () => {
    const bad = await post({ token: 'not-a-token', description: 'Fan is broken' });
    expect(bad.status).toBe(400);
    const unknown = await post({ token: 'res_ffffffffffffffffffffffffffffffff', description: 'Fan is broken' });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toMatch(/not linked/);
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('needs at least 3 characters', async () => {
    const res = await post({ token: TOKEN, description: 'no' });
    expect(res.status).toBe(400);
  });

  // ── Director answers, 1 Oct 2026 ───────────────────────────────────────────
  it('a reporter from ANOTHER college files against the ITEM’s college: task, owner chain and ledger', async () => {
    // The mocked reporter's profile is at inst-1; the scanned item is at Pharmacy.
    adminTables.resources = [{ ...structuredClone(RESOURCE), institution_id: 'inst-pharm' }];
    await post({ token: TOKEN, description: 'Fan is broken' });
    expect(createWalkTask.mock.calls[0][1].institutionId).toBe('inst-pharm');
    expect(resolveOwner.mock.calls[0][1].institution_id).toBe('inst-pharm');
    const mine = adminTables.instasolver_report_ledger.filter((r) => r.reporter_id === 'user-1');
    expect(mine[0].institution_id).toBe('inst-pharm');
  });

  it('an item with no college stays with no college — never credited to the reporter’s', async () => {
    adminTables.resources = [{ ...structuredClone(RESOURCE), institution_id: null }];
    await post({ token: TOKEN, description: 'Fan is broken' });
    expect(createWalkTask.mock.calls[0][1].institutionId).toBeNull();
    const mine = adminTables.instasolver_report_ledger.filter((r) => r.reporter_id === 'user-1');
    expect(mine).toHaveLength(1);
    expect(mine[0].institution_id).toBeNull();
  });

  describe('no active caretaker — the estate office gets the job AND a note to assign one', () => {
    beforeEach(() => {
      resolveOwner.mockResolvedValue({ profileId: 'eao-p', source: 'estate_office', caretakerMissing: true });
      createWalkTask.mockResolvedValue({
        taskId: 'task-new',
        attachmentId: null,
        dueDate: '2026-10-03',
        accountableProfileId: 'eao-p',
      });
    });

    const noteCalls = () =>
      createBellNotification.mock.calls.filter((c) => c[1].category === 'instasolver:no-caretaker');

    it('sends the job bell and a separate note linking the item’s resource page', async () => {
      const res = await post({ token: TOKEN, description: 'Fan is broken' });
      expect(res.status).toBe(200);
      expect(createWalkTask.mock.calls[0][1].accountableProfileId).toBe('eao-p');
      expect(createBellNotification).toHaveBeenCalledTimes(2);
      const [note] = noteCalls();
      expect(note[1].recipientIds).toEqual(['eao-p']);
      expect(note[1].title).toContain('This item has no caretaker — please assign one: Ceiling fan');
      expect(note[1].title).toContain('Room 104');
      expect(note[1].url).toBe('/resource-management/resources/res-1');
      expect(note[1].idempotencyKey).toMatch(/^instasolver:no-caretaker:res-1:\d+$/);
      expect(note[1].createdBy).not.toBe('user-1');
    });

    it('sends at most one note per item per 30 days', async () => {
      adminTables.notifications = [
        {
          category: 'instasolver:no-caretaker',
          metadata: { resource_id: 'res-1' },
          created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        },
      ];
      await post({ token: TOKEN, description: 'Fan is broken' });
      expect(noteCalls()).toHaveLength(0);
      // The job itself still reaches the estate office.
      expect(createBellNotification).toHaveBeenCalledTimes(1);
    });

    it('sends a fresh note once the last one is more than 30 days old', async () => {
      adminTables.notifications = [
        {
          category: 'instasolver:no-caretaker',
          metadata: { resource_id: 'res-1' },
          created_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
        },
      ];
      await post({ token: TOKEN, description: 'Fan is broken' });
      expect(noteCalls()).toHaveLength(1);
    });

    it('a note for ANOTHER item does not silence this one', async () => {
      adminTables.notifications = [
        {
          category: 'instasolver:no-caretaker',
          metadata: { resource_id: 'res-OTHER' },
          created_at: new Date().toISOString(),
        },
      ];
      await post({ token: TOKEN, description: 'Fan is broken' });
      expect(noteCalls()).toHaveLength(1);
    });

    it('sends no note when the caretaker lookup failed rather than found nobody', async () => {
      resolveOwner.mockResolvedValue({ profileId: 'eao-p', source: 'estate_office', caretakerMissing: false });
      await post({ token: TOKEN, description: 'Fan is broken' });
      expect(noteCalls()).toHaveLength(0);
    });

    it('two reports in the same window carry the SAME database key (the unique index dedupes a race)', async () => {
      const { noCaretakerIdempotencyKey } = await vi.importActual<typeof import('@/lib/instasolver/no-caretaker-note')>('@/lib/instasolver/no-caretaker-note');
      const windowStart = 30 * 86_400_000 * 700;
      expect(noCaretakerIdempotencyKey('res-1', windowStart)).toBe(noCaretakerIdempotencyKey('res-1', windowStart + 29 * 86_400_000));
      expect(noCaretakerIdempotencyKey('res-1', windowStart)).not.toBe(noCaretakerIdempotencyKey('res-1', windowStart + 30 * 86_400_000));
      expect(noCaretakerIdempotencyKey('res-1', windowStart)).not.toBe(noCaretakerIdempotencyKey('res-2', windowStart));
    });
  });
});

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('resource-report helpers', () => {
  it('picks the newest report that can still be joined', async () => {
    const { pickOpenTask } = await import('@/lib/instasolver/resource-report');
    const rows = [
      { id: 'a', title: null, status_key: 'done', created_at: '3', owner_staff_id: null },
      { id: 'b', title: null, status_key: 'review', created_at: '2', owner_staff_id: null },
      { id: 'c', title: null, status_key: 'todo', created_at: '1', owner_staff_id: null },
    ];
    // 'review' = waiting for sign-off, so it is skipped for joining.
    expect(pickOpenTask(rows)?.id).toBe('c');
    expect(pickOpenTask(rows.slice(0, 2))).toBeNull();
  });

  it('formats the place without doubling labels', async () => {
    const { formatPlace } = await import('@/lib/instasolver/resource-report');
    expect(formatPlace({ building_number: '2', block_number: 'Block A', room_number: '104' })).toBe(
      'Building 2 · Block A · Room 104'
    );
    expect(formatPlace({})).toBe('');
  });

  it('only joins open reports that are not waiting for sign-off', async () => {
    const { isJoinableStatus } = await import('@/lib/instasolver/resource-report');
    expect(isJoinableStatus('todo')).toBe(true);
    expect(isJoinableStatus('in_progress')).toBe(true);
    expect(isJoinableStatus('review')).toBe(false);
    expect(isJoinableStatus('done')).toBe(false);
    expect(isJoinableStatus('cancelled')).toBe(false);
    expect(isJoinableStatus(null)).toBe(false);
  });

  it('prints stickers for the production site, whatever page printed them', async () => {
    const { stickerUrl } = await import('@/lib/instasolver/resource-report');
    expect(stickerUrl(TOKEN)).toBe(`https://www.jkkn.ai/instasolver/r/${TOKEN}`);
  });

  it('accepts only sticker-shaped tokens', async () => {
    const { isValidQrToken } = await import('@/lib/instasolver/resource-report');
    expect(isValidQrToken(TOKEN)).toBe(true);
    expect(isValidQrToken('res_0123456789abcdef')).toBe(true);
    expect(isValidQrToken("res_1' or 1=1")).toBe(false);
    expect(isValidQrToken('')).toBe(false);
  });
});

// ── 4. Suggested places — aggregate only ─────────────────────────────────────
describe('suggested places — aggregate only, no personal fields', () => {
  const ALLOWED = ['institution', 'place', 'report_count'];

  it('sums rows per place and drops everything but the three aggregate fields', async () => {
    const { aggregateSuggestedPlaces } = await import('@/lib/instasolver/suggested-places');
    const out = aggregateSuggestedPlaces({
      'Dental College & Hospital || dr kumar room': {
        site: 'Dental College & Hospital',
        area: 'Offices',
        rows: 2,
        via: 'location',
        reporter_name: 'Kumar',
        email: 'kumar@jkkn.ac.in',
        phone: '9876543210',
        user_id: 'u-1',
      },
      'Dental College & Hospital || office 2': {
        site: 'Dental College & Hospital',
        area: 'Offices',
        rows: 3,
      },
      'Boys Hostel || room 12': { site: 'Boys Hostel', area: 'Rooms', rows: 1 },
      'Dental College & Hospital || somewhere': { site: 'Dental College & Hospital', area: 'Unspecified', rows: 9 },
      'Not given || x': { site: 'Not given', area: 'Rooms', rows: 4 },
    });
    expect(out).toEqual([
      { institution: 'Boys Hostel', place: 'Rooms', report_count: 1 },
      { institution: 'Dental College & Hospital', place: 'Offices', report_count: 5 },
    ]);
    const text = JSON.stringify(out);
    // The raw typed location (the key's second half) never leaks.
    expect(text).not.toMatch(/kumar|9876543210|u-1|dr /i);
    for (const row of out) expect(Object.keys(row).sort()).toEqual(ALLOWED);
  });

  it('the committed JSON has only the three aggregate fields on every row', () => {
    const rows = JSON.parse(
      readFileSync(join(process.cwd(), 'data/instasolver/suggested-places.json'), 'utf8')
    ) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(ALLOWED);
      expect(typeof row.institution).toBe('string');
      expect(typeof row.place).toBe('string');
      expect(Number.isInteger(row.report_count)).toBe(true);
    }
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/@|\b\d{10}\b|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('matches old-site college labels to MyJKKN college names', async () => {
    const { labelMatchesInstitution, isCollegeLabel } = await import('@/lib/instasolver/suggested-places');
    expect(labelMatchesInstitution('Dental College & Hospital', 'JKKN Dental College and Hospital')).toBe(true);
    expect(labelMatchesInstitution('Dental College & Hospital', 'JKKN College of Pharmacy')).toBe(false);
    expect(isCollegeLabel('Boys Hostel')).toBe(false);
  });
});

// ── 5. Joined reports reach the fixer, the approver and the retention purge ──
describe('joined reports — read for the screens, with no reporter identity', () => {
  const meta = {
    additional_reports: [
      { reporter_id: 'u-9', raised_by_profile_id: 'u-9', reporter_role: 'faculty', note: ' Still broken ', photo_storage_path: 'u-9/resource-report/2026-10/a.jpg', at: '2026-10-01T08:00:00Z' },
      { reporter_id: 'u-8', raised_by_profile_id: 'u-8', reporter_role: null, note: 'Water on the floor', photo_storage_path: null, at: '2026-10-01T09:00:00Z' },
      { reporter_id: 'u-7', note: '', photo_storage_path: null, at: 'x' },
      'junk',
    ],
  };

  it('returns note, time and photo path only — never who reported it (D10)', async () => {
    const { readJoinedReports } = await import('@/lib/campus-walk/joined-reports');
    const out = readJoinedReports(meta);
    expect(out).toEqual([
      { note: 'Still broken', at: '2026-10-01T08:00:00Z', photoStoragePath: 'u-9/resource-report/2026-10/a.jpg' },
      { note: 'Water on the floor', at: '2026-10-01T09:00:00Z', photoStoragePath: null },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/u-9"|u-8|reporter|faculty/);
    expect(readJoinedReports({})).toEqual([]);
    expect(readJoinedReports(null)).toEqual([]);
  });

  it('lists every joined photo for signing and for the 90-day purge', async () => {
    const { joinedReportPhotoPaths, countJoinedReports } = await import('@/lib/campus-walk/joined-reports');
    expect(joinedReportPhotoPaths(meta)).toEqual(['u-9/resource-report/2026-10/a.jpg']);
    expect(countJoinedReports(meta)).toBe(3);
  });

  it('the fix screen, the approvals screen and the retention cron all read it', () => {
    for (const file of [
      'app/(routes)/campus-walk/fix/page.tsx',
      'app/(routes)/campus-walk/review/page.tsx',
      'app/api/cron/campus-walk-photo-retention/route.ts',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).toMatch(/@\/lib\/campus-walk\/joined-reports/);
    }
  });
});
