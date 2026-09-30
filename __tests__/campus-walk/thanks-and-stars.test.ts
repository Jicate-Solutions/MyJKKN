// __tests__/campus-walk/thanks-and-stars.test.ts
// ============================================================================
// "Say thanks and give stars after a fix" — Director's rulings, 2026-09-30.
//
// Pinned here, each a way the feature could go wrong quietly:
//   - ONE rating per reporter per fix round: a second tap is told "already
//     thanked" and rings no second bell; a job reopened and fixed again (a new
//     fix photo) is a new round.
//   - The thank-you NAMES THE FIXER, and names the reporter only when they
//     signed it — an unsigned thank-you says "Someone" even when the reporter's
//     name is sitting right there in the database.
//   - The bell is created BY the fixer, so an unsigned reporter cannot surface
//     as "From:".
//   - Only the reporter, only a fixed job, only 1–5 stars, never your own fix.
//   - The fixes board's CSV carries department totals and nothing personal.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFakeDb, filterOf, type RecordedQuery } from './fake-db';
import {
  ANONYMOUS_THANKER,
  buildThanksBell,
  cleanThanks,
  fixRoundKeyOf,
  parseStars,
  thankerLabel,
} from '@/lib/campus-walk/my-reports';
import {
  buildFixBoard,
  FIX_BOARD_CSV_HEADER,
  fixBoardToCsv,
  istMonthKey,
  previousMonthKey,
  type StaffDepartmentIndex,
  type WalkTaskRow,
} from '@/lib/campus-walk/scoreboard';

const getUser = vi.fn();
const createBellNotification = vi.fn();
let fake: ReturnType<typeof makeFakeDb>;
let taskRow: Record<string, any> | null;
let insertError: any;
let deliveredCount: number;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => fake.db,
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

function respond(q: RecordedQuery) {
  if (q.table === 'project_tasks' && q.op === 'select') return { data: taskRow };
  if (q.table === 'campus_walk_task_ratings' && q.op === 'insert') {
    return insertError ? { error: insertError } : { data: { id: 'rating-1' } };
  }
  if (q.table === 'user_notifications') return { count: deliveredCount };
  if (q.table === 'profiles') {
    const id = filterOf(q, 'id');
    if (id === 'fixer-1') return { data: { full_name: 'Kumar' } };
    if (id === 'learner-1') return { data: { full_name: 'Priya' } };
    return { data: null };
  }
  if (q.table === 'staff' && filterOf(q, 'profile_id') === 'learner-1') {
    return { data: { department_id: 'dept-pharm' } };
  }
  if (q.table === 'departments') return { data: { department_name: 'Pharmacy' } };
  return { data: null };
}

function fixedTask(extra: Record<string, any> = {}, fix: Record<string, any> = {}) {
  return {
    id: 'task-1',
    title: 'Tap leaking',
    status_key: 'done',
    owner_staff_id: 'acc-staff-1',
    metadata: {
      source: 'campus-walk',
      front_door: 'instasolver',
      reporter_id: 'learner-1',
      raised_by_profile_id: 'learner-1',
      location: 'Room 12',
      fix: {
        submitted_by_profile_id: 'fixer-1',
        attachment_id: 'att-9',
        approval: { state: 'approved', auto: true },
        ...fix,
      },
      ...extra,
    },
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/instasolver/thanks/route');
  const request = { json: async () => body } as unknown as Parameters<typeof POST>[0];
  const res = await POST(request);
  return { status: res.status, json: await res.json() };
}

function inserts() {
  return fake.queries.filter((q) => q.table === 'campus_walk_task_ratings' && q.op === 'insert');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeDb(respond);
  taskRow = fixedTask();
  insertError = null;
  deliveredCount = 1;
  createBellNotification.mockResolvedValue('notif-1');
  getUser.mockResolvedValue({ data: { user: { id: 'learner-1' } } });
});

// ── The route ────────────────────────────────────────────────────────────────

