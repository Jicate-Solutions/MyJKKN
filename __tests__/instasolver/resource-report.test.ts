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

function makeDb(tables: Record<string, Row[]>, log: { writes: Array<[string, string, any]>; reads: string[] }) {
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
          return { data: run()[0] ?? null, error: null };
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
            for (const r of run()) Object.assign(r, pendingUpdate);
            log.writes.push(['update', table, pendingUpdate]);
            return Promise.resolve({ error: null }).then(resolve, reject);
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
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
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
    expect(owner).toEqual({ profileId: 'care-p', source: 'caretaker' });
  });

  it('skips a caretaker with no active personnel record, then prefers the EAO of the item’s own college', async () => {
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      caretaker_user_id: 'st-gone',
      caretaker_user_ids: ['st-gone', 'st-unknown'],
      institution_id: 'inst-1',
    });
    // eao-other-p is older (first in the global order) but from another college.
    expect(owner).toEqual({ profileId: 'eao-home-p', source: 'estate_office' });
  });

  it('falls back to the principal only when no EAO resolves', async () => {
    tables.profiles = tables.profiles.filter((p) => p.role !== 'executive_admin_officer');
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      caretaker_user_ids: [],
      institution_id: 'inst-1',
    });
    expect(owner).toEqual({ profileId: 'principal-p', source: 'principal' });
    expect(principalsByInstitution).toHaveBeenCalledWith(expect.anything(), ['inst-1']);
  });

  it('returns nobody (not a guess) when the whole chain is empty', async () => {
    tables.profiles = [];
    principalsByInstitution.mockResolvedValue(new Map([['inst-1', []]]));
    const { resolveResourceReportOwner } = await vi.importActual<typeof import('@/lib/instasolver/resource-report-owner')>('@/lib/instasolver/resource-report-owner');
    const owner = await resolveResourceReportOwner(makeDb(tables, log) as any, {
      institution_id: 'inst-1',
    });
    expect(owner).toEqual({ profileId: null, source: 'none' });
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
const getUser = vi.fn();
const createWalkTask = vi.fn();
const createBellNotification = vi.fn();
const resolveOwner = vi.fn();
let adminTables: Record<string, Row[]>;
const adminLog = { writes: [] as Array<[string, string, any]>, reads: [] as string[] };

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
    adminTables = {
      instasolver_report_ledger: [],
      resources: [structuredClone(RESOURCE)],
      project_tasks: [],
      resource_maintenance_logs: [],
      profiles: [{ id: 'care-p', full_name: 'Care Taker' }],
    };
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    resolveOwner.mockResolvedValue({ profileId: 'care-p', source: 'caretaker' });
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

    const log = adminTables.resource_maintenance_logs[0];
    expect(log).toMatchObject({
      resource_id: 'res-1',
      maintenance_type: 'corrective',
      assigned_to_user_id: 'care-p',
      created_by: 'user-1',
    });
    expect(log.notes).toContain('task-new');
    expect(adminTables.instasolver_report_ledger).toHaveLength(1);
  });

  it('adds to the OPEN report on the same item instead of creating a duplicate, and bells its owner', async () => {
    adminTables.project_tasks = [
      {
        id: 'task-open',
        title: 'Ceiling fan — noisy',
        status_key: 'todo',
        owner_staff_id: 'st-owner',
        metadata: { source: 'campus-walk', resource_id: 'res-1', additional_reports: [] },
      },
    ];
    const res = await post({ token: TOKEN, description: 'Still broken', join_task_id: 'task-open' });
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
      { id: 'task-done', status_key: 'done', metadata: { source: 'campus-walk', resource_id: 'res-1' } },
    ];
    const res = await post({ token: TOKEN, description: 'Broken again', join_task_id: 'task-done' });
    const body = await res.json();
    expect(body.joined).toBe(false);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(body.notice).toMatch(/already closed/);
  });

  it('never joins a task that belongs to a different item', async () => {
    adminTables.project_tasks = [
      { id: 'task-x', status_key: 'todo', metadata: { source: 'campus-walk', resource_id: 'res-OTHER' } },
    ];
    const res = await post({ token: TOKEN, description: 'Broken', join_task_id: 'task-x' });
    expect((await res.json()).joined).toBe(false);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(adminTables.project_tasks[0].metadata.additional_reports).toBeUndefined();
  });

  it('never folds a DANGEROUS report into an open one — it gets its own urgent task', async () => {
    adminTables.project_tasks = [
      { id: 'task-open', status_key: 'todo', metadata: { source: 'campus-walk', resource_id: 'res-1' } },
    ];
    await post({ token: TOKEN, description: 'Sparks from the switch', dangerous: 'true', join_task_id: 'task-open' });
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(createWalkTask.mock.calls[0][1].isUnsafe).toBe(true);
    expect(adminTables.resource_maintenance_logs[0].maintenance_type).toBe('emergency');
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
});

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('resource-report helpers', () => {
  it('picks the newest OPEN report', async () => {
    const { pickOpenTask } = await import('@/lib/instasolver/resource-report');
    const rows = [
      { id: 'a', title: null, status_key: 'done', created_at: '3', owner_staff_id: null },
      { id: 'b', title: null, status_key: 'review', created_at: '2', owner_staff_id: null },
      { id: 'c', title: null, status_key: 'todo', created_at: '1', owner_staff_id: null },
    ];
    expect(pickOpenTask(rows)?.id).toBe('b');
    expect(pickOpenTask(rows.slice(0, 1))).toBeNull();
  });

  it('formats the place without doubling labels', async () => {
    const { formatPlace } = await import('@/lib/instasolver/resource-report');
    expect(formatPlace({ building_number: '2', block_number: 'Block A', room_number: '104' })).toBe(
      'Building 2 · Block A · Room 104'
    );
    expect(formatPlace({})).toBe('');
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
