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
import { addWorkingDays, workingDaysPastDue, thinReplyReason } from '@/lib/campus-walk/cctv-categories';

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
    roles: { hod: ['hod-a', 'hod-b', 'hod-c'], cao: ['cao-1'], coe: ['coe-x', 'coe-1'], hr_head: ['hr-1'] },
    staff: {
      'hod-a': { institution_id: 'inst-1', department_id: 'dept-pharm' },
      'hod-b': { institution_id: 'inst-1', department_id: 'dept-ip' },
      // An Assistant Professor who carries the 'hod' role inside a department
      // that has a recorded head (the first live report, 10 Oct 2026).
      'hod-c': { institution_id: 'inst-1', department_id: 'dept-pharm' },
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
      'res-lab': { id: 'res-lab', name: 'IP Room', room_number: 'P12', department_id: 'dept-ip', institution_id: 'inst-1' }
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
  it('the recorded HOD of the room’s department — and only them', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-pharm' }), 'learner_conduct');
    expect(r).toMatchObject({ accountableProfileId: 'hod-a', ownerSource: 'hod', consultedProfileIds: [] });
    expect(r.hodProfileIds).toEqual(['hod-a']);
  });

  it('an HOD-role holder in that department when no head is recorded', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-ip' }), 'power_left_on');
    expect(r).toMatchObject({ accountableProfileId: 'hod-b', ownerSource: 'hod' });
  });

  it('a shared place with no department always goes to the CAO', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: null }), 'learner_conduct');
    expect(r).toMatchObject({ accountableProfileId: 'cao-1', ownerSource: 'cao_shared_place' });
  });

  it('no HOD on record -> the CAO (Director, 9 Oct 2026)', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-empty' }), 'staff_conduct');
    expect(r).toMatchObject({ accountableProfileId: 'cao-1', ownerSource: 'cao_no_hod', hodProfileIds: [] });
  });

  it('a blocked or broken camera -> the CAO, even in a room that has an HOD', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-pharm' }), 'camera_fault');
    expect(r).toMatchObject({ accountableProfileId: 'cao-1', ownerSource: 'cao_camera_fault', hodProfileIds: [] });
    expect(cctvTitle('camera_fault', 'Main gate (right side)', '2026-10-10T08:07:00.000Z')).toBe(
      'CCTV: Camera blocked or not working — Main gate (right side), 10 Oct, 1:37 pm'
    );
  });

  it('the video shows the HOD -> the principal, and the HOD is not even copied', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-pharm' }), 'staff_conduct', {
      involvesHod: true
    });
    expect(r).toMatchObject({ accountableProfileId: 'principal-1', ownerSource: 'principal_hod_involved' });
    expect(r.consultedProfileIds).not.toContain('hod-a');
  });

  it('exam copying -> the hall’s own college CoE first, the room’s HOD copied', async () => {
    const r = await routeCctvReport(dbFor(world()), room({ departmentId: 'dept-pharm' }), 'exam_copying');
    expect(r.accountableProfileId).toBe('coe-1');
    expect(r.ownerSource).toBe('controller_of_examinations');
    expect(r.consultedProfileIds).toContain('hod-a');
  });
});