describe('POST /api/instasolver/thanks', () => {
  it('saves one rating for THIS fix photo and tells the fixer, by name', async () => {
    const { status, json } = await post({ taskId: 'task-1', stars: 5, thanks: 'Works now' });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.already).toBe(false);

    const [ins] = inserts();
    expect(ins.payload).toMatchObject({
      task_id: 'task-1',
      fix_round_key: 'att-9',
      reporter_profile_id: 'learner-1',
      fixer_profile_id: 'fixer-1',
      stars: 5,
      thanks_text: 'Works now',
      signed: false,
    });

    expect(createBellNotification).toHaveBeenCalledTimes(1);
    const opts = createBellNotification.mock.calls[0][1] as any;
    expect(opts.recipientIds).toEqual(['fixer-1']);
    // Created BY the fixer: the reporter can never surface as "From:".
    expect(opts.createdBy).toBe('fixer-1');
    expect(opts.title).toBe('Thank you, Kumar');
    // Keyed on the rating row, never on the reporter: the fixer can read the key.
    expect(opts.idempotencyKey).toBe('instasolver-thanks:rating-1');
    expect(json.fixer_told).toBe(true);
    expect(json.message).toBe('Thank you. The person who fixed it has been told.');
  });

  it('an unsigned thank-you leaks the reporter id nowhere the fixer can read', async () => {
    await post({ taskId: 'task-1', stars: 4 });
    const opts = createBellNotification.mock.calls[0][1] as any;
    expect(JSON.stringify(opts)).not.toContain('learner-1');
  });

  it('a bell that was not written (helper returns null) is NOT reported as told', async () => {
    createBellNotification.mockResolvedValue(null);
    const { status, json } = await post({ taskId: 'task-1', stars: 5 });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.fixer_told).toBe(false);
    expect(json.message).toBe('Thank you. Your stars are saved.');
    expect(inserts()).toHaveLength(1);
  });

  it('a bell with no recipient row (helper returned an id anyway) is NOT reported as told', async () => {
    deliveredCount = 0;
    const { json } = await post({ taskId: 'task-1', stars: 5 });
    expect(json.fixer_told).toBe(false);
    expect(json.message).toBe('Thank you. Your stars are saved.');
  });

  it('an unsigned thank-you says "Someone" even though the reporter has a name on record', async () => {
    await post({ taskId: 'task-1', stars: 4 });
    const opts = createBellNotification.mock.calls[0][1] as any;
    expect(opts.body).toContain('Kumar, Someone thanked you');
    expect(opts.body).not.toContain('Priya');
    expect(opts.body).not.toContain('Pharmacy');
    expect(JSON.stringify(opts.metadata)).not.toContain('learner-1');
  });

  it('a signed thank-you names the reporter and their department', async () => {
    await post({ taskId: 'task-1', stars: 5, signed: true, thanks: 'Thank you!' });
    const opts = createBellNotification.mock.calls[0][1] as any;
    expect(opts.body).toBe(
      'Kumar, Priya from Pharmacy thanked you for fixing “Tap leaking” in Room 12 and gave it 5 of 5 stars. They said: “Thank you!”'
    );
  });

  it('a second rating of the same fix is "already thanked" — no second bell', async () => {
    insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const { status, json } = await post({ taskId: 'task-1', stars: 3 });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.already).toBe(true);
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('a job reopened and fixed again is a NEW round — a different key', async () => {
    taskRow = fixedTask({}, { attachment_id: 'att-10' });
    await post({ taskId: 'task-1', stars: 2 });
    expect(inserts()[0].payload.fix_round_key).toBe('att-10');
  });

  it('refuses anybody who did not report it', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'someone-else' } } });
    const { status, json } = await post({ taskId: 'task-1', stars: 5 });
    expect(status).toBe(403);
    expect(json.success).toBe(false);
    expect(inserts()).toHaveLength(0);
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('refuses a job that is not fixed', async () => {
    taskRow = { ...fixedTask(), status_key: 'in_progress' };
    const { status } = await post({ taskId: 'task-1', stars: 5 });
    expect(status).toBe(409);
    expect(inserts()).toHaveLength(0);
  });

  it('refuses a done job whose fix photo was never accepted', async () => {
    taskRow = fixedTask({}, { approval: { state: 'awaiting_approval' } });
    const { status } = await post({ taskId: 'task-1', stars: 5 });
    expect(status).toBe(409);
  });

  it('refuses stars outside 1–5', async () => {
    for (const stars of [0, 6, 2.5, 'x', null]) {
      const { status } = await post({ taskId: 'task-1', stars });
      expect(status).toBe(400);
    }
    expect(inserts()).toHaveLength(0);
  });

  it('refuses thanking yourself for your own fix', async () => {
    taskRow = fixedTask({}, { submitted_by_profile_id: 'learner-1' });
    const { status } = await post({ taskId: 'task-1', stars: 5 });
    expect(status).toBe(409);
    expect(inserts()).toHaveLength(0);
  });

  it('keeps the rating when the bell fails, and says so', async () => {
    createBellNotification.mockRejectedValue(new Error('bell down'));
    const { status, json } = await post({ taskId: 'task-1', stars: 5 });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.fixer_told).toBe(false);
    expect(inserts()).toHaveLength(1);
  });
});

