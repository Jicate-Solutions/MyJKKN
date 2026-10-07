// lib/services/hr/duty-harness/chase-service.ts
// ============================================================================
// HR staff harness, build step 2 — the run that walks the chase ladder.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT A NEW SUBJECT TYPE ON THE MEETING-TRIGGER ENGINE
// ---------------------------------------------------------------------------
// The platform already has an accountability engine: meeting_trigger_rules /
// meeting_trigger_events, the 24h "explain or meet" window, and
// bookPendingMeetings(). The Director's Desk handover chase extended it with a
// 'handover' subject type, and that was right for handovers, because a late
// handover's remedy IS a meeting between the Director and the grantee.
//
// It is the wrong remedy for an HR queue, and teaching it an 'hr_duty' subject
// would actively misfire:
//   * reconcileProjectExplanations() walks every subject event that is not a
//     handover, finds no action_responses row, and escalates it to
//     meeting_pending — so every late leave request would book a meeting;
//   * the design's ladder is a climb (owner -> supervisor -> HR head weekly list
//     -> Director weekly digest by desk), not a single explain-or-meet valve;
//   * guardrail "the Director sees desks, never people" is the opposite of the
//     engine's per-person judge/accountable pairing.
//
// So this is a small separate service that REUSES the engine's parts instead:
//   * dedupe: one ledger row per (duty, item, stage, rung), enforced by a UNIQUE
//     index — the same guard the trigger engine's partial unique index gives;
//   * the volume fuse and the always-written run log, from the handover chase
//     (director_handover_chase_runs): resolve every recipient first, and over
//     the limit send NOTHING, tell the Director alone, and stop;
//   * "on approved leave today" = an approved hr_leave_applications row that
//     covers today (the trigger engine's isStaffOnApprovedLeave predicate);
//   * holidays from fn_hr_calendar_holiday_dates via fetchHolidayKeys, the one
//     resolver HR attendance and payroll already use;
//   * delivery through fanoutNotification() with an idempotency key.
//
// ---------------------------------------------------------------------------
// THE ORDER OF A RUN
// ---------------------------------------------------------------------------
//   1. Weekly-off day, or outside working hours  -> record, send nothing.
//   2. Read every enabled duty and its waiting items; compute due and lateness.
//   3. Resolve owners, supervisors and who is on leave; plan every send.
//   4. Master switch OFF -> record the plan as a preview, send NOTHING, write
//      nothing to the ledger. This is the state the harness ships in.
//   5. Fuse: planned deliveries over the limit -> send nothing, tell the
//      Director alone, record the refusal.
//   6. Otherwise claim each ledger row, then send; write the weekly lists.
// ============================================================================

import {
  activeRungs,
  addCalendarDays,
  buildDirectorDigest,
  buildHrHeadList,
  computeDueAt,
  countDeliveries,
  fuseBlown,
  istDate,
  isoWeekLabel,
  isWorkingDay,
  readFuseLimit,
  readWorkingHours,
  renderDirectorDigest,
  renderHrHeadList,
  resolveRungRecipients,
  selectRungIndex,
  weekdayOf,
  withinWorkingHours,
  workingDaysLate,
  type BlockedMark,
  type DutyDefinition,
  type HarnessCalendar,
  type ItemStanding,
  type LadderAudience,
  type RerouteReason,
  type WaitingItem
} from './ladder';

// ---------------------------------------------------------------------------
// Policy keys (platform_policies, global scope) — seeded by 20270613101207.
// ---------------------------------------------------------------------------

export const HARNESS_POLICY_KEYS = {
  enabled: 'hr.harness.chase.enabled',
  maxMessagesPerRun: 'hr.harness.chase.max_messages_per_run',
  maxOwnersPerItem: 'hr.harness.chase.max_owners_per_item',
  workingHours: 'hr.harness.chase.working_hours',
  weeklyOffDays: 'hr.harness.chase.weekly_off_days',
  digestWeekday: 'hr.harness.chase.digest_weekday',
  hrHeadRoleKeys: 'hr.harness.chase.hr_head_role_keys'
} as const;

