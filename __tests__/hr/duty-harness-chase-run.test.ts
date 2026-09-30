/**
 * HR staff harness, build step 2 — one chase run, end to end, against
 * in-memory stand-ins for the database (lib/services/hr/duty-harness/
 * chase-service.ts). What is proven here:
 *   - master switch OFF = zero sends and zero ledger writes (a preview only);
 *   - the volume fuse stops the WHOLE run and tells the Director alone;
 *   - a rung is messaged once (the ledger dedupes the next run);
 *   - owner on leave -> their supervisor; blocked -> parked and up one rung;
 *   - nights, the weekly off and a college holiday send nothing;
 *   - the weekly Director digest names desks, never people.
 *
 * Calendar: 2026-10-05 is a Monday; 04:45Z = 10:15 IST (the scheduled slot).
 */
import { describe, it, expect } from 'vitest';
import {
  HARNESS_POLICY_KEYS,
  itemKey,
  runHrDutyChase,
  weeklyListsDueToday,
  type ChaseDeps,
  type LedgerClaim,
  type OutgoingMessage
} from '@/lib/services/hr/duty-harness/chase-service';
import { parseLadder, type DutyDefinition, type WaitingItem } from '@/lib/services/hr/duty-harness/ladder';

const INST = '11111111-1111-1111-1111-111111111111';
const MONDAY_1015 = new Date('2026-10-05T04:45:00Z');

const LADDER = parseLadder([
  { key: 'due', after_working_days: 0, audience: 'owner', channel: 'in_app', enabled: true },
  { key: 'owner_whatsapp', after_working_days: 1, audience: 'owner', channel: 'whatsapp', enabled: false },
  { key: 'supervisor', after_working_days: 2, audience: 'supervisor', channel: 'in_app', enabled: true },
  { key: 'hr_head', after_working_days: 4, audience: 'hr_head', channel: 'weekly_list', enabled: true }
])!;

const S3: DutyDefinition = {
  code: 'S3',
  name: 'Review staff photos',
  owningQueue: 'Staff photo review',
  ownerRule: 'permission',
  ownerPermissionKey: 'hr.staff_photo.review',
  dueHours: null,
  dueWorkingDays: 2,
  dueCalendarRule: null,
  ladder: LADDER,
  enabled: true,
  href: '/hr/staff-photos'
};

function item(id: string, waitingSince: string, over: Partial<WaitingItem> = {}): WaitingItem {
  return {
    dutyCode: 'S3',
    itemId: id,
    stageKey: '',
    label: `Person ${id} — photo to review`,
    institutionId: INST,
    waitingSince,
    pinnedOwnerIds: [],
    ownerRoleKeys: [],
    subjectProfileId: `subject-${id}`,
    href: '/hr/staff-photos',
    ...over
  };
}

interface World {
  now?: Date;
  policies?: Record<string, unknown>;
  defs?: DutyDefinition[];
  items?: WaitingItem[];
  owners?: string[];
  supervisors?: Record<string, string[]>;
  onLeave?: string[];
  holidays?: string[];
  blocked?: Record<string, { atStepKey: string | null; reason: string }>;
  reached?: Record<string, string[]>;
  hrHeads?: string[];
  directors?: string[];
  weeklySent?: boolean;
}

function fakeDeps(w: World) {
  const sent: OutgoingMessage[] = [];
  const claims: LedgerClaim[] = [];
  const runs: any[] = [];
  const calls = { collect: 0 };
  const reached = new Map<string, Set<string>>(
    Object.entries(w.reached ?? {}).map(([k, v]) => [k, new Set(v)])
  );
  const deps: ChaseDeps = {
    now: () => w.now ?? MONDAY_1015,
    loadPolicies: async () => ({
      [HARNESS_POLICY_KEYS.enabled]: true,
      [HARNESS_POLICY_KEYS.maxMessagesPerRun]: 50,
      [HARNESS_POLICY_KEYS.weeklyOffDays]: [0],
      [HARNESS_POLICY_KEYS.digestWeekday]: 1,
      ...(w.policies ?? {})
    }),
    loadDefinitions: async () => w.defs ?? [S3],
    collectItems: async (def) => {
      calls.collect++;
      return def.code === 'S3' ? (w.items ?? []) : null;
    },
    loadHolidayKeys: async () => new Set((w.holidays ?? []).map((d) => `${INST}|${d}`)),
    loadReachedRungs: async () => reached,
    loadBlockedMarks: async () => new Map(Object.entries(w.blocked ?? {})),
    resolveOwners: async () => w.owners ?? ['owner-1'],
    resolveSupervisors: async (ids) =>
      new Map(ids.map((id) => [id, (w.supervisors ?? { 'owner-1': ['sup-1'] })[id] ?? []])),
    loadOnLeave: async (ids) => new Set(ids.filter((id) => (w.onLeave ?? []).includes(id))),
    resolveHrHeads: async () => w.hrHeads ?? ['hrhead-1'],
    resolveDirectors: async () => w.directors ?? ['director-1'],
    loadInstitutionNames: async () => new Map([[INST, 'Engineering']]),
    weeklyListsAlreadySent: async () => w.weeklySent ?? false,
    claimLedger: async (row) => {
      const k = itemKey(row);
      const set = reached.get(k) ?? new Set<string>();
      if (set.has(row.stepKey)) return { status: 'exists' };
      set.add(row.stepKey);
      reached.set(k, set);
      claims.push(row);
      return { status: 'claimed', id: `ledger-${claims.length}` };
    },
    finishLedger: async () => {},
    send: async (msg) => {
      sent.push(msg);
      return { notified: msg.recipientIds.length, notificationId: `n-${sent.length}` };
    },
    resolveCleared: async () => 0,
    recordRun: async (r) => {
      runs.push(r);
    }
  };
  return { deps, sent, claims, runs, calls };
}

