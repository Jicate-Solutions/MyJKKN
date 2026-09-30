/**
 * HR staff harness, build step 2 — the chase ladder's pure rules.
 * lib/services/hr/duty-harness/ladder.ts
 *
 * Calendar used throughout: 2026-10-01 is a Thursday. 2026-10-03 Saturday,
 * 2026-10-04 Sunday (the seeded weekly off), 2026-10-05 Monday.
 */
import { describe, it, expect } from 'vitest';
import {
  activeRungs,
  addWorkingDays,
  buildDirectorDigest,
  buildHrHeadList,
  computeDueAt,
  countDeliveries,
  fuseBlown,
  holidayKey,
  isoWeekLabel,
  parseDueCalendarRule,
  parseLadder,
  readFuseLimit,
  readWorkingHours,
  renderDirectorDigest,
  resolveRungRecipients,
  selectRungIndex,
  withinWorkingHours,
  workingDaysLate,
  type HarnessCalendar,
  type ItemStanding,
  type LadderStep
} from '@/lib/services/hr/duty-harness/ladder';

const INST = '11111111-1111-1111-1111-111111111111';
const cal = (holidays: string[] = []): HarnessCalendar => ({
  weeklyOffDays: [0],
  holidayKeys: new Set(holidays.map((d) => holidayKey(INST, d)))
});

// The standard ladder exactly as the migration seeds it.
const STD: LadderStep[] = parseLadder([
  { key: 'due', after_working_days: 0, audience: 'owner', channel: 'in_app', enabled: true },
  { key: 'owner_whatsapp', after_working_days: 1, audience: 'owner', channel: 'whatsapp', enabled: false },
  { key: 'supervisor', after_working_days: 2, audience: 'supervisor', channel: 'in_app', enabled: true },
  { key: 'hr_head', after_working_days: 4, audience: 'hr_head', channel: 'weekly_list', enabled: true }
])!;
const RUNGS = activeRungs(STD);

describe('working-day math', () => {
  it('skips the weekly off and calendar holidays when adding working days', () => {
    // Thu + 2 working days: Fri, Sat (only Sunday is off).
    expect(addWorkingDays('2026-10-01', 2, INST, cal())).toBe('2026-10-03');
    // Friday a holiday: Thu + 2 = Sat, Mon.
    expect(addWorkingDays('2026-10-01', 2, INST, cal(['2026-10-02']))).toBe('2026-10-05');
    // Sat + 1 skips Sunday.
    expect(addWorkingDays('2026-10-03', 1, INST, cal())).toBe('2026-10-05');
  });

  it('a holiday of ANOTHER college does not pause this one', () => {
    const other: HarnessCalendar = {
      weeklyOffDays: [0],
      holidayKeys: new Set([holidayKey('22222222-2222-2222-2222-222222222222', '2026-10-02')])
    };
    expect(addWorkingDays('2026-10-01', 1, INST, other)).toBe('2026-10-02');
  });

  it('counts working days late strictly after the due date', () => {
    expect(workingDaysLate('2026-10-01', '2026-10-01', INST, cal())).toBe(0);
    expect(workingDaysLate('2026-10-01', '2026-10-02', INST, cal())).toBe(1);
    // Fri, Sat, (Sun), Mon = 3
    expect(workingDaysLate('2026-10-01', '2026-10-05', INST, cal())).toBe(3);
    // with Friday a holiday = 2
    expect(workingDaysLate('2026-10-01', '2026-10-05', INST, cal(['2026-10-02']))).toBe(2);
  });

  it('labels the ISO week for the once-a-week guard', () => {
    expect(isoWeekLabel('2026-10-05')).toBe('2026-W41');
    expect(isoWeekLabel('2026-10-04')).toBe('2026-W40');
  });
});