export interface HarnessPolicies {
  enabled: boolean;
  maxMessagesPerRun: number;
  maxOwnersPerItem: number;
  workingHours: ReturnType<typeof readWorkingHours>;
  weeklyOffDays: number[];
  digestWeekday: number;
  hrHeadRoleKeys: string[];
}

/**
 * Turn raw policy values into settings. The master switch is ON only for a
 * literal boolean true: a missing row, a typo or a string never turns the
 * chase on.
 */
export function readHarnessPolicies(raw: Record<string, unknown>): HarnessPolicies {
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const offDays = arr(raw[HARNESS_POLICY_KEYS.weeklyOffDays]).filter(
    (d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6
  );
  // null and '' would coerce to 0 (Sunday, the weekly off) and the lists would
  // never go out; only a real value counts.
  const rawWeekday = raw[HARNESS_POLICY_KEYS.digestWeekday];
  const weekday = rawWeekday === null || rawWeekday === '' ? NaN : Number(rawWeekday);
  const roleKeys = arr(raw[HARNESS_POLICY_KEYS.hrHeadRoleKeys]).filter(
    (k): k is string => typeof k === 'string' && k.trim() !== ''
  );
  return {
    enabled: raw[HARNESS_POLICY_KEYS.enabled] === true,
    maxMessagesPerRun: readFuseLimit(raw[HARNESS_POLICY_KEYS.maxMessagesPerRun], 50),
    maxOwnersPerItem: readFuseLimit(raw[HARNESS_POLICY_KEYS.maxOwnersPerItem], 5),
    workingHours: readWorkingHours(raw[HARNESS_POLICY_KEYS.workingHours]),
    weeklyOffDays: raw[HARNESS_POLICY_KEYS.weeklyOffDays] === undefined ? [0] : offDays,
    digestWeekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 1,
    hrHeadRoleKeys: roleKeys.length > 0 ? roleKeys : ['hr_head']
  };
}

// ---------------------------------------------------------------------------
// Dependencies — the database lives behind this interface (db-deps.ts), so
// the run itself is tested against in-memory fakes.
// ---------------------------------------------------------------------------

export interface LedgerClaim {
  dutyCode: string;
  itemId: string;
  stageKey: string;
  stepKey: string;
  audience: LadderAudience;
  itemLabel: string;
  institutionId: string | null;
  ownerProfileIds: string[];
  supervisorProfileIds: string[];
  recipientIds: string[];
  reroute: RerouteReason | null;
  blocked: boolean;
  dueAt: string;
  lateWorkingDays: number;
}

export interface OutgoingMessage {
  recipientIds: string[];
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
  category: string;
  metadata: Record<string, unknown>;
}

export type RunOutcome =
  | 'sent'
  | 'nothing_due'
  | 'switched_off'
  | 'outside_hours'
  | 'weekly_off'
  | 'halted_volume_fuse'
  | 'failed';

export interface ChaseRunRecord {
  runDate: string;
  isoWeek: string;
  outcome: RunOutcome;
  masterSwitch: boolean;
  fuseLimit: number;
  fuseBlown: boolean;
  itemsSeen: number;
  itemsDue: number;
  plannedDeliveries: number;
  sentDeliveries: number;
  weeklyListsDue: boolean;
  weeklyListsSent: boolean;
  /** Counts per duty and per reason. Never a profile id. */
  detail: Record<string, unknown>;
  errors: string[];
}

/**
 * Rows one source adapter loads per run (oldest first). When a source hits
 * it, the run cannot tell "left the queue" from "beyond the cap", so it does
 * not close any ledger rows for that duty that run.
 */
export const SOURCE_LOAD_LIMIT = 500;

/**
 * How long a run may work before it stops starting new work. The route's
 * maxDuration and the dispatcher's wait are both 120 s; the rest is left for
 * the run record to be written. Rungs left over go out on the next run.
 */
export const RUN_BUDGET_MS = 100_000;

/** An HR head and where they can see: every college, or their own. */
export interface HrHeadHolder {
  userId: string;
  scopeAll: boolean;
  institutionId: string | null;
}

export interface ChaseDeps {
  now: () => Date;
  loadPolicies(): Promise<Record<string, unknown>>;
  loadDefinitions(): Promise<DutyDefinition[]>;
  /**
   * null = this build has no source adapter for the duty. `truncated` = the
   * source returned SOURCE_LOAD_LIMIT rows, so more may be waiting.
   */
  collectItems(def: DutyDefinition): Promise<{ items: WaitingItem[]; truncated: boolean } | null>;
  loadHolidayKeys(institutionIds: string[], fromISO: string, toISO: string): Promise<Set<string>>;
  /** item key -> rung keys already reached (ledger). */
  loadReachedRungs(items: WaitingItem[]): Promise<Map<string, Set<string>>>;
  /**
   * item key -> (rung key -> ledger id) for rungs that were claimed with
   * recipients but whose send never finished (no notification id): the send
   * threw, or the run was stopped between the claim and the send. The run
   * sends these again; the notification's idempotency key stops a double send.
   */
  loadUnsentRungs(items: WaitingItem[]): Promise<Map<string, Map<string, string>>>;
  /** item key -> the active blocked mark. */
  loadBlockedMarks(items: WaitingItem[]): Promise<Map<string, BlockedMark>>;
  resolveOwners(def: DutyDefinition, item: WaitingItem): Promise<string[]>;
  /** profile id -> that person's supervisors (reporting line, else HOD). */
  resolveSupervisors(profileIds: string[]): Promise<Map<string, string[]>>;
  /** profile ids on approved leave covering `todayISO`. Throws on error. */
  loadOnLeave(profileIds: string[], todayISO: string): Promise<Set<string>>;
  resolveHrHeads(roleKeys: string[]): Promise<HrHeadHolder[]>;
  resolveDirectors(): Promise<string[]>;
  loadInstitutionNames(ids: string[]): Promise<Map<string, string>>;
  weeklyListsAlreadySent(isoWeek: string): Promise<boolean>;
  /** 'claimed' = new row; 'exists' = another run already reached this rung. */
  claimLedger(row: LedgerClaim): Promise<{ status: 'claimed' | 'exists'; id?: string }>;
  finishLedger(id: string, notificationId: string | null): Promise<void>;
  send(msg: OutgoingMessage): Promise<{ notified: number; notificationId?: string }>;
  /** Stamp ledger rows of items that are no longer waiting. */
  resolveCleared(dutyCode: string, stillWaitingKeys: Set<string>): Promise<number>;
  recordRun(run: ChaseRunRecord): Promise<void>;
}

/**
 * True from the digest weekday (0 = Sunday … 6 = Saturday) to the end of that
 * Monday-to-Sunday week. The once-a-week guard is separate.
 */
export function weeklyListsDueToday(todayISO: string, digestWeekday: number): boolean {
  const mondayOffset = (weekdayOf(todayISO) + 6) % 7;
  const digestOffset = (digestWeekday + 6) % 7;
  return mondayOffset >= digestOffset;
}

export function itemKey(i: Pick<WaitingItem, 'dutyCode' | 'itemId' | 'stageKey'>): string {
  return `${i.dutyCode}|${i.itemId}|${i.stageKey}`;
}

/** How far back the holiday calendar is loaded for due/lateness arithmetic. */
const CALENDAR_LOOKBACK_DAYS = 400;

interface PlannedRung {
  def: DutyDefinition;
  item: WaitingItem;
  claim: LedgerClaim;
  message: OutgoingMessage | null;
  /** Set when this rung was claimed by an earlier run but never sent. */
  resumeLedgerId: string | null;
}

export interface ChaseRunResult extends ChaseRunRecord {
  /** What the switch-off preview WOULD have sent: deliveries per duty. */
  preview: Record<string, number>;
}

function messageFor(
  def: DutyDefinition,
  item: WaitingItem,
  claim: LedgerClaim,
  reason: string | null
): OutgoingMessage {
  const late = claim.lateWorkingDays;
  const lateText =
    late <= 0 ? 'is due today' : `is ${late} working day${late === 1 ? '' : 's'} past its due time`;
  let title: string;
  let body: string;
  if (claim.audience === 'owner') {
    title = `Waiting on you: ${def.name}`;
    body = `${item.label} ${lateText}. Open it to act on it now.`;
  } else {
    title = `Late in your team: ${def.name}`;
    body = `${item.label} ${lateText}.`;
    if (claim.reroute === 'owner_on_leave') {
      body += ' The person it is waiting on is on approved leave today, so it has come to you.';
    } else if (claim.blocked) {
      body += ` It was marked blocked${reason ? `: ${reason}` : ''}. Please help unblock it.`;
    } else {
      body += ' Please help get it decided.';
    }
  }
  return {
    recipientIds: claim.recipientIds,
    title,
    body,
    url: item.href,
    idempotencyKey: `hr-duty:${claim.dutyCode}:${claim.itemId}:${claim.stageKey || '-'}:${claim.stepKey}`,
    category: 'hr:duty-chase',
    metadata: {
      duty_code: claim.dutyCode,
      item_id: claim.itemId,
      stage_key: claim.stageKey,
      step: claim.stepKey,
      audience: claim.audience,
      reroute: claim.reroute,
      late_working_days: late,
      source: 'cron:hr-duty-chase'
    }
  };
}

/**
 * One run. Never throws: every failure is recorded on the run row and in the
 * returned result, so the dispatcher's last_status and the run log agree.
 */
export async function runHrDutyChase(
  deps: ChaseDeps,
  opts: { budgetMs?: number } = {}
): Promise<ChaseRunResult> {
  const now = deps.now();
  const budgetMs = opts.budgetMs ?? RUN_BUDGET_MS;
  const outOfTime = () => deps.now().getTime() - now.getTime() > budgetMs;
  const todayISO = istDate(now);
  const isoWeek = isoWeekLabel(todayISO);
  const errors: string[] = [];
  const detail: Record<string, unknown> = {};
  const preview: Record<string, number> = {};

  const base = (p: HarnessPolicies | null): ChaseRunResult => ({
    runDate: todayISO,
    isoWeek,
    outcome: 'failed',
    masterSwitch: p?.enabled ?? false,
    fuseLimit: p?.maxMessagesPerRun ?? 0,
    fuseBlown: false,
    itemsSeen: 0,
    itemsDue: 0,
    plannedDeliveries: 0,
    sentDeliveries: 0,
    weeklyListsDue: false,
    weeklyListsSent: false,
    detail,
    errors,
    preview
  });

  const finish = async (r: ChaseRunResult): Promise<ChaseRunResult> => {
    try {
      const { preview: _p, ...record } = r;
      await deps.recordRun({ ...record, detail: { ...record.detail, preview: r.preview } });
    } catch (e: any) {
      r.errors.push(`record run: ${e?.message ?? String(e)}`);
    }
    return r;
  };

  let policies: HarnessPolicies;
  try {
    policies = readHarnessPolicies(await deps.loadPolicies());
  } catch (e: any) {
    errors.push(`policies: ${e?.message ?? String(e)}`);
    return finish(base(null));
  }
  const result = base(policies);

  // 1. Nothing at night, nothing on a weekly-off day.
  if (policies.weeklyOffDays.includes(weekdayOf(todayISO))) {
    result.outcome = 'weekly_off';
    return finish(result);
  }
  if (!withinWorkingHours(now, policies.workingHours)) {
    result.outcome = 'outside_hours';
    return finish(result);
  }

  try {
    // 2. Duties and their waiting items.
    const defs = (await deps.loadDefinitions()).filter((d) => d.enabled);
    const byDuty = new Map<string, { def: DutyDefinition; items: WaitingItem[]; truncated: boolean }>();
    const perDuty: Record<string, Record<string, number>> = {};
    for (const def of defs) {
      perDuty[def.code] = { waiting: 0, due: 0, planned: 0, skipped_holiday: 0 };
      if (activeRungs(def.ladder).length === 0) {
        perDuty[def.code].no_active_rungs = 1;
        continue;
      }
      try {
        const collected = await deps.collectItems(def);
        if (collected === null) {
          perDuty[def.code].no_source_adapter = 1;
          continue;
        }
        const { items, truncated } = collected;
        byDuty.set(def.code, { def, items, truncated });
        if (truncated) perDuty[def.code].truncated = 1;
        perDuty[def.code].waiting = items.length;
        result.itemsSeen += items.length;
      } catch (e: any) {
        errors.push(`collect ${def.code}: ${e?.message ?? String(e)}`);
      }
    }
    detail.duties = perDuty;

    const allItems = [...byDuty.values()].flatMap((d) => d.items);
    const instIds = [...new Set(allItems.map((i) => i.institutionId).filter(Boolean))] as string[];
    const holidayKeys = await deps.loadHolidayKeys(
      instIds,
      addCalendarDays(todayISO, -CALENDAR_LOOKBACK_DAYS),
      todayISO
    );
    const cal: HarnessCalendar = { weeklyOffDays: policies.weeklyOffDays, holidayKeys };

    const [reached, unsent, blockedMarks] = await Promise.all([
      deps.loadReachedRungs(allItems),
      deps.loadUnsentRungs(allItems),
      deps.loadBlockedMarks(allItems)
    ]);

    // Due + rung selection (pure), then owners for the items that are due.
    interface Candidate {
      def: DutyDefinition;
      item: WaitingItem;
      dueAt: Date;
      late: number;
      rungIdx: number;
      blocked: BlockedMark | null;
      owners: string[];
      ownersOverCap: boolean;
      holidayToday: boolean;
    }
    const candidates: Candidate[] = [];
    for (const { def, items } of byDuty.values()) {
      const rungs = activeRungs(def.ladder);
      for (const item of items) {
        const dueAt = computeDueAt(def, item, cal, todayISO);
        if (!dueAt) {
          perDuty[def.code].no_due_rule = (perDuty[def.code].no_due_rule ?? 0) + 1;
          continue;
        }
        const blocked = blockedMarks.get(itemKey(item)) ?? null;
        const due = dueAt.getTime() <= now.getTime();
        if (!due && !blocked) continue;
        const late = due ? workingDaysLate(istDate(dueAt), todayISO, item.institutionId, cal) : 0;
        const rungIdx = selectRungIndex({ rungs, due, lateWorkingDays: late, blocked });
        if (rungIdx < 0) continue;
        perDuty[def.code].due++;
        result.itemsDue++;
        candidates.push({
          def,
          item,
          dueAt,
          late,
          rungIdx,
          blocked,
          owners: [],
          ownersOverCap: false,
          // Holidays pause the clock AND the chase: nothing is sent about an
          // item on a day its college is closed.
          holidayToday: !isWorkingDay(todayISO, item.institutionId, cal)
        });
      }
    }

    for (const c of candidates) {
      if (outOfTime()) {
        throw new Error(
          `ran out of time working out owners (${budgetMs / 1000}s); nothing was claimed or sent this run`
        );
      }
      const owners = (await deps.resolveOwners(c.def, c.item)).filter(
        (id) => id && id !== c.item.subjectProfileId
      );
      const unique = [...new Set(owners)].sort();
      if (unique.length > policies.maxOwnersPerItem) {
        c.ownersOverCap = true;
        c.owners = [];
      } else {
        c.owners = unique;
      }
    }

    // 3. Supervisors and leave — for every owner and supervisor in play.
    const ownerIds = [...new Set(candidates.flatMap((c) => c.owners))];
    const supervisors = await deps.resolveSupervisors(ownerIds);
    const supervisorsOf = (ids: string[]) => [
      ...new Set(ids.flatMap((id) => supervisors.get(id) ?? []))
    ];
    const everyone = [...new Set([...ownerIds, ...supervisorsOf(ownerIds)])];
    const onLeave = await deps.loadOnLeave(everyone, todayISO);

    const institutionNames = await deps.loadInstitutionNames(instIds);
    const instName = (id: string | null) => (id ? institutionNames.get(id) ?? 'Unknown college' : 'All colleges');

    const planned: PlannedRung[] = [];
    const standings: ItemStanding[] = [];
    const reroutes: Record<string, number> = {};
    for (const c of candidates) {
      const rungs = activeRungs(c.def.ladder);
      const rung = rungs[c.rungIdx];
      const who = resolveRungRecipients({
        rung,
        owners: c.owners,
        ownersOverCap: c.ownersOverCap,
        supervisorsOf,
        onLeave
      });
      if (who.reroute) reroutes[who.reroute] = (reroutes[who.reroute] ?? 0) + 1;

      standings.push({
        dutyCode: c.def.code,
        owningQueue: c.def.owningQueue,
        institutionId: c.item.institutionId,
        institutionName: instName(c.item.institutionId),
        label: c.item.label,
        lateWorkingDays: c.late,
        audience: who.audience,
        blocked: !!c.blocked,
        reroute: who.reroute
      });

      if (c.holidayToday) {
        perDuty[c.def.code].skipped_holiday++;
        continue;
      }

      // A supervisor away on leave today is a passing reason: claiming the
      // rung now would mean they are never told once they are back. Leave it
      // unclaimed (the item is on the HR head's list today) and try again.
      if (rung.audience !== 'hr_head' && who.reroute === 'supervisor_on_leave') {
        perDuty[c.def.code].waiting_on_supervisor_return =
          (perDuty[c.def.code].waiting_on_supervisor_return ?? 0) + 1;
        continue;
      }

      // Send only when the item stands on a rung it has not reached before —
      // or on a rung an earlier run claimed but never managed to send.
      const unsentHere = unsent.get(itemKey(c.item)) ?? new Map<string, string>();
      const already = new Set(
        [...(reached.get(itemKey(c.item)) ?? new Set<string>())].filter((k) => !unsentHere.has(k))
      );
      const alreadyIdx = Math.max(-1, ...[...already].map((k) => rungs.findIndex((r) => r.key === k)));
      if (c.rungIdx <= alreadyIdx) continue;
      const resumeLedgerId = unsentHere.get(rung.key) ?? null;

      const claim: LedgerClaim = {
        dutyCode: c.def.code,
        itemId: c.item.itemId,
        stageKey: c.item.stageKey,
        stepKey: rung.key,
        audience: who.audience,
        itemLabel: c.item.label,
        institutionId: c.item.institutionId,
        ownerProfileIds: c.owners,
        supervisorProfileIds: supervisorsOf(c.owners),
        recipientIds: who.recipientIds,
        reroute: who.reroute ?? (c.blocked ? 'blocked' : null),
        blocked: !!c.blocked,
        dueAt: c.dueAt.toISOString(),
        lateWorkingDays: c.late
      };
      const message =
        who.recipientIds.length > 0 ? messageFor(c.def, c.item, claim, c.blocked?.reason ?? null) : null;
      planned.push({ def: c.def, item: c.item, claim, message, resumeLedgerId });
      perDuty[c.def.code].planned += who.recipientIds.length;
    }
    detail.reroutes = reroutes;

    // Weekly lists: on the digest weekday, or the first run after it in the
    // same Monday-to-Sunday week (a holiday or a missed run does not lose the
    // week), and once per ISO week.
    result.weeklyListsDue =
      weeklyListsDueToday(todayISO, policies.digestWeekday) &&
      !(await deps.weeklyListsAlreadySent(isoWeek));

    const weeklyMessages: OutgoingMessage[] = [];
    if (result.weeklyListsDue) {
      const [hrHeads, directors] = await Promise.all([
        deps.resolveHrHeads(policies.hrHeadRoleKeys),
        deps.resolveDirectors()
      ]);
      const hrHeadList = buildHrHeadList(standings);
      const digest = buildDirectorDigest(standings);
      // One holder may hold the role twice; any 'all' grant means every college.
      const reachOf = new Map<string, HrHeadHolder>();
      for (const h of hrHeads) {
        const prev = reachOf.get(h.userId);
        reachOf.set(h.userId, prev ? { ...prev, scopeAll: prev.scopeAll || h.scopeAll } : h);
      }
      const hrHeadsAway = await deps.loadOnLeave([...reachOf.keys()], todayISO);
      const hrHeadsPresent = [...reachOf.values()].filter((h) => !hrHeadsAway.has(h.userId));
      // An HR head sees only their own college's people, unless their role
      // reaches every college. An item with no college goes to the latter only.
      // One list per reach, so a list never carries another college's names.
      const groups = new Map<string, string[]>();
      for (const h of hrHeadsPresent) {
        const reach = h.scopeAll ? '*' : h.institutionId;
        if (!reach) continue;
        groups.set(reach, [...(groups.get(reach) ?? []), h.userId]);
      }
      const reachedItems = new Set<number>();
      for (const [reach, ids] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const mine = standings
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => reach === '*' || s.institutionId === reach);
        const list = buildHrHeadList(mine.map(({ s }) => s));
        if (list.length === 0) continue;
        for (const { s, i } of mine) if (s.audience === 'hr_head') reachedItems.add(i);
        weeklyMessages.push({
          recipientIds: [...new Set(ids)].sort(),
          title: `HR late list — week ${isoWeek}`,
          body: renderHrHeadList(list),
          url: '/hr',
          idempotencyKey: `hr-duty:hr-head-list:${isoWeek}:${reach === '*' ? 'all' : reach}`,
          category: 'hr:duty-chase-weekly',
          metadata: { iso_week: isoWeek, items: list.length, source: 'cron:hr-duty-chase' }
        });
      }
      const unreached = hrHeadList.length - reachedItems.size;
      detail.weekly = {
        hr_head_list_items: hrHeadList.length,
        hr_head_recipients: hrHeadsPresent.length,
        hr_head_lists: weeklyMessages.length,
        digest_desks: digest.length,
        director_recipients: directors.length
      };
      if (unreached > 0) {
        errors.push(
          `weekly: ${unreached} item${unreached === 1 ? '' : 's'} on the HR head late list reached no HR head for that college`
        );
      }
      if (directors.length > 0) {
        weeklyMessages.push({
          recipientIds: directors,
          title: `HR desks — late items, week ${isoWeek}`,
          body: renderDirectorDigest(digest),
          url: '/hr',
          idempotencyKey: `hr-duty:director-digest:${isoWeek}`,
          category: 'hr:duty-chase-weekly',
          metadata: { iso_week: isoWeek, desks: digest.length, source: 'cron:hr-duty-chase' }
        });
      } else {
        errors.push('weekly: no Director could be resolved for the digest');
      }
    }

    const sends = planned.filter((p) => p.message).map((p) => p.message as OutgoingMessage);
    result.plannedDeliveries = countDeliveries(sends) + countDeliveries(weeklyMessages);
    for (const p of planned) {
      if (p.message) preview[p.def.code] = (preview[p.def.code] ?? 0) + p.message.recipientIds.length;
    }
    if (weeklyMessages.length > 0) preview.weekly = countDeliveries(weeklyMessages);

    // 4. The master switch. Off = a preview only: no send, no ledger write.
    if (!policies.enabled) {
      result.outcome = 'switched_off';
      return finish(result);
    }

    // 5. The volume fuse — decided on the whole run before anything goes out.
    if (fuseBlown(result.plannedDeliveries, policies.maxMessagesPerRun)) {
      result.fuseBlown = true;
      result.outcome = 'halted_volume_fuse';
      try {
        const directors = await deps.resolveDirectors();
        if (directors.length > 0) {
          await deps.send({
            recipientIds: directors,
            title: 'HR chase stopped itself — nothing was sent',
            body:
              `Today's HR chase run worked out ${result.plannedDeliveries} messages, and the safety ` +
              `limit is ${policies.maxMessagesPerRun}. It sent none of them. Either a queue is far ` +
              `behind or who-to-chase was worked out wrongly; the run log has the counts per duty.`,
            url: '/hr',
            idempotencyKey: `hr-duty:fuse:${todayISO}`,
            category: 'hr:duty-chase-fuse',
            metadata: {
              planned: result.plannedDeliveries,
              limit: policies.maxMessagesPerRun,
              source: 'cron:hr-duty-chase'
            }
          });
        }
      } catch (e: any) {
        errors.push(`fuse alert: ${e?.message ?? String(e)}`);
      }
      return finish(result);
    }

    // 6. Carry out the plan. Claim first, so two overlapping runs cannot both
    //    send the same rung; the notification's idempotency key is a second guard.
    //    A claim whose send fails stays without a notification id, and the
    //    next run sends it again (loadUnsentRungs).
    let stoppedAt = -1;
    for (let n = 0; n < planned.length; n++) {
      const p = planned[n];
      if (outOfTime()) {
        stoppedAt = n;
        break;
      }
      try {
        let ledgerId: string | null = p.resumeLedgerId;
        if (!ledgerId) {
          const claim = await deps.claimLedger(p.claim);
          if (claim.status === 'exists') continue;
          ledgerId = claim.id ?? null;
        }
        let notificationId: string | null = null;
        if (p.message) {
          const out = await deps.send(p.message);
          result.sentDeliveries += out.notified;
          notificationId = out.notificationId ?? null;
        }
        if (ledgerId) await deps.finishLedger(ledgerId, notificationId);
      } catch (e: any) {
        errors.push(`send ${p.claim.dutyCode} ${p.claim.itemId}: ${e?.message ?? String(e)}`);
      }
    }
    if (stoppedAt >= 0) {
      detail.deadline = { not_started: planned.length - stoppedAt };
      errors.push(
        `ran out of time: ${planned.length - stoppedAt} planned rung(s) were left for the next run`
      );
    }
    let weeklyFailures = 0;
    for (const m of weeklyMessages) {
      if (outOfTime()) {
        weeklyFailures++;
        errors.push(`weekly send: ran out of time; left for the next run`);
        continue;
      }
      try {
        const out = await deps.send(m);
        result.sentDeliveries += out.notified;
      } catch (e: any) {
        weeklyFailures++;
        errors.push(`weekly send: ${e?.message ?? String(e)}`);
      }
    }
    // Only a week whose lists all went out counts as sent; otherwise the next
    // run tries again (the idempotency keys stop a list going twice).
    result.weeklyListsSent = result.weeklyListsDue && weeklyMessages.length > 0 && weeklyFailures === 0;

    // Items that left their queue close their ledger rows (the on-time record
    // the duty tower will read later). Only for duties whose collection worked
    // and was complete: a source cut off at SOURCE_LOAD_LIMIT cannot tell an
    // item that left from one beyond the cap.
    let cleared = 0;
    const clearSkipped: string[] = [];
    for (const [code, { items, truncated }] of byDuty) {
      if (truncated || outOfTime()) {
        clearSkipped.push(code);
        continue;
      }
      try {
        cleared += await deps.resolveCleared(code, new Set(items.map(itemKey)));
      } catch (e: any) {
        errors.push(`clear ${code}: ${e?.message ?? String(e)}`);
      }
    }
    detail.cleared = cleared;
    if (clearSkipped.length > 0) detail.clear_skipped = clearSkipped;

    result.outcome = planned.length === 0 && weeklyMessages.length === 0 ? 'nothing_due' : 'sent';
    return finish(result);
  } catch (e: any) {
    // Holiday or leave lookups throw rather than guess: sending to someone on
    // leave, or on a holiday, is worse than not sending today.
    errors.push(e?.message ?? String(e));
    result.outcome = 'failed';
    return finish(result);
  }
}
