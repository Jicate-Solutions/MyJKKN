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
  readHarnessPolicies,
  runHrDutyChase,
  weeklyListsDueToday,
  type ChaseDeps,
  type HrHeadHolder,
  type LedgerClaim,
  type OutgoingMessage
} from '@/lib/services/hr/duty-harness/chase-service';
import {
  parseLadder,
  resolveRungRecipients,
  type DutyDefinition,
  type WaitingItem
} from '@/lib/services/hr/duty-harness/ladder';

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
  name: 'Review photos',
  owningQueue: 'Photo review',
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
  hrHeads?: Array<string | HrHeadHolder>;
  directors?: string[];
  weeklySent?: boolean;
  truncated?: boolean;
  /** Sends whose idempotency key matches this throw. */
  failSend?: (msg: OutgoingMessage) => boolean;
  /** Milliseconds the clock moves on each now() call after the first. */
  tickMs?: number;
  /** After this many owner look-ups, the clock jumps forward by jumpMs. */
  slowOwners?: { afterCalls: number; jumpMs: number };
  /** Dependencies that never answer. */
  hang?: Array<keyof ChaseDeps>;
  /** Sends that never answer. */
  hangSend?: (msg: OutgoingMessage) => boolean;
}

function fakeDeps(w: World) {
  const sent: OutgoingMessage[] = [];
  const claims: LedgerClaim[] = [];
  const runs: any[] = [];
  const calls = { collect: 0, cleared: [] as string[] };
  const reached = new Map<string, Set<string>>(
    Object.entries(w.reached ?? {}).map(([k, v]) => [k, new Set(v)])
  );
  // ledger id -> the row as the database would hold it.
  const ledger = new Map<string, { claim: LedgerClaim; notificationId: string | null }>();
  let clock = (w.now ?? MONDAY_1015).getTime();
  let firstNow = true;
  let ownerCalls = 0;
  const deps: ChaseDeps = {
    now: () => {
      if (!firstNow) clock += w.tickMs ?? 0;
      firstNow = false;
      return new Date(clock);
    },
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
      return def.code === 'S3' ? { items: w.items ?? [], truncated: w.truncated ?? false } : null;
    },
    loadHolidayKeys: async () => new Set((w.holidays ?? []).map((d) => `${INST}|${d}`)),
    loadReachedRungs: async () => reached,
    loadUnsentRungs: async () => {
      const out = new Map<string, Map<string, string>>();
      for (const [id, row] of ledger) {
        if (row.notificationId || row.claim.recipientIds.length === 0) continue;
        const k = itemKey(row.claim);
        if (!out.has(k)) out.set(k, new Map());
        out.get(k)!.set(row.claim.stepKey, id);
      }
      return out;
    },
    loadBlockedMarks: async () => new Map(Object.entries(w.blocked ?? {})),
    resolveOwners: async () => {
      ownerCalls++;
      if (w.slowOwners && ownerCalls === w.slowOwners.afterCalls) clock += w.slowOwners.jumpMs;
      return w.owners ?? ['owner-1'];
    },
    resolveSupervisors: async (ids) =>
      new Map(ids.map((id) => [id, (w.supervisors ?? { 'owner-1': ['sup-1'] })[id] ?? []])),
    loadOnLeave: async (ids) => new Set(ids.filter((id) => (w.onLeave ?? []).includes(id))),
    resolveHrHeads: async () =>
      (w.hrHeads ?? ['hrhead-1']).map((h) =>
        typeof h === 'string' ? { userId: h, scopeAll: true, institutionId: null } : h
      ),
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
      const id = `ledger-${claims.length}`;
      ledger.set(id, { claim: row, notificationId: null });
      return { status: 'claimed', id };
    },
    // As db-deps does: null = nobody was told, so the row names nobody.
    finishLedger: async (id, notificationId) => {
      const row = ledger.get(id);
      if (!row) return;
      if (notificationId) row.notificationId = notificationId;
      else row.claim = { ...row.claim, recipientIds: [] };
    },
    send: async (msg) => {
      if (w.hangSend?.(msg)) return new Promise(() => {});
      if (w.failSend?.(msg)) throw new Error('notification service down');
      sent.push(msg);
      return { notified: msg.recipientIds.length, notificationId: `n-${sent.length}` };
    },
    resolveCleared: async (code) => {
      calls.cleared.push(code);
      return 0;
    },
    recordRun: async (r) => {
      runs.push(r);
    }
  };
  for (const name of w.hang ?? []) (deps as any)[name] = () => new Promise(() => {});
  return { deps, sent, claims, runs, calls, ledger, world: w, ownerCalls: () => ownerCalls };
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
    expect(digest.body).toContain('Photo review, Engineering: 2 late');
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