// Uploaded Wed 30 Sep 10:00 IST; 2 working days -> due Fri 2 Oct 10:00 IST.
// Monday 5 Oct: Sat + Mon = 2 working days late -> the supervisor rung.
const TWO_LATE = '2026-09-30T04:30:00Z';
// Uploaded Fri 2 Oct; due Mon 5 Oct 10:00 IST (before the 10:15 run) -> owner rung.
const DUE_TODAY = '2026-10-02T04:30:00Z';

describe('HR chase run — master switch', () => {
  it('OFF: nothing is sent and nothing is written to the ledger; the run records a preview', async () => {
    const w = fakeDeps({
      policies: { [HARNESS_POLICY_KEYS.enabled]: false },
      items: [item('a', DUE_TODAY), item('b', TWO_LATE)]
    });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('switched_off');
    expect(w.sent).toHaveLength(0);
    expect(w.claims).toHaveLength(0);
    expect(r.sentDeliveries).toBe(0);
    // It still tells the Director what it WOULD have done.
    expect(r.plannedDeliveries).toBeGreaterThan(0);
    expect(r.preview.S3).toBe(2);
    expect(w.runs).toHaveLength(1);
    expect(w.runs[0].outcome).toBe('switched_off');
  });

  it('only a literal true switches it on', async () => {
    for (const v of ['true', 1, 'yes', null]) {
      const w = fakeDeps({ policies: { [HARNESS_POLICY_KEYS.enabled]: v }, items: [item('a', DUE_TODAY)] });
      const r = await runHrDutyChase(w.deps);
      expect(r.outcome).toBe('switched_off');
      expect(w.sent).toHaveLength(0);
    }
  });
});

describe('HR chase run — the ladder', () => {
  it('due today nudges the owner; two working days late reaches the supervisor', async () => {
    const w = fakeDeps({ items: [item('a', DUE_TODAY), item('b', TWO_LATE)] });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('sent');
    const byItem = Object.fromEntries(w.claims.map((c) => [c.itemId, c]));
    expect(byItem.a.stepKey).toBe('due');
    expect(byItem.a.recipientIds).toEqual(['owner-1']);
    expect(byItem.b.stepKey).toBe('supervisor');
    expect(byItem.b.recipientIds).toEqual(['sup-1']);
    // Each message opens the item's own screen.
    const perItem = w.sent.filter((m) => m.category === 'hr:duty-chase');
    expect(perItem).toHaveLength(2);
    expect(perItem.every((m) => m.url === '/hr/staff-photos')).toBe(true);
  });

  it('a rung is messaged once: the next run over the same state sends nothing new', async () => {
    const w = fakeDeps({ items: [item('a', DUE_TODAY)], weeklySent: true });
    await runHrDutyChase(w.deps);
    const first = w.sent.length;
    await runHrDutyChase(w.deps);
    expect(first).toBe(1);
    expect(w.sent).toHaveLength(1);
  });

  it('the person the item is about is never chased to approve it', async () => {
    const w = fakeDeps({ items: [item('a', DUE_TODAY)], owners: ['subject-a', 'owner-1'], weeklySent: true });
    await runHrDutyChase(w.deps);
    expect(w.sent[0].recipientIds).toEqual(['owner-1']);
  });

  it('owner on approved leave: the supervisor is told instead, and the owner is not', async () => {
    const w = fakeDeps({ items: [item('a', DUE_TODAY)], onLeave: ['owner-1'], weeklySent: true });
    await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].recipientIds).toEqual(['sup-1']);
    expect(w.sent[0].body).toContain('on approved leave today');
    expect(w.claims[0].reroute).toBe('owner_on_leave');
  });

  it('blocked: parked (no owner nudge) and moved up one rung at once', async () => {
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      blocked: { [itemKey(item('a', DUE_TODAY))]: { atStepKey: 'due', reason: 'Waiting on the photographer' } },
      weeklySent: true
    });
    await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].recipientIds).toEqual(['sup-1']);
    expect(w.sent[0].body).toContain('Waiting on the photographer');
    expect(w.claims[0]).toMatchObject({ stepKey: 'supervisor', blocked: true });
  });

  it('a college holiday today pauses the chase for that college', async () => {
    const w = fakeDeps({ items: [item('b', TWO_LATE)], holidays: ['2026-10-05'], weeklySent: true });
    const r = await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(0);
    expect((r.detail.duties as any).S3.skipped_holiday).toBe(1);
  });

  it('a duty with no source adapter is inert even when enabled', async () => {
    const other: DutyDefinition = { ...S3, code: 'G4', name: 'Disciplinary cases' };
    const w = fakeDeps({ defs: [other], weeklySent: true });
    const r = await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(0);
    expect((r.detail.duties as any).G4.no_source_adapter).toBe(1);
  });
});

