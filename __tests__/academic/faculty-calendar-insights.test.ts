/**
 * Senior Learner calendar — Availability, Workload and Conflicts tabs.
 *
 * Each describe block maps to one of the Director's decisions (2026-09-11):
 *   1. Availability: busy = a class, a meeting, an event duty, or APPROVED leave
 *      covering that day and period.
 *   2. Workload: weekly class hours vs the institution's OWN expected hours,
 *      green / amber / red, from platform_policies (no hard-coded norm, no
 *      fallback number; a college without its own setting gets plain hours).
 *   3. Conflicts: class-with-class and class-with-meeting/event clashes.
 * Plus: nothing outside the viewer's institution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, { data: any[]; error: any }>,
  rpc: {} as Record<string, (args: any) => { data: any; error: any }>,
  fromCalls: [] as string[],
  filterCalls: [] as Array<[string, string, any[]]>,
  timetableSlots: [] as any[],
  peopleConflicts: [] as any[]
}));

vi.mock('@/lib/supabase/client', () => {
  const chain = (table: string, result: { data: any; error: any }) => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'is', 'lte', 'gte', 'order', 'limit']) {
      c[m] = vi.fn((...args: any[]) => {
        h.filterCalls.push([table, m, args]);
        return c;
      });
    }
    c.range = vi.fn(() => Promise.resolve(result));
    c.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return c;
  };
  return {
    createClientSupabaseClient: () => ({
      from: (table: string) => {
        h.fromCalls.push(table);
        return chain(table, h.tables[table] ?? { data: [], error: null });
      },
      rpc: (name: string, args: any) =>
        Promise.resolve(h.rpc[name] ? h.rpc[name](args) : { data: null, error: null })
    })
  };
});

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

vi.mock('@/lib/services/academic/faculty-timetable-service', () => ({
  FacultyTimetableService: {
    getAllFacultyTimetableSlots: vi.fn(async () => ({
      slots: h.timetableSlots,
      total_count: h.timetableSlots.length
    }))
  }
}));

vi.mock('@/lib/services/academic/cycle-calculation-service', () => ({
  CycleCalculationService: { getCycleMap: vi.fn(async () => ({})) }
}));

vi.mock('@/lib/services/availability/person-availability', () => ({
  PersonAvailabilityService: {
    getPeopleConflicts: vi.fn(async (ids: string[]) =>
      h.peopleConflicts.filter((r) => ids.includes(r.profile_id))
    )
  }
}));

import {
  addDays,
  buildWorkloadRows,
  classifyWorkload,
  diaryRowsToEntries,
  epochMsToIstClock,
  expandClassOccurrences,
  findClashes,
  isApprovedLeave,
  isInstitutionInScope,
  istToEpochMs,
  keepOnlyInstitution,
  leaveCoversSlot,
  leaveScopeCoversInstitution,
  parsePolicyNumber,
  resolveAvailability,
  resolveInstitutionNorms,
  slotOccursOn,
  weekContaining,
  weeklyClassHours,
  type LeaveRecord,
  type SeniorLearnerRef,
  type TimedEntry,
  type TimetableSlotInput
} from '@/lib/academic/faculty-calendar/insights-rules';
import {
  FacultyCalendarInsightsService,
  InsightsAccessError,
  WORKLOAD_POLICY_KEYS,
  facultySlotToInput
} from '@/lib/services/academic/faculty-calendar-insights-service';

// 2026-09-14 is a Monday.
const MON = '2026-09-14';
const INST = 'inst-mine';
const OTHER_INST = 'inst-other';

const person = (staffId: string, profileId: string | null = `p-${staffId}`): SeniorLearnerRef => ({
  staffId,
  name: `Senior Learner ${staffId}`,
  departmentName: 'CSE',
  profileId,
  institutionId: INST
});

const entry = (
  personId: string,
  kind: TimedEntry['kind'],
  date: string,
  start: string,
  end: string,
  key = `${kind}-${date}-${start}`
): TimedEntry => ({
  personId,
  kind,
  label: `${kind} ${start}`,
  key,
  startMs: istToEpochMs(date, start)!,
  endMs: istToEpochMs(date, end)!
});

const leave = (over: Partial<LeaveRecord> = {}): LeaveRecord => ({
  id: 'leave-1',
  employeeId: 's1',
  startDate: MON,
  endDate: MON,
  durationType: 'full',
  startTime: null,
  endTime: null,
  status: 'approved',
  supersededBy: null,
  ...over
});

const availability = (over: Partial<Parameters<typeof resolveAvailability>[0]> = {}) =>
  resolveAvailability({
    people: [person('s1')],
    date: MON,
    windowStart: '10:00:00',
    windowEnd: '10:50:00',
    classEntries: [],
    diaryEntries: [],
    leaves: [],
    ...over
  });

// ---------------------------------------------------------------------------
describe('time model (India clock, fixed +05:30)', () => {
  it('turns an India date and time into the right instant, independent of machine time zone', () => {
    expect(new Date(istToEpochMs(MON, '09:15:00')!).toISOString()).toBe('2026-09-14T03:45:00.000Z');
    expect(epochMsToIstClock(istToEpochMs(MON, '14:05')!)).toBe('14:05');
  });

  it('finds the Monday–Sunday week, including when the chosen day is a Sunday', () => {
    expect(weekContaining('2026-09-16')).toEqual({ start: MON, end: '2026-09-20' });
    expect(weekContaining('2026-09-20')).toEqual({ start: MON, end: '2026-09-20' });
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });
});

// ---------------------------------------------------------------------------
describe('Rule 1: Availability', () => {
  it('is free with no class, meeting, event duty or leave', () => {
    const [row] = availability();
    expect(row.busy).toBe(false);
    expect(row.reasons).toHaveLength(0);
  });

  it('is busy because of a class from the timetables', () => {
    const [row] = availability({ classEntries: [entry('s1', 'class', MON, '10:00', '10:50')] });
    expect(row.busy).toBe(true);
    expect(row.reasons.map((r) => r.kind)).toEqual(['class']);
  });

  it('is busy because of a class that only person-availability reports', () => {
    const [row] = availability({ diaryEntries: [entry('s1', 'class', MON, '10:00', '10:50', 'diary')] });
    expect(row.busy).toBe(true);
    expect(row.reasons.map((r) => r.kind)).toEqual(['class']);
  });

  it('counts a class seen by both sources once', () => {
    const [row] = availability({
      classEntries: [entry('s1', 'class', MON, '10:00', '10:50', 'tt')],
      diaryEntries: [entry('s1', 'class', MON, '10:00', '10:50', 'diary')]
    });
    expect(row.reasons).toHaveLength(1);
  });

  it('is busy because of a meeting', () => {
    const [row] = availability({ diaryEntries: [entry('s1', 'meeting', MON, '10:30', '11:30')] });
    expect(row.busy).toBe(true);
    expect(row.reasons.map((r) => r.kind)).toEqual(['meeting']);
  });

  it('is busy because of an event duty', () => {
    const [row] = availability({ diaryEntries: [entry('s1', 'event', MON, '09:00', '17:00')] });
    expect(row.busy).toBe(true);
    expect(row.reasons.map((r) => r.kind)).toEqual(['event']);
  });

  it('is busy because of approved full-day leave', () => {
    const [row] = availability({ leaves: [leave()] });
    expect(row.busy).toBe(true);
    expect(row.reasons[0]).toMatchObject({ kind: 'leave', timeKnown: true });
  });

  it('does not count leave that is pending, rejected, cancelled or superseded', () => {
    for (const status of ['pending', 'rejected', 'cancelled', 'withdrawn', 'escalated']) {
      expect(isApprovedLeave(leave({ status }))).toBe(false);
      expect(availability({ leaves: [leave({ status })] })[0].busy).toBe(false);
    }
    const superseded = leave({ supersededBy: 'leave-2' });
    expect(availability({ leaves: [superseded] })[0].busy).toBe(false);
  });

  it('does not count approved leave on another day', () => {
    const [row] = availability({ leaves: [leave({ startDate: '2026-09-15', endDate: '2026-09-16' })] });
    expect(row.busy).toBe(false);
  });

  it('matches half-day leave to the Senior Learner’s shift halves', () => {
    const shift = {
      firstHalfStart: '09:00',
      firstHalfEnd: '13:00',
      secondHalfStart: '13:30',
      secondHalfEnd: '16:30'
    };
    const first = leave({ durationType: 'first_half' });
    const second = leave({ durationType: 'second_half' });
    expect(leaveCoversSlot(first, MON, '10:00', '10:50', shift)).toEqual({ covers: true, timeKnown: true });
    expect(leaveCoversSlot(second, MON, '10:00', '10:50', shift)).toEqual({ covers: false, timeKnown: true });
    expect(leaveCoversSlot(second, MON, '14:00', '14:50', shift)).toEqual({ covers: true, timeKnown: true });
  });

  it('counts half-day leave for the whole day when the shift times are unknown', () => {
    expect(leaveCoversSlot(leave({ durationType: 'second_half' }), MON, '10:00', '10:50', null)).toEqual({
      covers: true,
      timeKnown: false
    });
  });

  it('matches short time off by its own hours', () => {
    const shortOff = leave({ durationType: 'hourly', startTime: '11:00:00', endTime: '12:00:00' });
    expect(leaveCoversSlot(shortOff, MON, '10:00', '10:50').covers).toBe(false);
    expect(leaveCoversSlot(shortOff, MON, '11:30', '12:20').covers).toBe(true);
  });

  it('ignores bookings that only touch the period edge', () => {
    const [row] = availability({ diaryEntries: [entry('s1', 'meeting', MON, '10:50', '11:30')] });
    expect(row.busy).toBe(false);
  });

  it('lists free Senior Learners first and flags those whose meetings could not be checked', () => {
    const rows = resolveAvailability({
      people: [person('s1'), person('s2', null)],
      date: MON,
      windowStart: '10:00',
      windowEnd: '10:50',
      classEntries: [entry('s1', 'class', MON, '10:00', '10:50')],
      diaryEntries: [],
      leaves: []
    });
    expect(rows.map((r) => r.person.staffId)).toEqual(['s2', 's1']);
    expect(rows[0].diaryChecked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('timetable slots placed on real dates', () => {
  const slot = (over: Partial<TimetableSlotInput> = {}): TimetableSlotInput => ({
    timetableId: 'tt1',
    timetableName: 'II CSE A',
    timetableFormat: 'regular',
    timetableStart: '2026-06-01',
    timetableEnd: '2026-11-30',
    slotId: 'slot1',
    dayOfWeek: 'MONDAY',
    slotDate: null,
    startTime: '10:00:00',
    endTime: '10:50:00',
    isBreak: false,
    label: 'CS301',
    staffIds: ['s1'],
    ...over
  });

  it('regular weekly slots fall on their weekday only', () => {
    expect(slotOccursOn(slot(), MON)).toBe(true);
    expect(slotOccursOn(slot(), '2026-09-15')).toBe(false);
  });

  it('stops at the timetable’s end date', () => {
    expect(slotOccursOn(slot({ timetableEnd: '2026-09-13' }), MON)).toBe(false);
  });

  it('batch slots use their date or posting-block range', () => {
    expect(slotOccursOn(slot({ timetableFormat: 'batch', dayOfWeek: null, slotDate: MON }), MON)).toBe(true);
    const block = slot({ timetableFormat: 'batch', dayOfWeek: null, slotDate: 'RANGE:2026-09-10:2026-09-20' });
    expect(slotOccursOn(block, MON)).toBe(true);
    expect(slotOccursOn(block, '2026-09-21')).toBe(false);
  });

  it('cycle slots use the cycle active on that date', () => {
    const cyc = slot({ timetableFormat: 'cycle', dayOfWeek: 'cycle-3' });
    expect(slotOccursOn(cyc, MON, { tt1: { [MON]: 3 } })).toBe(true);
    expect(slotOccursOn(cyc, MON, { tt1: { [MON]: 2 } })).toBe(false);
    expect(slotOccursOn(cyc, MON, { tt1: { [MON]: null } })).toBe(false);
  });

  it('expands a week into one class per Senior Learner per date, skipping breaks', () => {
    const entries = expandClassOccurrences(
      [slot({ staffIds: ['s1', 's2', 's1'] }), slot({ slotId: 'b', isBreak: true })],
      MON,
      '2026-09-20'
    );
    expect(entries.map((e) => e.personId).sort()).toEqual(['s1', 's2']);
  });

  it('counts a Senior Learner who teaches only a combined class’s sub-slot', () => {
    const input = facultySlotToInput({
      id: 'slot9',
      day_of_week: 'MONDAY',
      period_id: 'p1',
      period_name: 'P1',
      start_time: '09:00:00',
      end_time: '09:50:00',
      staff_members: [{ id: 's1', first_name: 'A', last_name: 'B' }],
      timetable: {
        id: 'tt1',
        timetable_name: 'II CSE A',
        timetable_format: 'regular',
        institution_name: 'X',
        department_name: 'CSE'
      },
      is_break_slot: false,
      is_combined: true,
      sub_slots: [
        {
          sub_slot_order: 1,
          course: { id: 'c2', course_code: 'CS302', course_name: 'OS' },
          is_break_slot: false,
          staff_members: [{ id: 's7', first_name: 'C', last_name: 'D' }]
        }
      ]
    });
    expect(input.staffIds).toEqual(['s1', 's7']);
  });
});

// ---------------------------------------------------------------------------
describe('Rule 2: Workload', () => {
  const norm = { expectedHours: 16, amberPct: 100, redPct: 120 };

  it('is green up to and including the amber threshold', () => {
    expect(classifyWorkload(0, norm).band).toBe('green');
    expect(classifyWorkload(16, norm)).toEqual({ band: 'green', percentOfExpected: 100 });
  });

  it('is amber just above amber, up to and including the red threshold', () => {
    expect(classifyWorkload(16.25, norm).band).toBe('amber');
    expect(classifyWorkload(19.2, norm).band).toBe('amber'); // exactly 120%
  });

  it('is red above the red threshold', () => {
    expect(classifyWorkload(19.25, norm).band).toBe('red');
  });

  it('shows no colour when expected hours or thresholds are missing', () => {
    expect(classifyWorkload(30, { ...norm, expectedHours: null }).band).toBe('not-set');
    expect(classifyWorkload(30, { ...norm, expectedHours: 0 }).band).toBe('not-set');
    expect(classifyWorkload(30, { ...norm, redPct: null }).band).toBe('not-set');
    expect(classifyWorkload(30, { expectedHours: 16, amberPct: 130, redPct: 120 }).band).toBe('not-set');
  });

  it('reads policy values stored as numbers or numeric text', () => {
    expect(parsePolicyNumber(16)).toBe(16);
    expect(parsePolicyNumber('18')).toBe(18);
    expect(parsePolicyNumber(null)).toBeNull();
    expect(parsePolicyNumber({ hours: 16 })).toBeNull();
  });

  it('adds up class hours, counting the same class once and ignoring meetings', () => {
    const e = entry('s1', 'class', MON, '09:00', '10:30', 'same');
    const hours = weeklyClassHours([e, { ...e }, entry('s1', 'meeting', MON, '11:00', '12:00')]);
    expect(hours.get('s1')).toBe(1.5);
  });

  it('puts the most loaded Senior Learner first', () => {
    const rows = buildWorkloadRows(
      [person('s1'), person('s2')],
      [entry('s2', 'class', MON, '09:00', '13:00'), entry('s1', 'class', MON, '09:00', '10:00')],
      { [INST]: norm }
    );
    expect(rows.map((r) => [r.person.staffId, r.hours])).toEqual([
      ['s2', 4],
      ['s1', 1]
    ]);
  });

  it("colours each Senior Learner by their own institution's numbers", () => {
    const rows = buildWorkloadRows(
      [person('s1'), { ...person('s2'), institutionId: OTHER_INST }, { ...person('s3'), institutionId: null }],
      [
        entry('s1', 'class', MON, '09:00', '13:00'),
        entry('s2', 'class', MON, '09:00', '13:00'),
        entry('s3', 'class', MON, '09:00', '13:00')
      ],
      { [INST]: norm, [OTHER_INST]: { expectedHours: 2, amberPct: 100, redPct: 120 } }
    );
    const byId = Object.fromEntries(rows.map((r) => [r.person.staffId, r]));
    expect(byId.s1.band).toBe('green');
    expect(byId.s2.band).toBe('red');
    expect(byId.s2.norm.expectedHours).toBe(2);
    // No institution, or one with no numbers of its own: plain hours.
    expect(byId.s3).toMatchObject({ band: 'not-set', percentOfExpected: null, hours: 4 });
  });

  describe('each institution has its own expected hours (Director, 2026-09-12)', () => {
    const KEYS = { expectedHours: 'k.hours', amberPct: 'k.amber', redPct: 'k.red' };
    const row = (policy_key: string, scope_type: string, scope_id: string | null, value: unknown, is_active = true) => ({
      policy_key,
      scope_type,
      scope_id,
      value,
      is_active
    });
    const globalRows = [row('k.hours', 'global', null, 16), row('k.amber', 'global', null, 100), row('k.red', 'global', null, 120)];

    it("takes the institution's own row for the hours and never the platform-wide number", () => {
      const norms = resolveInstitutionNorms([...globalRows, row('k.hours', 'institution', INST, '18')], [INST, OTHER_INST], KEYS);
      expect(norms[INST]).toEqual({ expectedHours: 18, amberPct: 100, redPct: 120 });
      // The other institution has no row of its own: no hours, so no colour.
      expect(norms[OTHER_INST].expectedHours).toBeNull();
      expect(classifyWorkload(30, norms[OTHER_INST]).band).toBe('not-set');
    });

    it('gives every institution empty numbers when there are no rows at all', () => {
      expect(resolveInstitutionNorms([], [INST], KEYS)).toEqual({
        [INST]: { expectedHours: null, amberPct: null, redPct: null }
      });
    });

    it("lets an institution's own amber / red limits override the platform-wide ones", () => {
      const norms = resolveInstitutionNorms(
        [...globalRows, row('k.hours', 'institution', INST, 18), row('k.red', 'institution', INST, 130)],
        [INST],
        KEYS
      );
      expect(norms[INST]).toEqual({ expectedHours: 18, amberPct: 100, redPct: 130 });
    });

    it('ignores inactive rows and rows scoped to a role, a user or another institution', () => {
      const norms = resolveInstitutionNorms(
        [
          row('k.hours', 'institution', INST, 18, false),
          row('k.hours', 'role', 'role-1', 10),
          row('k.hours', 'user', 'user-1', 10),
          row('k.hours', 'institution', OTHER_INST, 12),
          row('k.amber', 'global', null, 100, false)
        ],
        [INST],
        KEYS
      );
      expect(norms[INST]).toEqual({ expectedHours: null, amberPct: null, redPct: null });
      expect(norms[OTHER_INST]).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
describe('Rule 3: Conflicts', () => {
  it('finds a class-with-class clash', () => {
    const clashes = findClashes([
      entry('s1', 'class', MON, '10:00', '10:50', 'a'),
      entry('s1', 'class', MON, '10:30', '11:20', 'b')
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe('class-class');
    expect(epochMsToIstClock(clashes[0].overlapStartMs)).toBe('10:30');
    expect(epochMsToIstClock(clashes[0].overlapEndMs)).toBe('10:50');
  });

  it('finds a class-with-meeting clash and puts the class first', () => {
    const clashes = findClashes([
      entry('s1', 'meeting', MON, '09:45', '10:15'),
      entry('s1', 'class', MON, '10:00', '10:50')
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].type).toBe('class-meeting');
    expect(clashes[0].first.kind).toBe('class');
  });

  it('finds a class-with-event-duty clash', () => {
    const clashes = findClashes([
      entry('s1', 'class', MON, '10:00', '10:50'),
      entry('s1', 'event', MON, '09:00', '17:00')
    ]);
    expect(clashes.map((c) => c.type)).toEqual(['class-event']);
  });

  it('does not report a meeting with an event duty, back-to-back sessions, or two people', () => {
    expect(
      findClashes([entry('s1', 'meeting', MON, '10:00', '11:00'), entry('s1', 'event', MON, '10:30', '11:30')])
    ).toHaveLength(0);
    expect(
      findClashes([entry('s1', 'class', MON, '10:00', '10:50', 'a'), entry('s1', 'class', MON, '10:50', '11:40', 'b')])
    ).toHaveLength(0);
    expect(
      findClashes([entry('s1', 'class', MON, '10:00', '10:50', 'a'), entry('s2', 'class', MON, '10:00', '10:50', 'b')])
    ).toHaveLength(0);
  });

  it('does not report the same class seen twice as a clash', () => {
    const e = entry('s1', 'class', MON, '10:00', '10:50', 'same');
    expect(findClashes([e, { ...e }])).toHaveLength(0);
  });

  it('maps person-availability rows to Senior Learners and kinds', () => {
    const map = new Map([['prof-1', 's1']]);
    const rows = [
      { profile_id: 'prof-1', source: 'meeting', ref_id: 'm1', label: 'Meeting', starts_at: '2026-09-14T04:30:00Z', ends_at: '2026-09-14T05:30:00Z' },
      { profile_id: 'prof-1', source: 'event', ref_id: 'e1', label: 'Speaking', starts_at: '2026-09-14T04:30:00Z', ends_at: '2026-09-14T05:30:00Z' },
      { profile_id: 'prof-1', source: 'teaching', ref_id: 't1', label: 'Teaching: P2', starts_at: '2026-09-14T04:30:00Z', ends_at: '2026-09-14T05:20:00Z' },
      { profile_id: 'prof-unknown', source: 'meeting', ref_id: 'm2', label: 'Not ours', starts_at: '2026-09-14T04:30:00Z', ends_at: '2026-09-14T05:30:00Z' }
    ];
    expect(diaryRowsToEntries(rows, map, { includeTeaching: false }).map((e) => e.kind)).toEqual(['meeting', 'event']);
    expect(diaryRowsToEntries(rows, map, { includeTeaching: true })).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
describe('Nothing outside the viewer’s institution', () => {
  beforeEach(() => {
    h.tables = {};
    h.rpc = {};
    h.fromCalls = [];
    h.filterCalls = [];
    h.timetableSlots = [];
    h.peopleConflicts = [];
  });

  it('only accepts an institution from the viewer’s own list', () => {
    expect(isInstitutionInScope(INST, [INST])).toBe(true);
    expect(isInstitutionInScope(OTHER_INST, [INST])).toBe(false);
    expect(isInstitutionInScope(null, [INST])).toBe(false);
    expect(keepOnlyInstitution([{ institutionId: INST }, { institutionId: OTHER_INST }, { institutionId: null }], INST)).toEqual([
      { institutionId: INST }
    ]);
  });

  it('treats leave as visible only where the viewer’s HR organisations include this institution', () => {
    const mappings = [
      { institution_id: INST, hr_organization_id: 'org-mine' },
      { institution_id: OTHER_INST, hr_organization_id: 'org-other' }
    ];
    expect(leaveScopeCoversInstitution(INST, mappings, ['org-mine'])).toBe(true);
    expect(leaveScopeCoversInstitution(OTHER_INST, mappings, ['org-mine'])).toBe(false);
    expect(leaveScopeCoversInstitution(INST, [], ['org-mine'])).toBe(false);
  });

  it('checks leave visibility with the two HR scope functions and fails closed on error', async () => {
    const scope = { institutionId: INST, accessibleInstitutionIds: [INST] };
    h.rpc.fn_hr_orgs_for_institutions = () => ({
      data: [{ institution_id: INST, hr_organization_id: 'org-mine', organization_name: 'Mine' }],
      error: null
    });
    h.rpc.fn_my_hr_organization_ids = () => ({ data: ['org-mine'], error: null });
    expect(await FacultyCalendarInsightsService.isLeaveVisibleForInstitution(scope)).toBe(true);

    h.rpc.fn_my_hr_organization_ids = () => ({ data: ['org-elsewhere'], error: null });
    expect(await FacultyCalendarInsightsService.isLeaveVisibleForInstitution(scope)).toBe(false);

    h.rpc.fn_my_hr_organization_ids = () => ({ data: null, error: { message: 'denied' } });
    expect(await FacultyCalendarInsightsService.isLeaveVisibleForInstitution(scope)).toBe(false);
  });

  it('keeps people whose teaching flag is unset, drops marked non-teaching people without sessions', () => {
    const row = (staffId: string, isTeaching: boolean | null) => ({ ...person(staffId), isTeaching });
    const picked = FacultyCalendarInsightsService.pickSeniorLearners(
      [row('t', true), row('unset', null), row('office', false), row('office-teaching', false)],
      [entry('office-teaching', 'class', MON, '10:00', '10:50')]
    );
    expect(picked.map((p) => p.staffId)).toEqual(['t', 'unset', 'office-teaching']);
  });

  it('refuses another institution before reading anything', async () => {
    const scope = { institutionId: OTHER_INST, accessibleInstitutionIds: [INST] };
    await expect(FacultyCalendarInsightsService.getStaff(scope)).rejects.toBeInstanceOf(InsightsAccessError);
    await expect(FacultyCalendarInsightsService.getWorkload(scope, MON)).rejects.toBeInstanceOf(InsightsAccessError);
    await expect(FacultyCalendarInsightsService.getConflicts(scope, MON)).rejects.toBeInstanceOf(InsightsAccessError);
    await expect(FacultyCalendarInsightsService.isLeaveVisibleForInstitution(scope)).rejects.toBeInstanceOf(
      InsightsAccessError
    );
    await expect(
      FacultyCalendarInsightsService.getAvailability(scope, MON, { id: 'p', period_name: 'P1', start_time: '10:00', end_time: '10:50' })
    ).rejects.toBeInstanceOf(InsightsAccessError);
    expect(h.fromCalls).toEqual([]);
  });

  it('drops people and clashes belonging to another institution', async () => {
    h.tables.staff = {
      data: [
        { id: 's1', first_name: 'Asha', last_name: 'R', profile_id: 'prof-1', institution_id: INST, category: { is_teaching: true } },
        { id: 'x9', first_name: 'Visiting', last_name: 'L', profile_id: 'prof-9', institution_id: OTHER_INST, category: { is_teaching: true } }
      ],
      error: null
    };
    const ttSlot = (id: string, staffId: string, start: string, end: string) => ({
      id,
      day_of_week: 'MONDAY',
      period_id: id,
      period_name: id,
      start_time: start,
      end_time: end,
      staff_members: [{ id: staffId, first_name: '', last_name: '' }],
      timetable: { id: `tt-${id}`, timetable_name: `TT ${id}`, timetable_format: 'regular', institution_name: 'Mine', department_name: 'CSE' },
      is_break_slot: false
    });
    h.timetableSlots = [
      ttSlot('a', 's1', '10:00:00', '10:50:00'),
      ttSlot('b', 's1', '10:20:00', '11:10:00'),
      ttSlot('c', 'x9', '10:00:00', '10:50:00'),
      ttSlot('d', 'x9', '10:20:00', '11:10:00')
    ];
    h.peopleConflicts = [
      { profile_id: 'prof-9', source: 'meeting', ref_id: 'm9', label: 'Other meeting', starts_at: '2026-09-14T04:30:00Z', ends_at: '2026-09-14T05:30:00Z' }
    ];

    const scope = { institutionId: INST, accessibleInstitutionIds: [INST] };
    const people = await FacultyCalendarInsightsService.getStaff(scope);
    expect(people.map((s) => s.staffId)).toEqual(['s1']);
    expect(h.filterCalls).toContainEqual(['staff', 'eq', ['institution_id', INST]]);

    const { clashes } = await FacultyCalendarInsightsService.getConflicts(scope, MON);
    expect(clashes.map((c) => c.personId)).toEqual(['s1']);
    expect(clashes[0].type).toBe('class-class');
  });

  it("reads each institution's own expected hours from platform policies, active rows only", async () => {
    h.tables.platform_policies = {
      data: [
        { policy_key: WORKLOAD_POLICY_KEYS.expectedHours, scope_type: 'global', scope_id: null, value: 16, is_active: true },
        { policy_key: WORKLOAD_POLICY_KEYS.amberPct, scope_type: 'global', scope_id: null, value: 100, is_active: true },
        { policy_key: WORKLOAD_POLICY_KEYS.redPct, scope_type: 'global', scope_id: null, value: 120, is_active: true },
        { policy_key: WORKLOAD_POLICY_KEYS.expectedHours, scope_type: 'institution', scope_id: INST, value: '18', is_active: true }
      ],
      error: null
    };
    const { norms, failed } = await FacultyCalendarInsightsService.getWorkloadNorms([INST, OTHER_INST]);
    expect(failed).toBe(false);
    expect(norms[INST]).toEqual({ expectedHours: 18, amberPct: 100, redPct: 120 });
    // The platform-wide 16 is not this college's own setting.
    expect(norms[OTHER_INST]).toEqual({ expectedHours: null, amberPct: 100, redPct: 120 });
    expect(h.fromCalls).toEqual(['platform_policies']);
    const filters = h.filterCalls.map(([, m, args]) => [m, ...args]);
    expect(filters).toContainEqual(['in', 'policy_key', Object.values(WORKLOAD_POLICY_KEYS)]);
    expect(filters).toContainEqual(['in', 'scope_type', ['institution', 'global']]);
    expect(filters).toContainEqual(['eq', 'is_active', true]);
    expect(h.rpc.fn_get_policy).toBeUndefined();
  });

  it('reports a failed policy read instead of calling the hours "not set"', async () => {
    h.tables.platform_policies = { data: null as any, error: { message: 'denied' } };
    const { norms, failed } = await FacultyCalendarInsightsService.getWorkloadNorms([INST]);
    expect(failed).toBe(true);
    expect(norms[INST]).toEqual({ expectedHours: null, amberPct: null, redPct: null });
    expect(await FacultyCalendarInsightsService.getWorkloadNorms([])).toEqual({ norms: {}, failed: false });
  });

  it("bands the workload by the chosen institution's own expected hours", async () => {
    h.tables.staff = {
      data: [{ id: 's1', first_name: 'Asha', last_name: 'R', profile_id: 'prof-1', institution_id: INST, category: { is_teaching: true } }],
      error: null
    };
    h.timetableSlots = [
      {
        id: 'a',
        day_of_week: 'MONDAY',
        period_id: 'a',
        period_name: 'P1',
        start_time: '09:00:00',
        end_time: '13:00:00',
        staff_members: [{ id: 's1', first_name: '', last_name: '' }],
        timetable: { id: 'tt-a', timetable_name: 'TT', timetable_format: 'regular', institution_name: 'Mine', department_name: 'CSE' },
        is_break_slot: false
      }
    ];
    const scope = { institutionId: INST, accessibleInstitutionIds: [INST] };
    const policies = (hoursRow: any[]) => ({
      data: [
        { policy_key: WORKLOAD_POLICY_KEYS.expectedHours, scope_type: 'global', scope_id: null, value: 16, is_active: true },
        { policy_key: WORKLOAD_POLICY_KEYS.amberPct, scope_type: 'global', scope_id: null, value: 100, is_active: true },
        { policy_key: WORKLOAD_POLICY_KEYS.redPct, scope_type: 'global', scope_id: null, value: 120, is_active: true },
        ...hoursRow
      ],
      error: null
    });

    // Its own row says 2 hours a week: 4 hours of class is red.
    h.tables.platform_policies = policies([
      { policy_key: WORKLOAD_POLICY_KEYS.expectedHours, scope_type: 'institution', scope_id: INST, value: 2, is_active: true }
    ]);
    let result = await FacultyCalendarInsightsService.getWorkload(scope, MON);
    expect(result.normsFailed).toBe(false);
    expect(result.norms[INST].expectedHours).toBe(2);
    expect(result.rows.map((r) => [r.person.staffId, r.hours, r.band])).toEqual([['s1', 4, 'red']]);

    // No row of its own: plain hours, even though the platform-wide 16 exists.
    h.tables.platform_policies = policies([]);
    result = await FacultyCalendarInsightsService.getWorkload(scope, MON);
    expect(result.norms[INST].expectedHours).toBeNull();
    expect(result.rows.map((r) => [r.person.staffId, r.hours, r.band])).toEqual([['s1', 4, 'not-set']]);
  });

  it('asks the leave table only for approved, not-superseded leave and keeps its rows', async () => {
    h.tables.hr_leave_applications = {
      data: [
        { id: 'l1', employee_id: 's1', start_date: MON, end_date: MON, duration_type: 'full', start_time: null, end_time: null, status: 'approved', superseded_by: null }
      ],
      error: null
    };
    const leaves = await FacultyCalendarInsightsService.getApprovedLeaves(['s1'], MON, MON);
    expect(h.fromCalls).toEqual(['hr_leave_applications']);
    const filters = h.filterCalls.map(([, m, args]) => [m, ...args]);
    expect(filters).toContainEqual(['eq', 'status', 'approved']);
    expect(filters).toContainEqual(['is', 'superseded_by', null]);
    expect(filters).toContainEqual(['in', 'employee_id', ['s1']]);
    expect(leaves).toEqual([leave({ id: 'l1' })]);
  });
});