describe('due time', () => {
  it('counts hours as working days so a Sunday pauses the 48-hour clock', () => {
    // Filed Saturday 3 Oct, 15:00 IST (09:30Z). 48h = 2 working days: Mon, Tue.
    const due = computeDueAt(
      { dueHours: 48, dueWorkingDays: null, dueCalendarRule: null },
      { waitingSince: '2026-10-03T09:30:00Z', institutionId: INST },
      cal(),
      '2026-10-10'
    );
    expect(due?.toISOString()).toBe('2026-10-06T09:30:00.000Z');
  });

  it('an item-level override (the chain step escalate_after_hours) wins over the row', () => {
    const due = computeDueAt(
      { dueHours: 48, dueWorkingDays: null, dueCalendarRule: null },
      { waitingSince: '2026-10-01T05:00:00Z', institutionId: INST, dueHoursOverride: 24 },
      cal(),
      '2026-10-10'
    );
    expect(due?.toISOString()).toBe('2026-10-02T05:00:00.000Z');
  });

  it('the calendar rule combines as the EARLIER deadline (leave: before it starts)', () => {
    const due = computeDueAt(
      { dueHours: 48, dueWorkingDays: null, dueCalendarRule: 'before_item_deadline:0' },
      { waitingSince: '2026-10-01T05:00:00Z', institutionId: INST, deadlineDate: '2026-10-02' },
      cal(),
      '2026-10-10'
    );
    // Midnight IST starting 2 Oct = 1 Oct 18:30Z, earlier than 48h.
    expect(due?.toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });

  it('comp-off: due 7 days before the credit expires', () => {
    const due = computeDueAt(
      { dueHours: null, dueWorkingDays: null, dueCalendarRule: 'before_item_deadline:7' },
      { waitingSince: '2026-09-20T05:00:00Z', institutionId: INST, deadlineDate: '2026-10-12' },
      cal(),
      '2026-10-10'
    );
    expect(due?.toISOString()).toBe('2026-10-04T18:30:00.000Z');
  });

  it('an unsupported calendar rule keeps the duty out rather than guessing', () => {
    expect(parseDueCalendarRule('monthly_by_working_day:3')).toBeNull();
    expect(
      computeDueAt(
        { dueHours: null, dueWorkingDays: null, dueCalendarRule: 'monthly_by_working_day:3' },
        { waitingSince: '2026-10-01T05:00:00Z', institutionId: INST },
        cal(),
        '2026-10-10'
      )
    ).toBeNull();
  });
});

describe('ladder step selection', () => {
  it('the WhatsApp rung is seeded off and never walked', () => {
    expect(RUNGS.map((r) => r.key)).toEqual(['due', 'supervisor', 'hr_head']);
  });

  it('picks the highest rung whose offset has passed', () => {
    const pick = (late: number) =>
      selectRungIndex({ rungs: RUNGS, due: true, lateWorkingDays: late, blocked: null });
    expect(selectRungIndex({ rungs: RUNGS, due: false, lateWorkingDays: 0, blocked: null })).toBe(-1);
    expect(RUNGS[pick(0)].key).toBe('due');
    expect(RUNGS[pick(1)].key).toBe('due');
    expect(RUNGS[pick(2)].key).toBe('supervisor');
    expect(RUNGS[pick(3)].key).toBe('supervisor');
    expect(RUNGS[pick(4)].key).toBe('hr_head');
    expect(RUNGS[pick(40)].key).toBe('hr_head');
  });

  it('blocked parks the item and moves it up one rung AT ONCE', () => {
    // Marked at the owner rung, due today: straight to the supervisor.
    const i = selectRungIndex({
      rungs: RUNGS,
      due: true,
      lateWorkingDays: 0,
      blocked: { atStepKey: 'due', reason: 'waiting on the certificate' }
    });
    expect(RUNGS[i].key).toBe('supervisor');
    // Marked at the supervisor rung: to the HR head list, before day 4.
    const j = selectRungIndex({
      rungs: RUNGS,
      due: true,
      lateWorkingDays: 2,
      blocked: { atStepKey: 'supervisor', reason: 'waiting on the certificate' }
    });
    expect(RUNGS[j].key).toBe('hr_head');
  });

  it('a blocked item never goes back to its owner, and time still moves it up', () => {
    const i = selectRungIndex({
      rungs: RUNGS,
      due: true,
      lateWorkingDays: 5,
      blocked: { atStepKey: 'due', reason: 'waiting on the certificate' }
    });
    expect(RUNGS[i].key).toBe('hr_head');
  });

  it('rejects a ladder it cannot trust', () => {
    expect(parseLadder([])).toBeNull();
    expect(parseLadder([{ key: 'x', after_working_days: -1, audience: 'owner', channel: 'in_app' }])).toBeNull();
    expect(parseLadder([{ key: 'x', after_working_days: 0, audience: 'ceo', channel: 'in_app' }])).toBeNull();
    expect(
      parseLadder([
        { key: 'x', after_working_days: 0, audience: 'owner', channel: 'in_app' },
        { key: 'x', after_working_days: 1, audience: 'owner', channel: 'in_app' }
      ])
    ).toBeNull();
  });
});

describe('on-leave rerouting and missing people', () => {
  const sup = new Map([
    ['owner-1', ['sup-1']],
    ['owner-2', ['sup-2']]
  ]);
  const supervisorsOf = (ids: string[]) => [...new Set(ids.flatMap((id) => sup.get(id) ?? []))];
  const ownerRung = RUNGS[0];
  const supRung = RUNGS[1];

  it('an owner on approved leave is skipped; their supervisor gets it instead', () => {
    const r = resolveRungRecipients({
      rung: ownerRung,
      owners: ['owner-1'],
      ownersOverCap: false,
      supervisorsOf,
      onLeave: new Set(['owner-1'])
    });
    expect(r).toEqual({ audience: 'supervisor', recipientIds: ['sup-1'], reroute: 'owner_on_leave' });
  });

  it('with two owners, only the one at work is nudged', () => {
    const r = resolveRungRecipients({
      rung: ownerRung,
      owners: ['owner-1', 'owner-2'],
      ownersOverCap: false,
      supervisorsOf,
      onLeave: new Set(['owner-1'])
    });
    expect(r).toEqual({ audience: 'owner', recipientIds: ['owner-2'], reroute: null });
  });

  it('owner AND supervisor on leave: nobody is messaged, it goes to the HR head list', () => {
    const r = resolveRungRecipients({
      rung: ownerRung,
      owners: ['owner-1'],
      ownersOverCap: false,
      supervisorsOf,
      onLeave: new Set(['owner-1', 'sup-1'])
    });
    expect(r).toEqual({ audience: 'hr_head', recipientIds: [], reroute: 'supervisor_on_leave' });
  });

  it('no supervisor on record goes to the HR head list', () => {
    const r = resolveRungRecipients({
      rung: supRung,
      owners: ['owner-9'],
      ownersOverCap: false,
      supervisorsOf,
      onLeave: new Set()
    });
    expect(r).toEqual({ audience: 'hr_head', recipientIds: [], reroute: 'no_supervisor' });
  });

  it('a queue too wide to name a person skips the personal rungs', () => {
    const r = resolveRungRecipients({
      rung: ownerRung,
      owners: [],
      ownersOverCap: true,
      supervisorsOf,
      onLeave: new Set()
    });
    expect(r).toEqual({ audience: 'hr_head', recipientIds: [], reroute: 'owners_over_cap' });
  });
});

describe('volume fuse and working hours', () => {
  it('a bad fuse value falls back to the default, never to unlimited', () => {
    expect(readFuseLimit(50)).toBe(50);
    expect(readFuseLimit('20')).toBe(20);
    expect(readFuseLimit(undefined)).toBe(50);
    expect(readFuseLimit(-1)).toBe(50);
    expect(readFuseLimit(0)).toBe(50);
    expect(readFuseLimit('lots')).toBe(50);
  });

  it('counts deliveries per recipient and blows only ABOVE the limit', () => {
    const n = countDeliveries([{ recipientIds: ['a', 'b'] }, { recipientIds: ['c'] }]);
    expect(n).toBe(3);
    expect(fuseBlown(3, 3)).toBe(false);
    expect(fuseBlown(4, 3)).toBe(true);
  });

  it('nothing at night (IST)', () => {
    const h = readWorkingHours({ start: '09:00', end: '18:00' });
    expect(withinWorkingHours(new Date('2026-10-05T04:45:00Z'), h)).toBe(true); // 10:15 IST
    expect(withinWorkingHours(new Date('2026-10-05T14:00:00Z'), h)).toBe(false); // 19:30 IST
    expect(withinWorkingHours(new Date('2026-10-04T22:00:00Z'), h)).toBe(false); // 03:30 IST
  });
});

describe('weekly lists', () => {
  const standing = (over: Partial<ItemStanding>): ItemStanding => ({
    dutyCode: 'L1',
    owningQueue: 'Leave approvals',
    institutionId: INST,
    institutionName: 'Engineering',
    label: 'Priya Raman — leave 5 Oct to 7 Oct',
    lateWorkingDays: 3,
    audience: 'supervisor',
    blocked: false,
    reroute: null,
    ...over
  });

  it('the Director digest holds desks and counts only — no person, no item title', () => {
    const rows = buildDirectorDigest([
      standing({}),
      standing({ lateWorkingDays: 6, audience: 'hr_head', blocked: true }),
      standing({ dutyCode: 'S3', owningQueue: 'Staff photo review', label: 'Arun K — photo to review' }),
      standing({ lateWorkingDays: 0, audience: 'owner' }) // due today: not late
    ]);
    expect(rows).toHaveLength(2);
    const l1 = rows.find((r) => r.dutyCode === 'L1')!;
    expect(l1).toEqual({
      dutyCode: 'L1',
      owningQueue: 'Leave approvals',
      institutionName: 'Engineering',
      lateItems: 2,
      oldestLateWorkingDays: 6,
      blockedItems: 1,
      atHrHead: 1
    });
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(
        ['atHrHead', 'blockedItems', 'dutyCode', 'institutionName', 'lateItems', 'oldestLateWorkingDays', 'owningQueue'].sort()
      );
    }
    const body = renderDirectorDigest(rows);
    expect(body).not.toMatch(/Priya|Arun|Raman/);
    expect(body).toContain('Leave approvals, Engineering: 2 late');
  });

  it('the HR head list carries items that reached the HR head rung, never the owner', () => {
    const list = buildHrHeadList([
      standing({}),
      standing({ audience: 'hr_head', lateWorkingDays: 5, label: 'Item A' }),
      standing({ audience: 'hr_head', lateWorkingDays: 9, label: 'Item B', blocked: true })
    ]);
    expect(list.map((e) => e.label)).toEqual(['Item B', 'Item A']);
    expect(Object.keys(list[0])).not.toContain('ownerProfileIds');
  });
});