// ---------------------------------------------------------------------------
// Follow-up to the #4152 review
// ---------------------------------------------------------------------------

const INST_B = '22222222-2222-2222-2222-222222222222';

describe('HR chase run — review follow-ups (#4152)', () => {
  it('finding 1: a send that fails is sent again on the next run, not lost', async () => {
    let down = true;
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      weeklySent: true,
      failSend: (m) => down && m.category === 'hr:duty-chase'
    });
    const r1 = await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(0);
    expect(w.claims).toHaveLength(1);
    expect(r1.errors.join(' ')).toContain('notification service down');

    down = false;
    const r2 = await runHrDutyChase(w.deps);
    expect(r2.errors).toEqual([]);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].recipientIds).toEqual(['owner-1']);
    // Re-sent on the SAME ledger row and the same idempotency key.
    expect(w.claims).toHaveLength(1);
    expect([...w.ledger.values()][0].notificationId).toBe('n-1');

    // And once it has gone, it is not sent a third time.
    await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(1);
  });

  it('finding 2: a duty whose source hit the load cap closes no ledger rows', async () => {
    const full = fakeDeps({ items: [item('a', DUE_TODAY)], truncated: true, weeklySent: true });
    const r = await runHrDutyChase(full.deps);
    expect(full.calls.cleared).toEqual([]);
    expect(r.detail.clear_skipped).toEqual(['S3']);

    const complete = fakeDeps({ items: [item('a', DUE_TODAY)], weeklySent: true });
    await runHrDutyChase(complete.deps);
    expect(complete.calls.cleared).toEqual(['S3']);
  });

  it('finding 3: an HR head sees only their own college on the late list', async () => {
    // Both four working days late -> the HR head rung.
    const w = fakeDeps({
      items: [
        item('eng', '2026-09-28T04:30:00Z'),
        item('nur', '2026-09-28T04:30:00Z', { institutionId: INST_B, label: 'Person nur — photo to review' })
      ],
      hrHeads: [
        { userId: 'hrhead-eng', scopeAll: false, institutionId: INST },
        { userId: 'hrhead-nur', scopeAll: false, institutionId: INST_B },
        { userId: 'hrhead-all', scopeAll: true, institutionId: INST }
      ]
    });
    const r = await runHrDutyChase(w.deps);
    const lists = w.sent.filter((m) => m.idempotencyKey.startsWith('hr-duty:hr-head-list:'));
    const forUser = (u: string) => lists.filter((m) => m.recipientIds.includes(u));
    expect(forUser('hrhead-eng')).toHaveLength(1);
    expect(forUser('hrhead-eng')[0].body).toContain('Person eng');
    expect(forUser('hrhead-eng')[0].body).not.toContain('Person nur');
    expect(forUser('hrhead-nur')).toHaveLength(1);
    expect(forUser('hrhead-nur')[0].body).toContain('Person nur');
    expect(forUser('hrhead-nur')[0].body).not.toContain('Person eng');
    expect(forUser('hrhead-all')).toHaveLength(1);
    expect(forUser('hrhead-all')[0].body).toContain('Person eng');
    expect(forUser('hrhead-all')[0].body).toContain('Person nur');
    // Every list has its own key, so one list never swallows another.
    expect(new Set(lists.map((m) => m.idempotencyKey)).size).toBe(lists.length);
    expect(r.weeklyListsSent).toBe(true);
  });

  it('finding 3: an item with no college reaches only an HR head who covers every college', async () => {
    const w = fakeDeps({
      items: [item('x', '2026-09-28T04:30:00Z', { institutionId: null })],
      hrHeads: [{ userId: 'hrhead-eng', scopeAll: false, institutionId: INST }]
    });
    const r = await runHrDutyChase(w.deps);
    expect(w.sent.some((m) => m.recipientIds.includes('hrhead-eng'))).toBe(false);
    expect(r.errors.join(' ')).toContain('reached no HR head');
  });

  it('finding 6: a failed weekly send does not mark the week as sent', async () => {
    const w = fakeDeps({
      items: [item('late', '2026-09-28T04:30:00Z')],
      failSend: (m) => m.idempotencyKey.startsWith('hr-duty:director-digest:')
    });
    const r = await runHrDutyChase(w.deps);
    expect(r.weeklyListsDue).toBe(true);
    expect(r.weeklyListsSent).toBe(false);
  });

  it('finding 7: a supervisor on leave is told when back, and the item is on the HR head list meanwhile', async () => {
    const away = fakeDeps({ items: [item('b', TWO_LATE)], onLeave: ['sup-1'] });
    await runHrDutyChase(away.deps);
    // Nothing claimed: the supervisor rung waits for them.
    expect(away.claims).toHaveLength(0);
    const list = away.sent.find((m) => m.idempotencyKey.startsWith('hr-duty:hr-head-list:'))!;
    expect(list.body).toContain('Person b');

    // Next run, the supervisor is back.
    away.world.onLeave = [];
    away.world.weeklySent = true;
    await runHrDutyChase(away.deps);
    const toSup = away.sent.filter((m) => m.category === 'hr:duty-chase');
    expect(toSup).toHaveLength(1);
    expect(toSup[0].recipientIds).toEqual(['sup-1']);
  });

  it('finding 5: a run that runs out of time stops claiming, records itself, and leaves the rest', async () => {
    // The clock moves 1 s per reading: 3 readings while working out owners
    // (t = 1, 2, 3 s), then one before each claim (t = 4 s, 5 s, ...).
    const w = fakeDeps({
      items: [item('a', DUE_TODAY), item('b', TWO_LATE), item('c', DUE_TODAY)],
      weeklySent: true,
      tickMs: 1_000
    });
    const r = await runHrDutyChase(w.deps, { budgetMs: 4_500 });
    expect(r.outcome).toBe('sent');
    expect(w.claims).toHaveLength(1);
    expect(r.detail.deadline).toEqual({ not_started: 2 });
    expect(r.errors.join(' ')).toContain('ran out of time');
    expect(w.runs).toHaveLength(1);
  });

  it('finding 5: with no time left at all, nothing is claimed and the run is still recorded', async () => {
    const w = fakeDeps({
      items: [item('a', DUE_TODAY), item('b', TWO_LATE), item('c', DUE_TODAY)],
      weeklySent: true,
      tickMs: 1_000
    });
    const r = await runHrDutyChase(w.deps, { budgetMs: 1_500 });
    // Owners stop at t = 2 s (past 80% of 1.5 s): a is worked out, b and c wait.
    // Claims stop at t = 3 s: a is planned but not started. Both are logged.
    expect(r.detail.deadline).toEqual({ owners_unresolved: 2, not_started: 1 });
    expect(w.claims).toHaveLength(0);
    expect(w.sent).toHaveLength(0);
    expect(w.runs).toHaveLength(1);
    expect(r.errors.join(' ')).toContain('ran out of time');
  });

  it('a digest weekday of null or empty falls back to Monday, not Sunday (the weekly off)', () => {
    for (const v of [null, '']) {
      expect(readHarnessPolicies({ [HARNESS_POLICY_KEYS.digestWeekday]: v }).digestWeekday).toBe(1);
    }
    expect(readHarnessPolicies({ [HARNESS_POLICY_KEYS.digestWeekday]: 0 }).digestWeekday).toBe(0);
  });
});