describe('how fast it climbs', () => {
  it('HOD has one WORKING day; exam copying is the same day', () => {
    const thu = Date.parse('2026-10-08T06:00:00Z');
    const sat = Date.parse('2026-10-10T06:00:00Z');
    expect(cctvDueInDays('learner_conduct', thu)).toBe(1);
    expect(cctvDueInDays('power_left_on', sat)).toBe(2); // Saturday -> due Monday
    expect(cctvDueInDays('exam_copying', sat)).toBe(0);
  });

  it('Sundays do not count toward being late', () => {
    expect(workingDaysPastDue('2026-10-10', '2026-10-11')).toBe(0); // Sat due, Sun today
    expect(workingDaysPastDue('2026-10-10', '2026-10-12')).toBe(1); // Mon
    expect(workingDaysPastDue('2026-10-12', '2026-10-12')).toBe(0);
    expect(addWorkingDays('2026-10-10', 1)).toBe('2026-10-12');
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
    expect(t.dueInDays).toBeGreaterThanOrEqual(1);
    expect(t.extraMetadata.front_door).toBe('cctv');
    expect(t.extraMetadata.cctv).not.toHaveProperty('names');
    expect(t.extraMetadata.cctv).not.toHaveProperty('seat');
    expect(JSON.stringify(t)).not.toContain('Somebody');
    expect(t.title).toBe('CCTV: Learner conduct — IP Room (P12), 9 Oct, 2:40 pm');
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

describe('a reply must name an action', () => {
  it('refuses "noted" and one-word replies, accepts a real action', () => {
    expect(thinReplyReason('Noted.')).toMatch(/does not say what was done/);
    expect(thinReplyReason('will check')).toMatch(/does not say what was done/);
    expect(thinReplyReason('Spoke to them')).toMatch(/full sentence/);
    expect(thinReplyReason('Spoke to the class; phones are collected at the start of the hour.')).toBeNull();
  });
});

describe('team-member names', () => {
  it('a name is stored for team-member conduct, and the HOD sees it', async () => {
    await fileCctvReport(dbFor(world()), {
      category: 'staff_conduct',
      observedAt: '2026-10-09T09:10:00.000Z',
      resourceId: 'res-lab',
      names: 'R. Kumar',
      raisedByProfileId: 'operator'
    });
    expect(createdTasks[0].extraMetadata.cctv).toMatchObject({ names: 'R. Kumar', person_key: 'r-kumar' });
    expect(bells[0].recipientIds).toEqual(['hod-b']);
    expect(bells[0].body).toContain('R. Kumar');
  });

  it('the same person 3 times in 30 days -> HR, with the name; the principal never gets it', async () => {
    const w = world();
    w.cctvTasks = [1, 2, 3].map((i) => ({
      id: `t${i}`,
      created_at: `2026-10-0${i}`,
      metadata: { cctv: { room_key: `resource:r${i}`, person_key: 'r-kumar', room: `Room ${i}`, observed_at: `2026-10-0${i}T05:00:00Z` } }
    }));
    const res = await fileCctvReport(dbFor(w), {
      category: 'staff_conduct',
      observedAt: '2026-10-09T09:10:00.000Z',
      resourceId: 'res-lab',
      names: 'r kumar',
      raisedByProfileId: 'operator'
    });
    expect(res.ok && res.hrToldOfRepeat).toBe(true);
    const hr = bells.find((b) => b.category === 'campus-walk:cctv-staff-repeat');
    expect(hr.recipientIds).toEqual(['hr-1']);
    expect(hr.body).toContain('r kumar');
    expect(bells.filter((b) => b.recipientIds.includes('principal-1'))).toEqual([]);
  });

  it('a learner-conduct report never stores a name', async () => {
    await fileCctvReport(dbFor(world()), {
      category: 'learner_conduct',
      observedAt: '2026-10-09T09:10:00.000Z',
      resourceId: 'res-lab',
      names: 'Somebody',
      raisedByProfileId: 'operator'
    });
    expect(createdTasks[0].extraMetadata.cctv).not.toHaveProperty('names');
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
      'CCTV: Team member conduct — Main office, 9 Oct, 10:30 am'
    );
  });
});

describe('the Director’s daily summary', () => {
  it('a morning with only CCTV repeat rooms still sends, naming rooms and never people', async () => {
    const { buildDirectorDigest } = await import('@/lib/campus-walk/director-digest');
    const copy = buildDirectorDigest([], {
      earlierStillOpen: 0,
      cctvRepeatRooms: ['CP IP room (Pharmacy Practice): 3 CCTV reports in 30 days, latest 9 Oct, 2:40 pm']
    });
    expect(copy.title).toBe('Morning summary: 1 CCTV repeat room with a new report');
    expect(copy.body).toContain('CP IP room (Pharmacy Practice)');
  });
});