// ── The pure rules ───────────────────────────────────────────────────────────

describe('fix rounds and naming', () => {
  it('the round key follows the same fallback order as the "fixed" bell', () => {
    expect(fixRoundKeyOf({ fix: { attachment_id: 'a', storage_path: 'p', submitted_at: 't' } })).toBe('a');
    expect(fixRoundKeyOf({ fix: { storage_path: 'p', submitted_at: 't' } })).toBe('p');
    expect(fixRoundKeyOf({ fix: { submitted_at: 't' } })).toBe('t');
    expect(fixRoundKeyOf({})).toBe('legacy');
    expect(fixRoundKeyOf(null)).toBe('legacy');
  });

  it('"Someone" unless signed, and a signed rating with no name falls back too', () => {
    expect(thankerLabel({ signed: false, reporterName: 'Priya', reporterDepartment: 'Pharmacy' })).toBe(
      ANONYMOUS_THANKER
    );
    expect(thankerLabel({ signed: true, reporterName: 'Priya', reporterDepartment: 'Pharmacy' })).toBe(
      'Priya from Pharmacy'
    );
    expect(thankerLabel({ signed: true, reporterName: 'Priya' })).toBe('Priya');
    expect(thankerLabel({ signed: true, reporterName: '  ' })).toBe(ANONYMOUS_THANKER);
  });

  it('the bell still reads well when the fixer has no name on record', () => {
    const bell = buildThanksBell({ signed: false, taskTitle: 'Fan broken', stars: 1 });
    expect(bell.title).toBe('Thank you for the fix');
    expect(bell.body).toBe('Someone thanked you for fixing “Fan broken” and gave it 1 of 5 stars.');
  });

  it('stars and the thanks line are cleaned', () => {
    expect(parseStars('4')).toBe(4);
    expect(parseStars(4.5)).toBeNull();
    expect(cleanThanks('  two\nlines  ')).toBe('two lines');
    expect(cleanThanks('   ')).toBeNull();
    expect(cleanThanks('x'.repeat(500))).toHaveLength(200);
  });
});

// ── The fixes board: month vs last month, stars, and the CSV ────────────────

let seq = 0;
function closedRow(ownerStaffId: string, completedAt: string, extra: Record<string, any> = {}): WalkTaskRow {
  seq += 1;
  return {
    id: `t-${seq}`,
    title: `Job ${seq} reported by Priya Secretname`,
    status_key: 'done',
    is_blocked: false,
    due_date: null,
    completed_at: completedAt,
    created_at: '2026-08-01T09:00:00.000Z',
    owner_staff_id: ownerStaffId,
    metadata: {
      source: 'campus-walk',
      kind: 'symptom',
      reporter_id: 'profile-priya',
      raised_by_name: 'Priya Secretname',
      fix: { submitted_by_profile_id: 'profile-kumar', approval: { state: 'approved' } },
      ...extra,
    },
  };
}

const staffIndex: StaffDepartmentIndex = new Map([
  ['s1', { departmentId: 'd-pharm', departmentName: 'Pharmacy' }],
  ['s2', { departmentId: 'd-pharm', departmentName: 'Pharmacy' }],
  ['s3', { departmentId: 'd-eng', departmentName: '=Engineering, Civil' }],
  ['s4', { departmentId: 'd-eng', departmentName: '=Engineering, Civil' }],
]);