describe('HR chase run — second review follow-ups (#4262)', () => {
  const FOUR_LATE = '2026-09-28T04:30:00Z';

  it('R2 finding 1: an HR head with grants for two colleges gets both colleges on their list', async () => {
    const w = fakeDeps({
      items: [
        item('eng', FOUR_LATE),
        item('nur', FOUR_LATE, { institutionId: INST_B, label: 'Person nur — photo to review' })
      ],
      hrHeads: [
        { userId: 'hrhead-two', scopeAll: false, institutionId: INST },
        { userId: 'hrhead-two', scopeAll: false, institutionId: INST_B }
      ]
    });
    const r = await runHrDutyChase(w.deps);
    const lists = w.sent.filter(
      (m) => m.idempotencyKey.startsWith('hr-duty:hr-head-list:') && m.recipientIds.includes('hrhead-two')
    );
    const bodies = lists.map((m) => m.body).join('\n');
    expect(bodies).toContain('Person eng');
    expect(bodies).toContain('Person nur');
    // Each list still carries one college only.
    for (const m of lists) expect(m.body.includes('Person eng') && m.body.includes('Person nur')).toBe(false);
    expect(r.errors.join(' ')).not.toContain('reached no HR head');
  });

  it('R2 finding 1: an HR head with an every-college grant gets one list, not the same names twice', async () => {
    const w = fakeDeps({
      items: [item('eng', FOUR_LATE)],
      hrHeads: [
        { userId: 'hrhead-x', scopeAll: false, institutionId: INST },
        { userId: 'hrhead-x', scopeAll: true, institutionId: null }
      ]
    });
    await runHrDutyChase(w.deps);
    const lists = w.sent.filter(
      (m) => m.idempotencyKey.startsWith('hr-duty:hr-head-list:') && m.recipientIds.includes('hrhead-x')
    );
    expect(lists).toHaveLength(1);
    expect(lists[0].idempotencyKey).toMatch(/:all$/);
  });

  it('R2 finding 3 (checked, holds): a rerouted item on the HR head list counts as reached', async () => {
    const w = fakeDeps({ items: [item('b', TWO_LATE)], onLeave: ['sup-1'] });
    const r = await runHrDutyChase(w.deps);
    expect(w.sent.some((m) => m.idempotencyKey.startsWith('hr-duty:hr-head-list:'))).toBe(true);
    expect(r.errors.join(' ')).not.toContain('reached no HR head');
  });

  it('R2 finding 2: a resumed rung with nobody left to tell is closed, not planned on every run', async () => {
    let down = true;
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      weeklySent: true,
      failSend: (m) => down && m.category === 'hr:duty-chase'
    });
    await runHrDutyChase(w.deps);
    expect(w.claims).toHaveLength(1);
    // Next run: the owner is on leave and has no supervisor, so nobody is told.
    down = false;
    w.world.onLeave = ['owner-1'];
    w.world.supervisors = {};
    await runHrDutyChase(w.deps);
    expect(w.sent).toHaveLength(0);
    // The run after that has nothing left to plan for the rung.
    const r3 = await runHrDutyChase(w.deps);
    expect(r3.outcome).toBe('nothing_due');
    expect(w.claims).toHaveLength(1);
  });

  it('R2 finding 5: running out of time on owners carries out the plan for the owners already known', async () => {
    const w = fakeDeps({
      items: [item('a', DUE_TODAY), item('b', DUE_TODAY), item('c', DUE_TODAY)],
      // Third look-up happens after 85 s, past the owner phase (80 s of 100 s).
      slowOwners: { afterCalls: 2, jumpMs: 85_000 }
    });
    const r = await runHrDutyChase(w.deps);
    expect(r.outcome).toBe('sent');
    expect(w.claims.map((c) => c.itemId)).toEqual(['a', 'b']);
    expect(w.sent.filter((m) => m.category === 'hr:duty-chase')).toHaveLength(2);
    expect(r.detail.deadline).toEqual({ owners_unresolved: 1 });
    expect(r.errors.join(' ')).toContain('ran out of time working out owners');
    // A partial picture sends no weekly lists; the next run in the week does.
    expect(r.weeklyListsDue).toBe(false);
    expect(w.sent.some((m) => m.category === 'hr:duty-chase-weekly')).toBe(false);
    expect(w.runs).toHaveLength(1);
  });

  it('R2 finding 6: a call that never answers is abandoned within the budget and the run is recorded', async () => {
    const w = fakeDeps({ items: [item('a', DUE_TODAY)], weeklySent: true, hang: ['loadHolidayKeys'] });
    const r = await runHrDutyChase(w.deps, { budgetMs: 50 });
    expect(r.outcome).toBe('failed');
    expect(r.errors.join(' ')).toContain('loadHolidayKeys: no answer');
    expect(w.runs).toHaveLength(1);
  });

  it('R2 finding 6: a hung send is abandoned, recorded as an error, and left unsent for the next run', async () => {
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      weeklySent: true,
      hangSend: (m) => m.category === 'hr:duty-chase'
    });
    const r = await runHrDutyChase(w.deps, { budgetMs: 50 });
    expect(r.errors.join(' ')).toContain('send: no answer');
    expect(w.runs).toHaveLength(1);
    expect([...w.ledger.values()][0].notificationId).toBeNull();
  });

  it('R2 finding 6: a run row write that never answers does not hold the run', async () => {
    const w = fakeDeps({ items: [], weeklySent: true, hang: ['recordRun'] });
    const r = await runHrDutyChase(w.deps, { recordRunMs: 50 });
    expect(r.errors.join(' ')).toContain('recordRun: no answer');
  });

  it('R2 finding 7: a blank or boolean digest weekday falls back to Monday', () => {
    const read = (v: unknown) => readHarnessPolicies({ [HARNESS_POLICY_KEYS.digestWeekday]: v }).digestWeekday;
    for (const v of [' ', '\t', false, true, '1.5', 1.5, 'abc', [], {}]) expect(read(v)).toBe(1);
    expect(read(3)).toBe(3);
    expect(read('3')).toBe(3);
    expect(read(' 2 ')).toBe(2);
    expect(read(0)).toBe(0);
  });
});

