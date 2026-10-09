// __tests__/campus-walk/cctv.test.ts
// The CCTV front door (Director decisions, 9 Oct 2026): who a report goes to,
// how fast it climbs, what is stored, and which rooms are repeats.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb, type RecordedQuery } from './fake-db';

const bells: any[] = [];
const createdTasks: any[] = [];
let principalsOf: Record<string, string[]> = {};

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: vi.fn(async (_db: any, opts: any) => {
    bells.push(opts);
    return `bell-${bells.length}`;
  })
}));
vi.mock('@/lib/campus-walk/spot-check', () => ({
  resolveCollegeHeadIds: vi.fn(async (_db: any, inst: string | null) => (inst ? principalsOf[inst] ?? [] : []))
}));
vi.mock('@/lib/services/director-desk/handover-chase-service', () => ({
  resolveDirectors: vi.fn(async () => ({ ids: ['11111111-1111-4111-8111-111111111111'] })),
  validateTargeting: (ids: string[]) => ({ ok: ids.length > 0, userIds: ids, reason: 'empty' })
}));
vi.mock('@/lib/services/campus-walk/campus-walk-service', () => ({
  createWalkTask: vi.fn(async (_db: any, input: any) => {
    createdTasks.push(input);
    return { taskId: `task-${createdTasks.length}`, attachmentId: null, dueDate: '2026-10-10', accountableProfileId: input.accountableProfileId };
  })
}));

import {
  fileCctvReport,
  groupRepeatRooms,
  roomKeyOf,
  routeCctvReport,
  cctvTitle,
  cctvDueInDays,
  type CctvRoom
} from '@/lib/campus-walk/cctv';
import { ladderFor, rungsDue, isCatchUpPrincipalStep } from '@/lib/campus-walk/chase-up';

// ── A small campus ──────────────────────────────────────────────────────────
// dept-pharm: recorded head hod-a. dept-ip: no recorded head, HOD-role holder hod-b
// sits in it. dept-empty: nobody. College inst-1.
interface World {
  roles: Record<string, string[]>;
  staff: Record<string, { institution_id: string | null; department_id: string | null }>;
  departments: Record<string, { head_of_department_id: string | null; institution_id: string; department_name: string }>;
  resources: Record<string, any>;
  cctvTasks: any[];
}

function world(): World {
  return {
    roles: { hod: ['hod-a', 'hod-b'], cao: ['cao-1'], coe: ['coe-x', 'coe-1'] },
    staff: {
      'hod-a': { institution_id: 'inst-1', department_id: 'dept-pharm' },
      'hod-b': { institution_id: 'inst-1', department_id: 'dept-ip' },
      'cao-1': { institution_id: 'inst-0', department_id: null },
      'coe-1': { institution_id: 'inst-1', department_id: null },
      'coe-x': { institution_id: 'inst-2', department_id: null }
    },
    departments: {
      'dept-pharm': { head_of_department_id: 'hod-a', institution_id: 'inst-1', department_name: 'Pharmacy Practice' },
      'dept-ip': { head_of_department_id: null, institution_id: 'inst-1', department_name: 'Industrial Pharmacy' },
      'dept-empty': { head_of_department_id: null, institution_id: 'inst-1', department_name: 'Pharmacognosy' }
    },
    resources: {
      'res-hall': { id: 'res-hall', name: 'Exam Hall - Pharmacy', room_number: null, department_id: null, institution_id: 'inst-1' },
      'res-lab': { id: 'res-lab', name: 'IP Lab', room_number: 'P12', department_id: 'dept-ip', institution_id: 'inst-1' }
    },
    cctvTasks: []
  };
}