describe('the fixes board — month vs last month and stars', () => {
  it('buckets months on the India calendar, not UTC', () => {
    // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India.
    expect(istMonthKey('2026-09-30T20:00:00.000Z')).toBe('2026-10');
    expect(istMonthKey('2026-09-30T18:00:00.000Z')).toBe('2026-09');
    expect(previousMonthKey('2026-01')).toBe('2025-12');
    expect(previousMonthKey('2026-10')).toBe('2026-09');
  });

  it('counts this month and last month per department, and averages the stars', () => {
    const now = new Date('2026-10-15T06:00:00.000Z');
    const rows = [
      closedRow('s1', '2026-10-02T06:00:00.000Z'),
      closedRow('s2', '2026-10-03T06:00:00.000Z'),
      closedRow('s1', '2026-09-20T06:00:00.000Z'),
      closedRow('s1', '2026-08-20T06:00:00.000Z'),
      closedRow('s3', '2026-09-30T20:00:00.000Z'), // 1 Oct in India
      closedRow('s4', '2026-09-10T06:00:00.000Z'),
    ];
    const stars = new Map<string, number[]>([
      [rows[0].id, [5]],
      [rows[1].id, [4, 3]],
      [rows[4].id, [2]],
    ]);
    const board = buildFixBoard(rows, staffIndex, now, stars);
    const pharm = board.rows.find((r) => r.departmentName === 'Pharmacy')!;
    const eng = board.rows.find((r) => r.departmentName === '=Engineering, Civil')!;

    expect(pharm.fixedThisMonth).toBe(2);
    expect(pharm.fixedLastMonth).toBe(1);
    expect(pharm.verifiedClosures).toBe(4);
    expect(pharm.averageStars).toBe(4);
    expect(pharm.ratingCount).toBe(3);

    expect(eng.fixedThisMonth).toBe(1);
    expect(eng.fixedLastMonth).toBe(1);
    expect(eng.averageStars).toBe(2);

    expect(board.totals.fixedThisMonth).toBe(3);
    expect(board.totals.fixedLastMonth).toBe(2);
    expect(board.totals.averageStars).toBe(3.5);
    expect(board.totals.ratingCount).toBe(4);
  });

  it('a department with no stars reads null, never 0', () => {
    const board = buildFixBoard([closedRow('s1', '2026-10-02T06:00:00.000Z')], staffIndex, new Date('2026-10-15'));
    expect(board.rows[0].averageStars).toBeNull();
    expect(board.rows[0].ratingCount).toBe(0);
  });

  it('the CSV has department totals and no personal names, ids or job titles', () => {
    const rows = [
      closedRow('s1', '2026-10-02T06:00:00.000Z'),
      closedRow('s2', '2026-09-02T06:00:00.000Z'),
      closedRow('s3', '2026-10-02T06:00:00.000Z'),
      closedRow('s4', '2026-10-02T06:00:00.000Z'),
      // A one-person department: folded, never named.
      closedRow('s-solo', '2026-10-02T06:00:00.000Z'),
    ];
    const index: StaffDepartmentIndex = new Map(staffIndex);
    index.set('s-solo', { departmentId: 'd-solo', departmentName: 'Solo Department' });
    const csv = fixBoardToCsv(
      buildFixBoard(rows, index, new Date('2026-10-15T06:00:00.000Z'), new Map([[rows[0].id, [5]]]))
    );

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(FIX_BOARD_CSV_HEADER.join(','));
    expect(lines[lines.length - 1].startsWith('All departments,')).toBe(true);

    for (const secret of [
      'Priya',
      'Secretname',
      'Kumar',
      'profile-priya',
      'profile-kumar',
      's-solo',
      's1',
      'Job ',
      'Solo Department',
    ]) {
      expect(csv).not.toContain(secret);
    }
    // A formula-looking department name is neutralised and quoted.
    expect(csv).toContain(`"'=Engineering, Civil"`);
    expect(lines).toContain('Pharmacy,1,1,2,46.9,0,0,0,0,5,1');
  });
});

// ── The ratings table has no direct write surface ────────────────────────────
// Repair round, 1 Oct 2026: a direct PostgREST INSERT let a reporter choose any
// fix_round_key and stuff a department's stars average. The thanks route
// (service_role) must stay the only writer.

describe('campus_walk_task_ratings migration — writes only through the thanks route', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20270701090000_campus_walk_task_ratings.sql'),
    'utf8'
  )
    // Ignore comments so a sentence ABOUT an insert policy cannot trip the check.
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('grants signed-in users SELECT only', () => {
    const grants = [...sql.matchAll(/GRANT\s+([A-Z ,]+?)\s+ON\s+TABLE\s+public\.campus_walk_task_ratings\s+TO\s+authenticated/gi)];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(g[1].trim().toUpperCase()).toBe('SELECT');
  });

  it('revokes the Supabase default ALL from authenticated as well as anon', () => {
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.campus_walk_task_ratings\s+FROM\s+anon,\s*authenticated,\s*PUBLIC/i
    );
  });

  it('creates no INSERT, UPDATE, DELETE or ALL policy', () => {
    const policies = [...sql.matchAll(/CREATE\s+POLICY[\s\S]*?FOR\s+(\w+)/gi)].map((m) => m[1].toUpperCase());
    expect(policies).toEqual(['SELECT']);
  });
});
