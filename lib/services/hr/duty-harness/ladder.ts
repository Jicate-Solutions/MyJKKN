// lib/services/hr/duty-harness/ladder.ts
// ============================================================================
// HR staff harness, build step 2 — the chase ladder, as PURE functions.
//
// Nothing in this file touches the database. Everything that decides WHO is
// chased, WHEN, and HOW MANY messages a run may send lives here so it can be
// tested against invented data (__tests__/hr/duty-harness-ladder.test.ts).
// The orchestrator (chase-service.ts) only feeds it rows and carries out the
// plan it returns.
//
// The ladder (design: artifacts/hr-staff-harness-design-2026-10-01.html,
// "The chase ladder"), counted in WORKING days after the due date:
//
//   at due      -> one in-app nudge to the owner, with the item opened
//   +1 day      -> WhatsApp nudge to the owner   (seeded OFF: not wired here)
//   +2 days     -> the owner's supervisor is told, marked late
//   +4 days     -> the item joins the HR head's WEEKLY late list (no message)
//   weekly      -> the Director gets ONE digest of late items per desk
//
// Guardrails enforced here:
//   * a working day is neither a weekly-off day nor a calendar holiday of the
//     item's institution, so nights, weekly offs and holidays pause the clock;
//   * nobody on approved leave today is chased: the item goes to the next rung
//     (their supervisor), and if that person is away too, to the HR head list;
//   * "blocked, because…" parks the item (no more owner nudges) and moves it
//     up one rung at once;
//   * the Director's digest is built from DESKS (a duty's queue at one
//     college) and carries no person, no item title and no count per person.
// ============================================================================

export const LADDER_AUDIENCES = ['owner', 'supervisor', 'hr_head'] as const;
export type LadderAudience = (typeof LADDER_AUDIENCES)[number];

export const LADDER_CHANNELS = ['in_app', 'whatsapp', 'weekly_list'] as const;
export type LadderChannel = (typeof LADDER_CHANNELS)[number];

/** One rung, exactly as it is stored in hr_duty_definitions.ladder. */
export interface LadderStep {
  key: string;
  after_working_days: number;
  audience: LadderAudience;
  channel: LadderChannel;
  enabled: boolean;
}

/** A row of hr_duty_definitions, as the engine needs it. */
export interface DutyDefinition {
  code: string;
  name: string;
  owningQueue: string;
  ownerRule: 'chain_step' | 'permission' | 'none';
  ownerPermissionKey: string | null;
  dueHours: number | null;
  dueWorkingDays: number | null;
  dueCalendarRule: string | null;
  ladder: LadderStep[];
  enabled: boolean;
  href: string | null;
}

/**
 * One thing waiting on somebody, produced by a per-duty source adapter.
 * `stageKey` separates the steps of a multi-step item (leave step 0 and leave
 * step 1 are different waits for different people), and is '' otherwise.
 */
export interface WaitingItem {
  dutyCode: string;
  itemId: string;
  stageKey: string;
  label: string;
  institutionId: string | null;
  /** When the wait for THIS stage began. */
  waitingSince: string;
  /** A per-item deadline date (YYYY-MM-DD) for 'before_item_deadline' rules. */
  deadlineDate?: string | null;
  /** A per-item due override in hours (e.g. a chain step's escalate_after_hours). */
  dueHoursOverride?: number | null;
  /** Owners named on the item itself (a pinned approver). */
  pinnedOwnerIds: string[];
  /** Role keys that own this stage when nobody is pinned. */
  ownerRoleKeys: string[];
  /**
   * 'institution' (default): a role holder owns the item only inside their own
   * college, unless the role's scope is 'all'. 'any': every holder of the role,
   * wherever they sit — how recruitment steps are matched on My Desk.
   */
  ownerRoleScope?: 'institution' | 'any';
  /** The person the item is ABOUT — never chased to approve their own item. */
  subjectProfileId: string | null;
  href: string;
}

export interface HarnessCalendar {
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: number[];
  /** `${institutionId}|YYYY-MM-DD` keys, from fn_hr_calendar_holiday_dates. */
  holidayKeys: Set<string>;
}