describe('HR chase run — third review follow-ups (#4262)', () => {
  const chases = (sent: OutgoingMessage[]) => sent.filter((m) => m.category === 'hr:duty-chase');

  it('R3 finding 1: an owner rung that failed to send is still sent after the item climbs to the supervisor', async () => {
    let down = true;
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      weeklySent: true,
      failSend: (m) => down && m.category === 'hr:duty-chase'
    });
    await runHrDutyChase(w.deps);
    expect(w.claims.map((c) => c.stepKey)).toEqual(['due']);
    expect(w.sent).toHaveLength(0);

    // Next run the same item is two working days late: the supervisor rung.
    down = false;
    w.world.items = [item('a', TWO_LATE)];
    const r2 = await runHrDutyChase(w.deps);
    expect(r2.errors).toEqual([]);
    // Both rungs go out, in rung order: the owner's on its original ledger row.
    expect(chases(w.sent).map((m) => [m.idempotencyKey, m.recipientIds])).toEqual([
      ['hr-duty:S3:a:-:due', ['owner-1']],
      ['hr-duty:S3:a:-:supervisor', ['sup-1']]
    ]);
    expect(w.claims.map((c) => c.stepKey)).toEqual(['due', 'supervisor']);
    expect(w.ledger.get('ledger-1')!.notificationId).toBe('n-1');
    expect((r2.detail.duties as any).S3.resumed_earlier_rung).toBe(1);

    // And neither is sent again.
    await runHrDutyChase(w.deps);
    expect(chases(w.sent)).toHaveLength(2);
  });

  it('R3 finding 1: a blocked item does not resume its unsent owner rung — the row is closed as superseded', async () => {
    let down = true;
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      weeklySent: true,
      failSend: (m) => down && m.category === 'hr:duty-chase'
    });
    await runHrDutyChase(w.deps);
    expect(w.claims.map((c) => c.stepKey)).toEqual(['due']);

    down = false;
    w.world.blocked = { [itemKey(item('a', DUE_TODAY))]: { atStepKey: 'due', reason: 'Waiting on the photographer' } };
    const r2 = await runHrDutyChase(w.deps);
    // The owner is never nudged; the supervisor is.
    expect(chases(w.sent).map((m) => m.recipientIds)).toEqual([['sup-1']]);
    // The owner rung's row now names nobody, so it is not unsent any more.
    expect(w.ledger.get('ledger-1')!.claim.recipientIds).toEqual([]);
    expect(w.ledger.get('ledger-1')!.notificationId).toBeNull();
    expect((r2.detail.duties as any).S3.superseded_unsent).toBe(1);

    const r3 = await runHrDutyChase(w.deps);
    expect(r3.outcome).toBe('nothing_due');
    expect(chases(w.sent)).toHaveLength(1);
  });

  it('R3 finding 1: an unsent owner rung whose owner is on leave is closed, not sent twice to the supervisor', async () => {
    let down = true;
    const w = fakeDeps({
      items: [item('a', DUE_TODAY)],
      weeklySent: true,
      failSend: (m) => down && m.category === 'hr:duty-chase'
    });
    await runHrDutyChase(w.deps);
    down = false;
    w.world.items = [item('a', TWO_LATE)];
    w.world.onLeave = ['owner-1'];
    await runHrDutyChase(w.deps);
    // The supervisor rung tells the supervisor once; the owner rung's reroute
    // would only repeat it.
    expect(chases(w.sent).map((m) => m.idempotencyKey)).toEqual(['hr-duty:S3:a:-:supervisor']);
    expect(w.ledger.get('ledger-1')!.claim.recipientIds).toEqual([]);
  });

  // Five items the ledger shows as already reached, then one new item.
  const backlog = () => [
    ...['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => item(id, DUE_TODAY)),
    item('n', DUE_TODAY)
  ];
  const reachedBacklog = Object.fromEntries(
    ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => [itemKey(item(id, DUE_TODAY)), ['due']])
  );

  it('R3 finding 2: items already reached are filtered out before any owner look-up', async () => {
    const w = fakeDeps({ items: backlog(), reached: reachedBacklog, weeklySent: true });
    const r = await runHrDutyChase(w.deps);
    expect(w.ownerCalls()).toBe(1);
    expect(w.claims.map((c) => c.itemId)).toEqual(['n']);
    expect(r.itemsDue).toBe(6);
  });

  it('R3 finding 2: a slow owner look-up cannot starve a new item behind a backlog already reached', async () => {
    // The first look-up takes 85 s — past the owner phase (80 s of 100 s).
    const w = fakeDeps({
      items: backlog(),
      reached: reachedBacklog,
      weeklySent: true,
      slowOwners: { afterCalls: 1, jumpMs: 85_000 }
    });
    const r = await runHrDutyChase(w.deps);
    expect(w.claims.map((c) => c.itemId)).toEqual(['n']);
    expect(chases(w.sent).map((m) => m.recipientIds)).toEqual([['owner-1']]);
    expect(r.errors.join(' ')).not.toContain('ran out of time working out owners');
  });

  it('R3 finding 2: on a list day the new item is worked out first; the backlog after it, for the lists', async () => {
    const w = fakeDeps({
      items: backlog(),
      reached: reachedBacklog,
      slowOwners: { afterCalls: 1, jumpMs: 85_000 }
    });
    const r = await runHrDutyChase(w.deps);
    expect(w.claims.map((c) => c.itemId)).toEqual(['n']);
    expect(r.detail.deadline).toEqual({ owners_unresolved: 5 });
    expect(r.weeklyListsDue).toBe(false);

    // With time to spare, the lists still name every item.
    const full = fakeDeps({ items: backlog(), reached: reachedBacklog });
    const r2 = await runHrDutyChase(full.deps);
    expect(full.ownerCalls()).toBe(6);
    expect(r2.weeklyListsSent).toBe(true);
  });

  it('R3 finding 2: owners are prefetched in one call, only for the items that need them today', async () => {
    const w = fakeDeps({ items: backlog(), reached: reachedBacklog, weeklySent: true });
    const prefetched: string[][] = [];
    w.deps.prefetchOwners = async (items) => {
      prefetched.push(items.map((i) => i.itemId));
    };
    await runHrDutyChase(w.deps);
    expect(prefetched).toEqual([['n']]);

    // A prefetch that fails is reported, and each look-up still runs on its own.
    const f = fakeDeps({ items: [item('a', DUE_TODAY)], weeklySent: true });
    f.deps.prefetchOwners = async () => {
      throw new Error('profiles down');
    };
    const r = await runHrDutyChase(f.deps);
    expect(r.errors.join(' ')).toContain('prefetch owners: profiles down');
    expect(f.claims.map((c) => c.itemId)).toEqual(['a']);
  });

  it('R3 finding 3 (checked, holds): a supervisor-on-leave reroute names nobody, so waiting holds no message back', async () => {
    const [, , supervisorRung] = LADDER;
    const supervisorsOf = () => ['sup-1'];
    // The supervisor rung, and the owner rung when the owner is away too.
    for (const [rung, onLeave] of [
      [supervisorRung, ['sup-1']],
      [LADDER[0], ['owner-1', 'sup-1']]
    ] as const) {
      const who = resolveRungRecipients({
        rung,
        owners: ['owner-1'],
        ownersOverCap: false,
        supervisorsOf,
        onLeave: new Set(onLeave)
      });
      expect(who).toEqual({ audience: 'hr_head', recipientIds: [], reroute: 'supervisor_on_leave' });
    }
    const w = fakeDeps({ items: [item('b', TWO_LATE)], onLeave: ['sup-1'], weeklySent: true });
    const r = await runHrDutyChase(w.deps);
    expect(r.plannedDeliveries).toBe(0);
    expect(w.sent).toHaveLength(0);
    expect(w.claims).toHaveLength(0);
    expect((r.detail.reroutes as any).supervisor_on_leave).toBe(1);
  });
});