function dbFor(w: World) {
  const filter = (q: RecordedQuery, col: string) => q.filters.find(([c]) => c === col)?.[1];
  return makeFakeDb((q) => {
    switch (q.table) {
      case 'custom_roles': {
        const key = filter(q, 'role_key') as string;
        return { data: w.roles[key] ? [{ id: `role-${key}` }] : [] };
      }
      case 'user_roles': {
        const roleIds = (filter(q, 'in:role_id') as string[]) ?? [];
        return { data: roleIds.flatMap((r) => (w.roles[r.replace('role-', '')] ?? []).map((user_id) => ({ user_id }))) };
      }
      case 'profiles': {
        if (filter(q, 'role')) return { data: [] };
        const ids = (filter(q, 'in:id') as string[]) ?? [];
        return { data: [...ids].sort().map((id) => ({ id })) };
      }
      case 'staff': {
        const ids = (filter(q, 'in:profile_id') as string[]) ?? [];
        return {
          data: ids.filter((id) => w.staff[id]).map((id) => ({ profile_id: id, is_active: true, ...w.staff[id] }))
        };
      }
      case 'departments': {
        const d = w.departments[filter(q, 'id') as string];
        return { data: d ? { ...d, display_name: null } : null };
      }
      case 'resources':
        return { data: w.resources[filter(q, 'id') as string] ?? null };
      case 'project_tasks':
        return { data: w.cctvTasks };
      default:
        return { data: null };
    }
  }).db as any;
}

const room = (o: Partial<CctvRoom>): CctvRoom => ({
  resourceId: null,
  label: 'Room',
  departmentId: null,
  departmentName: null,
  institutionId: 'inst-1',
  ...o
});

beforeEach(() => {
  bells.length = 0;
  createdTasks.length = 0;
  principalsOf = { 'inst-1': ['principal-1'] };
});

describe('who a CCTV report goes to', () => {
  it('the recorded HOD of the room’s department', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-pharm' }), 'learner_conduct');
    expect(r).toMatchObject({ accountableProfileId: 'hod-a', ownerSource: 'hod' });
  });

  it('an HOD-role holder in that department when no head is recorded', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-ip' }), 'power_left_on');
    expect(r).toMatchObject({ accountableProfileId: 'hod-b', ownerSource: 'hod' });
  });

  it('a shared place with no department always goes to the CAO', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: null }), 'learner_conduct');
    expect(r).toMatchObject({ accountableProfileId: 'cao-1', ownerSource: 'cao_shared_place' });
  });

  it('no HOD on record -> the college principal, marked as such', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-empty' }), 'staff_conduct');
    expect(r).toMatchObject({ accountableProfileId: 'principal-1', ownerSource: 'principal_no_hod', hodProfileIds: [] });
  });

  it('exam copying -> the hall’s own college CoE first, the room’s HOD copied', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-pharm' }), 'exam_copying');
    expect(r.accountableProfileId).toBe('coe-1');
    expect(r.ownerSource).toBe('controller_of_examinations');
    expect(r.consultedProfileIds).toContain('hod-a');
  });
});

describe('how fast it climbs', () => {
  it('HOD has one day; exam copying is the same day', () => {
    expect(cctvDueInDays('learner_conduct')).toBe(1);
    expect(cctvDueInDays('power_left_on')).toBe(1);
    expect(cctvDueInDays('exam_copying')).toBe(0);
  });

  it('no reply goes STRAIGHT to the principal at 1 day late — no boss step', () => {
    const cctv = { front_door: 'cctv' };
    expect(rungsDue(0, {}, cctv)).toEqual([]);
    expect(rungsDue(1, {}, cctv)).toEqual(['escalate_principal']);
    expect(rungsDue(7, { escalate_principal: 'x' }, cctv)).toEqual(['reached_director']);
    expect(ladderFor(cctv).some((r) => r.key === 'escalate_boss')).toBe(false);
  });

  it('every other job keeps the standard ladder', () => {
    expect(rungsDue(1, {}, { front_door: 'instasolver' })).toEqual(['escalate_boss']);
    expect(rungsDue(1, {})).toEqual(['escalate_boss']);
    expect(isCatchUpPrincipalStep(2, { front_door: 'cctv' })).toBe(true);
    expect(isCatchUpPrincipalStep(2)).toBe(false);
  });
});