export interface BlockedMark {
  /** The ladder step the item had reached when it was marked. */
  atStepKey: string | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Dates. Everything is a campus (IST) calendar date.
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60 * 1000;

/** YYYY-MM-DD of the IST calendar day that contains `d`. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since IST midnight. */
export function istMinuteOfDay(d: Date): number {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date. */
export function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addCalendarDays(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** ISO week label, e.g. 2026-W40 — the dedupe key of the weekly lists. */
export function isoWeekLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The instant IST midnight begins on `dateISO`. */
export function istMidnight(dateISO: string): Date {
  return new Date(Date.parse(`${dateISO}T00:00:00Z`) - IST_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// Working days
// ---------------------------------------------------------------------------

export function holidayKey(institutionId: string, dateISO: string): string {
  return `${institutionId}|${dateISO}`;
}

export function isWorkingDay(
  dateISO: string,
  institutionId: string | null,
  cal: HarnessCalendar
): boolean {
  if (cal.weeklyOffDays.includes(weekdayOf(dateISO))) return false;
  if (institutionId && cal.holidayKeys.has(holidayKey(institutionId, dateISO))) return false;
  return true;
}

/**
 * The date `n` working days after `startISO` (the start day itself never
 * counts). Stops as soon as it passes `stopAfterISO`, returning a date after
 * it: a due date beyond today only has to be known to be in the future, and
 * holidays after today are not loaded.
 */
export function addWorkingDays(
  startISO: string,
  n: number,
  institutionId: string | null,
  cal: HarnessCalendar,
  stopAfterISO?: string
): string {
  let d = startISO;
  let left = Math.max(0, Math.floor(n));
  // A hard bound so a calendar that is all holidays cannot loop forever.
  for (let guard = 0; left > 0 && guard < 3660; guard++) {
    d = addCalendarDays(d, 1);
    if (stopAfterISO && d > stopAfterISO) return d;
    if (isWorkingDay(d, institutionId, cal)) left--;
  }
  return d;
}

/**
 * Working days strictly after `dueISO` up to and including `todayISO`.
 * Due today = 0; the next working day = 1. Negative never — a future due date
 * is 0 and is filtered out earlier by `dueAt > now`.
 */
export function workingDaysLate(
  dueISO: string,
  todayISO: string,
  institutionId: string | null,
  cal: HarnessCalendar
): number {
  let count = 0;
  let d = dueISO;
  for (let guard = 0; d < todayISO && guard < 3660; guard++) {
    d = addCalendarDays(d, 1);
    if (isWorkingDay(d, institutionId, cal)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Due time
// ---------------------------------------------------------------------------

export type DueRule = { kind: 'before_item_deadline'; days: number };

/**
 * The calendar rules the engine can evaluate. Anything else (the monthly and
 * yearly duties' rules, e.g. 'monthly_by_working_day:5') is stored for the
 * record but returns null here, which keeps that duty out of the run.
 */
export function parseDueCalendarRule(rule: string | null | undefined): DueRule | null {
  if (!rule) return null;
  const m = /^before_item_deadline:(\d{1,3})$/.exec(rule.trim());
  if (m) return { kind: 'before_item_deadline', days: Number(m[1]) };
  return null;
}

/**
 * When the item becomes due, or null when the duty has no rule the engine can
 * evaluate (or the item lacks the deadline its rule needs).
 *
 * Hour rules are counted in WORKING days (ceil(hours / 24)) from the day the
 * wait began, keeping the time of day: 48 hours filed on a Saturday afternoon
 * falls due on Tuesday afternoon, not Monday, because Sunday is paused. That is
 * the design's "nights and holidays pause the clock", at day granularity.
 *
 * A calendar rule and an hour rule on the same duty combine as the EARLIER of
 * the two (leave: 48 hours, and always before the leave starts).
 */
export function computeDueAt(
  def: Pick<DutyDefinition, 'dueHours' | 'dueWorkingDays' | 'dueCalendarRule'>,
  item: Pick<WaitingItem, 'waitingSince' | 'deadlineDate' | 'dueHoursOverride' | 'institutionId'>,
  cal: HarnessCalendar,
  todayISO: string
): Date | null {
  const candidates: Date[] = [];

  const hours = item.dueHoursOverride ?? def.dueHours;
  const days = def.dueWorkingDays ?? (hours != null && hours > 0 ? Math.ceil(hours / 24) : null);
  if (days != null) {
    const since = new Date(item.waitingSince);
    if (!Number.isNaN(since.getTime())) {
      const startISO = istDate(since);
      const dueISO = addWorkingDays(startISO, days, item.institutionId, cal, todayISO);
      const calendarDays = Math.round(
        (Date.parse(`${dueISO}T00:00:00Z`) - Date.parse(`${startISO}T00:00:00Z`)) / 86400000
      );
      candidates.push(new Date(since.getTime() + calendarDays * 86400000));
    }
  }

  const rule = parseDueCalendarRule(def.dueCalendarRule);
  if (rule && item.deadlineDate) {
    candidates.push(istMidnight(addCalendarDays(item.deadlineDate.slice(0, 10), -rule.days)));
  }

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates.map((c) => c.getTime())));
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/** Validate the stored ladder JSON. Returns null when it cannot be trusted. */
export function parseLadder(raw: unknown): LadderStep[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: LadderStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') return null;
    const r = s as Record<string, unknown>;
    const key = typeof r.key === 'string' ? r.key.trim() : '';
    const after = Number(r.after_working_days);
    if (!key || !Number.isInteger(after) || after < 0) return null;
    if (!LADDER_AUDIENCES.includes(r.audience as LadderAudience)) return null;
    if (!LADDER_CHANNELS.includes(r.channel as LadderChannel)) return null;
    out.push({
      key,
      after_working_days: after,
      audience: r.audience as LadderAudience,
      channel: r.channel as LadderChannel,
      enabled: r.enabled !== false
    });
  }
  const keys = new Set(out.map((s) => s.key));
  if (keys.size !== out.length) return null;
  return out.sort((a, b) => a.after_working_days - b.after_working_days);
}

/** The rungs a run actually walks: enabled, and on a channel this build sends. */
export function activeRungs(ladder: LadderStep[]): LadderStep[] {
  return ladder.filter((s) => s.enabled && s.channel !== 'whatsapp');
}

/**
 * Which rung the item stands on now, or -1 when it is not due.
 *
 * Time sets the floor: the highest rung whose offset has passed. A blocked mark
 * lifts the item one rung above where it was when marked, skipping owner rungs
 * (the owner said they cannot act; nudging them again is the one thing a
 * blocked mark must stop), and never lowers it.
 */
export function selectRungIndex(opts: {
  rungs: LadderStep[];
  due: boolean;
  lateWorkingDays: number;
  blocked: BlockedMark | null;
}): number {
  const { rungs, due, lateWorkingDays, blocked } = opts;
  let idx = -1;
  if (due) {
    for (let i = 0; i < rungs.length; i++) {
      if (rungs[i].after_working_days <= lateWorkingDays) idx = i;
    }
  }
  if (blocked) {
    const at = blocked.atStepKey ? rungs.findIndex((r) => r.key === blocked.atStepKey) : -1;
    let up = Math.max(at, 0) + (at >= 0 ? 1 : 0);
    // Marked before the item reached any rung: the first rung above the owner.
    while (up < rungs.length && rungs[up].audience === 'owner') up++;
    if (up < rungs.length) idx = Math.max(idx, up);
    // Parked: whatever time says, never back to the owner.
    while (idx >= 0 && idx < rungs.length && rungs[idx].audience === 'owner') idx++;
    if (idx >= rungs.length) idx = rungs.length - 1;
  }
  return idx;
}

export type RerouteReason =
  | 'owner_on_leave'
  | 'no_owner'
  | 'owners_over_cap'
  | 'no_supervisor'
  | 'supervisor_on_leave'
  | 'blocked';

export interface RungRecipients {
  /** Who the rung actually reaches after the guardrails. */
  audience: LadderAudience;
  recipientIds: string[];
  reroute: RerouteReason | null;
}

/**
 * The on-leave and missing-person guardrail. Nobody on approved leave today is
 * messaged; the item climbs one rung instead (owner -> supervisor -> HR head
 * list). The HR head rung sends nothing per item — it is a weekly list.
 */
export function resolveRungRecipients(opts: {
  rung: LadderStep;
  owners: string[];
  ownersOverCap: boolean;
  supervisorsOf: (profileIds: string[]) => string[];
  onLeave: Set<string>;
}): RungRecipients {
  const { rung, owners, ownersOverCap, supervisorsOf, onLeave } = opts;
  if (rung.audience === 'hr_head') {
    return { audience: 'hr_head', recipientIds: [], reroute: null };
  }

  const toSupervisors = (from: string[], why: RerouteReason | null): RungRecipients => {
    const all = supervisorsOf(from).filter((id) => !owners.includes(id));
    if (all.length === 0) {
      return { audience: 'hr_head', recipientIds: [], reroute: why ?? 'no_supervisor' };
    }
    const present = all.filter((id) => !onLeave.has(id));
    if (present.length === 0) {
      return { audience: 'hr_head', recipientIds: [], reroute: 'supervisor_on_leave' };
    }
    return { audience: 'supervisor', recipientIds: dedupe(present), reroute: why };
  };

  if (owners.length === 0) {
    return {
      audience: 'hr_head',
      recipientIds: [],
      reroute: ownersOverCap ? 'owners_over_cap' : 'no_owner'
    };
  }

  if (rung.audience === 'owner') {
    const present = owners.filter((id) => !onLeave.has(id));
    if (present.length > 0) {
      return { audience: 'owner', recipientIds: dedupe(present), reroute: null };
    }
    return toSupervisors(owners, 'owner_on_leave');
  }

  return toSupervisors(owners, null);
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

// ---------------------------------------------------------------------------
// The volume fuse
// ---------------------------------------------------------------------------

/**
 * Read the fuse from its policy value, defensively. A missing, negative or
 * nonsense value must never DISABLE the fuse — that is the failure it exists
 * to stop — so anything unusable falls back to the default.
 */
export function readFuseLimit(raw: unknown, fallback = 50): number {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n === 'number' && Number.isInteger(n) && n > 0) return n;
  return fallback;
}

/** Deliveries a planned send costs: one per recipient. */
export function countDeliveries(sends: Array<{ recipientIds: string[] }>): number {
  return sends.reduce((sum, s) => sum + s.recipientIds.length, 0);
}

export function fuseBlown(deliveries: number, limit: number): boolean {
  return deliveries > limit;
}

// ---------------------------------------------------------------------------
// Working hours ("nothing at night")
// ---------------------------------------------------------------------------

export interface WorkingHours {
  startMinute: number;
  endMinute: number;
}

/** "HH:MM" -> minutes, or null. */
export function parseClock(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function readWorkingHours(raw: unknown): WorkingHours {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const start = parseClock(r.start) ?? 9 * 60;
  const end = parseClock(r.end) ?? 18 * 60;
  return end > start ? { startMinute: start, endMinute: end } : { startMinute: 9 * 60, endMinute: 18 * 60 };
}

export function withinWorkingHours(now: Date, hours: WorkingHours): boolean {
  const m = istMinuteOfDay(now);
  return m >= hours.startMinute && m < hours.endMinute;
}

// ---------------------------------------------------------------------------
// The weekly lists
// ---------------------------------------------------------------------------

/** One item's standing at the end of planning, as the weekly lists see it. */
export interface ItemStanding {
  dutyCode: string;
  owningQueue: string;
  institutionId: string | null;
  institutionName: string;
  label: string;
  lateWorkingDays: number;
  /** Rung audience the item has reached, after guardrails. */
  audience: LadderAudience | null;
  blocked: boolean;
  reroute: RerouteReason | null;
}

export interface HrHeadListEntry {
  dutyCode: string;
  owningQueue: string;
  institutionName: string;
  label: string;
  lateWorkingDays: number;
  blocked: boolean;
}

/**
 * The HR head's weekly late list: every item that has reached the HR head rung
 * (by time, by a blocked mark, or because nobody below could be chased). It
 * names ITEMS and their desk, never the owner — the owner's numbers are for the
 * owner and their supervisor (design decision 3, recommended option).
 */
export function buildHrHeadList(standings: ItemStanding[]): HrHeadListEntry[] {
  return standings
    .filter((s) => s.audience === 'hr_head')
    .map((s) => ({
      dutyCode: s.dutyCode,
      owningQueue: s.owningQueue,
      institutionName: s.institutionName,
      label: s.label,
      lateWorkingDays: s.lateWorkingDays,
      blocked: s.blocked
    }))
    .sort(
      (a, b) =>
        b.lateWorkingDays - a.lateWorkingDays ||
        a.dutyCode.localeCompare(b.dutyCode) ||
        a.label.localeCompare(b.label)
    );
}

/** One desk = one duty's queue at one college. */
export interface DeskDigestRow {
  dutyCode: string;
  owningQueue: string;
  institutionName: string;
  lateItems: number;
  oldestLateWorkingDays: number;
  blockedItems: number;
  atHrHead: number;
}

/**
 * The Director's weekly digest: late items per DESK. By construction it holds
 * no profile id, no person's name and no item title — only the queue, the
 * college and counts (design decision 2 and guardrail "the Director sees desks
 * and duties, never a ranking of people").
 */
export function buildDirectorDigest(standings: ItemStanding[]): DeskDigestRow[] {
  const desks = new Map<string, DeskDigestRow>();
  for (const s of standings) {
    if (s.audience === null || s.lateWorkingDays < 1) continue;
    const key = `${s.dutyCode}|${s.institutionId ?? ''}`;
    const row =
      desks.get(key) ??
      ({
        dutyCode: s.dutyCode,
        owningQueue: s.owningQueue,
        institutionName: s.institutionName,
        lateItems: 0,
        oldestLateWorkingDays: 0,
        blockedItems: 0,
        atHrHead: 0
      } as DeskDigestRow);
    row.lateItems++;
    row.oldestLateWorkingDays = Math.max(row.oldestLateWorkingDays, s.lateWorkingDays);
    if (s.blocked) row.blockedItems++;
    if (s.audience === 'hr_head') row.atHrHead++;
    desks.set(key, row);
  }
  return [...desks.values()].sort(
    (a, b) =>
      b.lateItems - a.lateItems ||
      a.dutyCode.localeCompare(b.dutyCode) ||
      a.institutionName.localeCompare(b.institutionName)
  );
}

export function renderHrHeadList(entries: HrHeadListEntry[], max = 25): string {
  if (entries.length === 0) return 'Nothing has reached your late list this week.';
  const lines = entries
    .slice(0, max)
    .map(
      (e) =>
        `• [${e.dutyCode}] ${e.owningQueue}, ${e.institutionName}: ${e.label} — ` +
        `${e.lateWorkingDays} working day${e.lateWorkingDays === 1 ? '' : 's'} late` +
        (e.blocked ? ' (marked blocked)' : '')
    );
  if (entries.length > max) lines.push(`…and ${entries.length - max} more.`);
  return `${entries.length} item${entries.length === 1 ? ' is' : 's are'} on your late list this week.\n` + lines.join('\n');
}

export function renderDirectorDigest(rows: DeskDigestRow[], max = 20): string {
  if (rows.length === 0) return 'No HR desk has a late item this week.';
  const total = rows.reduce((s, r) => s + r.lateItems, 0);
  const lines = rows
    .slice(0, max)
    .map(
      (r) =>
        `• [${r.dutyCode}] ${r.owningQueue}, ${r.institutionName}: ${r.lateItems} late, ` +
        `oldest ${r.oldestLateWorkingDays} working day${r.oldestLateWorkingDays === 1 ? '' : 's'}` +
        (r.blockedItems > 0 ? `, ${r.blockedItems} marked blocked` : '')
    );
  if (rows.length > max) lines.push(`…and ${rows.length - max} more desks.`);
  return `${total} late item${total === 1 ? '' : 's'} across ${rows.length} desk${rows.length === 1 ? '' : 's'}.\n` + lines.join('\n');
}