describe('HR chase run — nights, weekly offs, the fuse', () => {
  it('outside working hours: nothing is read and nothing is sent', async () => {
    const w = fakeDeps({ now: new Date('2026-10-05T15:00:00Z'), items: [item('a', DUE_TODAY)] });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('outside_hours');
    expect(w.calls.collect).toBe(0);
    expect(w.sent).toHaveLength(0);
  });

  it('the weekly off (Sunday): nothing is sent', async () => {
    const w = fakeDeps({ now: new Date('2026-10-04T04:45:00Z'), items: [item('a', DUE_TODAY)] });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('weekly_off');
    expect(w.sent).toHaveLength(0);
  });

  it('over the fuse: NOTHING goes to anyone, the Director alone is told, the ledger is untouched', async () => {
    const w = fakeDeps({
      policies: { [HARNESS_POLICY_KEYS.maxMessagesPerRun]: 1 },
      items: [item('a', DUE_TODAY), item('b', TWO_LATE)],
      weeklySent: true
    });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('halted_volume_fuse');
    expect(r.fuseBlown).toBe(true);
    expect(w.claims).toHaveLength(0);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].recipientIds).toEqual(['director-1']);
    expect(w.sent[0].title).toContain('nothing was sent');
  });

  it('at the fuse exactly, the run goes out', async () => {
    const w = fakeDeps({
      policies: { [HARNESS_POLICY_KEYS.maxMessagesPerRun]: 2 },
      items: [item('a', DUE_TODAY), item('b', TWO_LATE)],
      weeklySent: true
    });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('sent');
    expect(w.sent).toHaveLength(2);
  });
});

describe('HR chase run — weekly lists', () => {
  it('Monday: one HR head list and one Director digest; the digest names desks, not people', async () => {
    // Uploaded Mon 28 Sep: due Wed 30 Sep; Thu, Fri, Sat, Mon = 4 late -> HR head rung.
    const w = fakeDeps({ items: [item('late', '2026-09-28T04:30:00Z'), item('b', TWO_LATE)] });
    const r = await runHrDutyChase(w.deps);
    expect(r.weeklyListsSent).toBe(true);
    const digest = w.sent.find((m) => m.idempotencyKey.startsWith('hr-duty:director-digest:'))!;
    const hrList = w.sent.find((m) => m.idempotencyKey.startsWith('hr-duty:hr-head-list:'))!;
    expect(digest.recipientIds).toEqual(['director-1']);
    expect(digest.body).toContain('Staff photo review, Engineering: 2 late');
    // No item title, no person, no profile id in the Director's digest.
    expect(digest.body).not.toMatch(/Person late|Person b|owner-1|sup-1|subject-/);
    expect(JSON.stringify(digest.metadata)).not.toMatch(/owner-1|sup-1|subject-/);
    expect(hrList.recipientIds).toEqual(['hrhead-1']);
    expect(hrList.body).toContain('Person late — photo to review');
    expect(hrList.body).not.toMatch(/owner-1|sup-1/);
    // The HR head rung itself sends nothing per item — it is recorded only.
    const hrClaim = w.claims.find((c) => c.itemId === 'late')!;
    expect(hrClaim.stepKey).toBe('hr_head');
    expect(hrClaim.recipientIds).toEqual([]);
  });

  it('the weekly lists go once per ISO week', async () => {
    const w = fakeDeps({ items: [item('b', TWO_LATE)], weeklySent: true });
    const r = await runHrDutyChase(w.deps);
    expect(r.weeklyListsDue).toBe(false);
    expect(w.sent.some((m) => m.idempotencyKey.includes('director-digest'))).toBe(false);
  });

  it('is due from the digest weekday to the end of that week', () => {
    expect(weeklyListsDueToday('2026-10-05', 1)).toBe(true); // Monday
    expect(weeklyListsDueToday('2026-10-07', 1)).toBe(true); // Wednesday, missed Monday
    expect(weeklyListsDueToday('2026-10-05', 3)).toBe(false); // Monday, digest on Wednesday
    expect(weeklyListsDueToday('2026-10-04', 1)).toBe(true); // Sunday closes the week
  });
});