describe('what is stored', () => {
  it('a conduct report keeps room and time only — seat and names are not stored', async () => {
    const res = await fileCctvReport(dbFor(world()), {
      category: 'learner_conduct',
      observedAt: '2026-10-09T09:10:00.000Z',
      resourceId: 'res-lab',
      seat: 'B12',
      names: 'Somebody',
      raisedByProfileId: 'operator'
    });
    expect(res.ok).toBe(true);
    const t = createdTasks[0];
    expect(t.accountableProfileId).toBe('hod-b');
    expect(t.dueInDays).toBe(1);
    expect(t.extraMetadata.front_door).toBe('cctv');
    expect(t.extraMetadata.cctv).not.toHaveProperty('names');
    expect(t.extraMetadata.cctv).not.toHaveProperty('seat');
    expect(JSON.stringify(t)).not.toContain('Somebody');
    expect(t.title).toBe('CCTV: Learner conduct — IP Lab (P12), 9 Oct, 2:40 pm');
    // The owner gets the reply link.
    expect(bells[0]).toMatchObject({ recipientIds: ['hod-b'], url: '/campus-walk/fix?task=task-1' });
  });

  it('exam copying keeps hall, time, seat and names, due today', async () => {
    await fileCctvReport(dbFor(world()), {
      category: 'exam_copying',
      observedAt: '2026-10-09T05:00:00.000Z',
      resourceId: 'res-hall',
      seat: 'B12',
      names: 'A. Learner',
      raisedByProfileId: 'operator'
    });
    const t = createdTasks[0];
    expect(t.accountableProfileId).toBe('coe-1');
    expect(t.dueInDays).toBe(0);
    expect(t.extraMetadata.cctv).toMatchObject({ seat: 'B12', names: 'A. Learner' });
    expect(t.description).toContain('Seat: B12');
  });
});

describe('repeat rooms', () => {
  it('one key per room: the picked resource, else department + typed name', () => {
    expect(roomKeyOf({ resourceId: 'r1', departmentId: 'd', label: 'x' })).toBe('resource:r1');
    expect(roomKeyOf({ resourceId: null, departmentId: 'd', label: 'CP  IP-room ' })).toBe('text:d:cp ip room');
  });

  it('3 reports in the window make a repeat room; 2 do not', () => {
    const row = (key: string, at: string) => ({ id: at, created_at: at, metadata: { cctv: { room_key: key, room: key } } });
    const rooms = groupRepeatRooms([
      row('a', '2026-10-01'),
      row('a', '2026-10-03'),
      row('a', '2026-10-05'),
      row('b', '2026-10-02'),
      row('b', '2026-10-04')
    ]);
    expect(rooms.map((r) => [r.roomKey, r.count, r.lastAt])).toEqual([['a', 3, '2026-10-05']]);
  });

  it('the third report in a room tells its principal', async () => {
    const w = world();
    const key = 'resource:res-lab';
    w.cctvTasks = [1, 2, 3].map((i) => ({ id: `t${i}`, created_at: `2026-10-0${i}`, metadata: { cctv: { room_key: key } } }));
    const res = await fileCctvReport(dbFor(w), {
      category: 'power_left_on',
      observedAt: '2026-10-09T09:10:00.000Z',
      resourceId: 'res-lab',
      raisedByProfileId: 'operator'
    });
    expect(res.ok && res.repeatCount).toBe(3);
    const toPrincipal = bells.find((b) => b.category === 'campus-walk:cctv-repeat-room');
    expect(toPrincipal?.recipientIds).toEqual(['principal-1']);
  });

  it('the title never carries a name', () => {
    expect(cctvTitle('staff_conduct', 'Main office', '2026-10-09T05:00:00.000Z')).toBe(
      'CCTV: Staff conduct — Main office, 9 Oct, 10:30 am'
    );
  });
});
