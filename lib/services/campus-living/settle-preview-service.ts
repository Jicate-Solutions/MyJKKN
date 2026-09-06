// ============================================================================
// The practice run — every hostel bill the settle process WOULD send.
// ============================================================================
// Director's condition before settle-then-bill is ever switched on (2026-08-10):
// "the system works out every bill it WOULD send — who, how much, which room —
// and writes nothing. I read the list, and only then do we do it for real."
//
// THIS FILE WRITES NOTHING. Every call below is a read or a DRY RUN. There is
// no code path here that passes dry_run = false, and no INSERT/UPDATE/DELETE.
//
// It owns NO fee arithmetic. Every rupee comes from the two canonical sources
// the biller itself is measured against:
//   • fn_settle_room_annual_cost  — the one place a room's annual cost is read
//   • settlementCharge / computeFeeBreakdown — the engine whose agreement the
//     biller's own parity gate requires before it is allowed to bill anyone.
//     It reports the EMPTY BEDS only: the settled room share minus the one bed
//     the resident already pays for via the fee structure + upgrade differential.
//
// TWO SOURCES, ALWAYS LABELLED
// ---------------------------------------------------------------------------
// fn_settle_bill_close RAISEs 42501 while the master switch is off — even in
// dry-run mode — and fn_settle_window_open is inert while off, so no settle
// window has ever opened. That means the engine's own dry run cannot produce a
// practice run in the exact state the Director needs to read one in. So:
//
//   'engine_dry_run'  — settle windows are due; the figures are the biller's
//                       own dry-run output, line for line. Full fidelity.
//   'room_projection' — no window is due (the normal state while the mechanism
//                       is off). The figures are today's real occupancy run
//                       through the canonical fee engine: the same arithmetic
//                       the biller must reproduce before it may bill. Two skip
//                       rules the biller applies are NOT mirrored here (see
//                       PROJECTION_CAVEAT), and both only ever REMOVE bills —
//                       so the projection is an upper bound, never an undercount.
//
// The page states which source produced the numbers. A report that quietly
// mixes them would be worse than no report.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { POLICY_KEYS } from '@/lib/policies/keys';
import {
  settlementCharge,
  creditLateJoins,
  closeSettleWindow,
  listDueSettleWindows,
  listLateJoinDue,
  type SettleCloseResult,
  type SettleLateJoinResult,
} from '@/lib/services/campus-living/settle-bill-service';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'campus-living/settle-preview';

type Client = SupabaseClient<any, any, any>;

const ENGINE_NOTE =
  'These are the billing engine’s own figures, produced by running it in practice mode on the ' +
  'rooms whose waiting period has ended. Line for line, this is what it would send.';

const PROJECTION_NOTE =
  'No room’s waiting period has ended, because the settle process has never been switched on — ' +
  'so the engine has nothing of its own to show yet. Instead, every room that has residents ' +
  'today has been priced by the same fee engine the biller must agree with before it is allowed ' +
  'to bill anyone. ';

/** What the projection deliberately does not model. Rendered verbatim on the page. */
const PROJECTION_CAVEAT =
  'The biller also skips a resident who is on a flat hostel package, and one who already ' +
  'carries this year’s hostel bill. Already-billed residents ARE excluded below. Flat-package ' +
  'residents are not, so the real run can only come out smaller than this list — never larger.';

/** Rows fetched in one page. Guards the silent PostgREST 10,000-row ceiling. */
const ALLOCATION_ROW_CAP = 5000;
/** Parallel fn_settle_room_annual_cost calls in flight. */
const ROOM_PRICE_CONCURRENCY = 12;

export interface SettlePolicySnapshot {
  /** True once the hostel.settle_bill.* rows exist — i.e. the migration is applied. */
  installed: boolean;
  enabled: boolean;
  windowDays: number;
  outerLimitDays: number;
  billDueDays: number;
}

export type SettleSkipReason = 'not_a_learner' | 'already_billed' | 'flat_package' | 'no_rate';

export interface SettlePreviewLine {
  allocation_id: string;
  /** learners_profiles.id — the id a bill is written against. Null when not a learner. */
  learner_id: string | null;
  learner_name: string;
  block_name: string;
  room_number: string;
  capacity: number;
  occupants: number;
  /** What this resident would be billed. 0 when she would be skipped. */
  amount: number;
  would_be_billed: boolean;
  skip_reason: SettleSkipReason | null;
  /** One learner alone in a room built for more — she carries every bed. */
  sole_occupant: boolean;
}

export interface SettlePreviewRoom {
  room_id: string;
  block_name: string;
  room_number: string;
  capacity: number;
  occupants: number;
  /**
   * What each resident would be BILLED for the empty beds — the settled share
   * at today's occupancy minus the one bed she already pays for. 0 when the room
   * is full or cannot be priced.
   */
  share_per_resident: number;
  /** Set when the room has no category or no active fee row — nothing can be billed. */
  unpriced_reason: string | null;
  sole_occupant: boolean;
  lines: SettlePreviewLine[];
}

export interface SettlePreviewTotals {
  learners: number;
  rooms: number;
  amount: number;
  soleOccupancyLearners: number;
  soleOccupancyAmount: number;
  skipped: number;
}

export type SettlePreviewSource = 'engine_dry_run' | 'room_projection';

export type SettlePreviewStatus =
  | 'ok'
  /** The settle migration has not been applied here — nothing exists to preview. */
  | 'not_installed'
  /** Installed, but no hostel year is marked current, so no room can be priced. */
  | 'no_hostel_year'
  | 'error';

export interface SettlePracticeRun {
  status: SettlePreviewStatus;
  source: SettlePreviewSource | null;
  /** Plain-English explanation for every status other than 'ok'. */
  message: string | null;
  /** Plain-English statement of which source produced the figures, and its limits. */
  sourceNote: string | null;
  policy: SettlePolicySnapshot;
  rooms: SettlePreviewRoom[];
  totals: SettlePreviewTotals;
  /** Late-join credits that would be issued, from their own dry run. */
  credits: SettleLateJoinResult[];
  creditsMessage: string | null;
  /** Set when the allocation fetch hit ALLOCATION_ROW_CAP — the list is partial. */
  truncated: boolean;
  generatedAt: string;
}

interface PgLikeError {
  code?: string | null;
  message?: string | null;
}

/** The settle objects are absent — the (Director-gated) migration is unapplied. */
function isMissingObject(error: PgLikeError | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST202' || code === '42883' || code === '42P01') return true;
  return /does not exist|schema cache/i.test(error.message ?? '');
}

/** The master switch is off and the callee refuses (fn_settle_bill_close does this). */
function isSwitchedOff(error: PgLikeError | null): boolean {
  if (!error) return false;
  return error.code === '42501' || /is disabled|permission denied/i.test(error.message ?? '');
}

const POLICY_DEFAULTS: Omit<SettlePolicySnapshot, 'installed'> = {
  enabled: false,
  windowDays: 5,
  outerLimitDays: 20,
  billDueDays: 5,
};

/**
 * The four hostel.settle_bill.* policy rows, read straight from
 * platform_policies. Absent rows mean the migration is unapplied — everything
 * reads OFF, which is also the seeded truth.
 */
export async function getSettlePolicySnapshot(client: Client): Promise<SettlePolicySnapshot> {
  const { data, error } = await client
    .from('platform_policies')
    .select('policy_key, value')
    .like('policy_key', 'hostel.settle_bill.%')
    .eq('scope_type', 'global')
    .eq('is_active', true);

  if (error || !data?.length) return { ...POLICY_DEFAULTS, installed: false };

  const byKey = new Map<string, unknown>(
    (data as { policy_key: string; value: unknown }[]).map((r) => [r.policy_key, r.value])
  );
  const num = (k: string, d: number) => {
    const v = byKey.get(k);
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  };

  return {
    installed: byKey.has(POLICY_KEYS.HOSTEL_SETTLE_BILL_ENABLED),
    enabled: byKey.get(POLICY_KEYS.HOSTEL_SETTLE_BILL_ENABLED) === true,
    windowDays: num(POLICY_KEYS.HOSTEL_SETTLE_BILL_WINDOW_DAYS, POLICY_DEFAULTS.windowDays),
    outerLimitDays: num(
      POLICY_KEYS.HOSTEL_SETTLE_BILL_OUTER_LIMIT_DAYS,
      POLICY_DEFAULTS.outerLimitDays
    ),
    billDueDays: num(POLICY_KEYS.HOSTEL_SETTLE_BILL_BILL_DUE_DAYS, POLICY_DEFAULTS.billDueDays),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const EMPTY_TOTALS: SettlePreviewTotals = {
  learners: 0,
  rooms: 0,
  amount: 0,
  soleOccupancyLearners: 0,
  soleOccupancyAmount: 0,
  skipped: 0,
};

function totalsOf(rooms: SettlePreviewRoom[]): SettlePreviewTotals {
  const t = { ...EMPTY_TOTALS };
  for (const room of rooms) {
    let billedHere = 0;
    for (const line of room.lines) {
      if (!line.would_be_billed) {
        t.skipped += 1;
        continue;
      }
      billedHere += 1;
      t.learners += 1;
      t.amount += line.amount;
      if (line.sole_occupant) {
        t.soleOccupancyLearners += 1;
        t.soleOccupancyAmount += line.amount;
      }
    }
    if (billedHere > 0) t.rooms += 1;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Source A — the engine's own dry run. Only reachable when a settle window is
// due, which requires the mechanism to have been switched on at some point.
// ---------------------------------------------------------------------------

interface RoomLabel {
  block_name: string;
  room_number: string;
}

async function labelRooms(client: Client, roomIds: string[]): Promise<Map<string, RoomLabel>> {
  const labels = new Map<string, RoomLabel>();
  if (roomIds.length === 0) return labels;
  const { data } = await client
    .from('hostel_rooms')
    .select('id, room_number, hostel_blocks(name)')
    .in('id', roomIds);
  for (const r of (data ?? []) as any[]) {
    labels.set(r.id, {
      block_name: r.hostel_blocks?.name ?? '—',
      room_number: r.room_number ?? '—',
    });
  }
  return labels;
}

async function nameLearners(client: Client, learnerIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (learnerIds.length === 0) return names;
  const { data } = await client
    .from('profiles')
    .select('learner_id, full_name')
    .in('learner_id', learnerIds);
  for (const p of (data ?? []) as { learner_id: string | null; full_name: string | null }[]) {
    if (p.learner_id) names.set(p.learner_id, p.full_name ?? '—');
  }
  return names;
}

async function fromEngineDryRun(
  client: Client,
  due: { room_id: string; window_id: string }[]
): Promise<SettlePreviewRoom[]> {
  // dryRun = true on every call. closeSettleWindow's dry path calls
  // fn_settle_bill_close(p_dry_run => true), which writes nothing.
  const results: SettleCloseResult[] = await mapWithConcurrency(due, 4, (d) =>
    closeSettleWindow(client, d.room_id, true, d.window_id)
  );

  const labels = await labelRooms(
    client,
    results.map((r) => r.room_id)
  );
  const learnerIds = results.flatMap((r) =>
    (r.lines ?? []).map((l) => l.learner_id).filter((id): id is string => Boolean(id))
  );
  const names = await nameLearners(client, Array.from(new Set(learnerIds)));

  const rooms: SettlePreviewRoom[] = results.map((r) => {
    const label = labels.get(r.room_id) ?? { block_name: '—', room_number: '—' };
    const capacity = Number(r.capacity ?? 0);
    const occupants = Number(r.active_occupants ?? 0);
    const sole = occupants === 1 && capacity > 1;

    return {
      room_id: r.room_id,
      block_name: label.block_name,
      room_number: label.room_number,
      capacity,
      occupants,
      share_per_resident: Number(r.share_per_resident ?? 0),
      unpriced_reason: r.status === 'no_rate' ? (r.reason ?? 'no_rate') : null,
      sole_occupant: sole,
      lines: (r.lines ?? []).map((l) => ({
        allocation_id: l.allocation_id,
        learner_id: l.learner_id ?? null,
        learner_name: (l.learner_id && names.get(l.learner_id)) || '—',
        block_name: label.block_name,
        room_number: label.room_number,
        capacity,
        occupants,
        amount: Number(l.amount ?? 0),
        would_be_billed: l.action === 'would_bill',
        skip_reason: l.action === 'skipped' ? ((l.reason ?? null) as SettleSkipReason | null) : null,
        sole_occupant: sole,
      })),
    };
  });

  // Biggest bills first — that is what the Director is reading for.
  rooms.sort((a, b) => b.share_per_resident - a.share_per_resident);
  return rooms;
}

// ---------------------------------------------------------------------------
// Source B — the room projection. Today's real occupancy, priced by the
// canonical engine. Used when no settle window is due, which is the state the
// Director will read this page in.
// ---------------------------------------------------------------------------

interface ActiveResident {
  allocation_id: string;
  room_id: string;
  room_number: string;
  capacity: number;
  category_id: string | null;
  block_name: string;
  /** learners_profiles.id, via profiles.learner_id. Null = not a learner. */
  learner_id: string | null;
  learner_name: string;
}

async function fetchActiveResidents(
  client: Client
): Promise<{ residents: ActiveResident[]; truncated: boolean }> {
  // Occupancy exactly as fn_settle_bill_close defines it: check_out_date IS NULL.
  // (There is a second "has left" date on this table; the biller reads only this
  // one, so the practice run must read only this one too.)
  const { data, error } = await client
    .from('hostel_allocations')
    .select(
      'id, room_id, ' +
        'learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, learner_id), ' +
        'hostel_rooms(id, room_number, capacity, category_id), ' +
        'hostel_blocks(name)'
    )
    .is('check_out_date', null)
    .order('check_in_date', { ascending: true })
    .limit(ALLOCATION_ROW_CAP);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as any[];
  const residents: ActiveResident[] = rows
    .filter((r) => r.room_id && r.hostel_rooms)
    .map((r) => ({
      allocation_id: r.id,
      room_id: r.room_id,
      room_number: r.hostel_rooms?.room_number ?? '—',
      capacity: Number(r.hostel_rooms?.capacity ?? 0),
      category_id: r.hostel_rooms?.category_id ?? null,
      block_name: r.hostel_blocks?.name ?? '—',
      learner_id: r.learner?.learner_id ?? null,
      learner_name: r.learner?.full_name ?? '—',
    }));

  return { residents, truncated: rows.length >= ALLOCATION_ROW_CAP };
}

/**
 * The biller's dedup key, read rather than re-derived: a learner who already
 * carries this hostel year's room bill is skipped, so the practice run must
 * skip her too or it overstates the total.
 */
/**
 * The 'Hostel Empty Bed Settlement' revenue head — the only category this
 * mechanism ever bills to. Null when the row is missing, which the biller also
 * refuses on, so the preview reports the same refusal rather than pricing a
 * bill that could not be raised.
 */
async function fetchSettlementCategoryId(client: Client): Promise<string | null> {
  const { data, error } = await client.rpc('fn_settle_billing_category');
  if (error) {
    logger.warn(LOG, 'Could not resolve the empty-bed settlement billing category', {
      message: error.message,
    });
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Learners who already hold a settlement bill for this hostel year.
 *
 * Keyed on the SETTLEMENT head alone. The previous version collected
 * `student|item_category_id` across fee_source academic + hostel_category and
 * was then looked up with a hostel_categories.id — two different id domains, so
 * it never matched anything. Widening it back would be worse than useless now:
 * every learner in a premium room holds an upgrade-differential bill, and
 * matching on that would skip all of them.
 */
async function fetchAlreadyBilled(
  client: Client,
  hostelYearId: string,
  learnerIds: string[],
  settlementCategoryId: string | null
): Promise<Set<string>> {
  const billed = new Set<string>();
  if (!settlementCategoryId) return billed;

  const CHUNK = 150;
  for (let i = 0; i < learnerIds.length; i += CHUNK) {
    const { data, error } = await client
      .from('billing_student_bills')
      .select('student_id')
      .eq('hostel_year_id', hostelYearId)
      .eq('item_category_id', settlementCategoryId)
      .eq('fee_source', 'hostel_category')
      .not('status', 'in', '("cancelled","superseded")')
      .in('student_id', learnerIds.slice(i, i + CHUNK));
    if (error) {
      // Cannot see the existing bills — say nothing rather than guess wrong.
      logger.warn(LOG, 'Could not read existing settlement bills for the dedup check', {
        message: error.message,
      });
      return billed;
    }
    for (const b of (data ?? []) as { student_id: string }[]) {
      billed.add(b.student_id);
    }
  }
  return billed;
}

async function fromRoomProjection(
  client: Client,
  hostelYearId: string
): Promise<{ rooms: SettlePreviewRoom[]; truncated: boolean }> {
  const { residents, truncated } = await fetchActiveResidents(client);

  const byRoom = new Map<string, ActiveResident[]>();
  for (const r of residents) {
    const list = byRoom.get(r.room_id);
    if (list) list.push(r);
    else byRoom.set(r.room_id, [r]);
  }

  const roomIds = Array.from(byRoom.keys());

  // The one place a room's annual cost is read — the same helper the biller uses.
  const costs = await mapWithConcurrency(roomIds, ROOM_PRICE_CONCURRENCY, async (roomId) => {
    const { data, error } = await client.rpc('fn_settle_room_annual_cost' as never, {
      p_room_id: roomId,
      p_hostel_year_id: hostelYearId,
    } as never);
    if (error) return { roomId, cost: null as any, reason: error.message };
    return { roomId, cost: data as any, reason: null as string | null };
  });
  const costByRoom = new Map(costs.map((c) => [c.roomId, c]));

  const settlementCategoryId = await fetchSettlementCategoryId(client);
  const alreadyBilled = await fetchAlreadyBilled(
    client,
    hostelYearId,
    Array.from(new Set(residents.map((r) => r.learner_id).filter((id): id is string => !!id))),
    settlementCategoryId
  );

  const rooms: SettlePreviewRoom[] = roomIds.map((roomId) => {
    const group = byRoom.get(roomId)!;
    const occupants = group.length;
    const first = group[0];
    const entry = costByRoom.get(roomId);
    const cost = entry?.cost;
    const priced = cost && cost.found === true;

    const capacity = priced ? Number(cost.capacity ?? first.capacity) : first.capacity;
    const sole = occupants === 1 && capacity > 1;

    // The EMPTY BEDS only — settled share minus the one bed she already pays
    // for. Same derivation the parity gate uses to authorize the biller, so the
    // practice run and the bill can never disagree.
    const share = priced
      ? settlementCharge(
          {
            capacity,
            per_bed_annual_rate: Number(cost.per_bed_annual_rate ?? 0),
            ac_tonnage: Number(cost.ac_tonnage ?? 0),
            ac_base_inr_per_month_24h: Number(cost.ac_base_inr_per_month_24h ?? 0),
          },
          occupants
        )
      : 0;

    const unpriced_reason = priced
      ? null
      : (cost?.reason as string | undefined) || entry?.reason || 'no_rate';

    const lines: SettlePreviewLine[] = group.map((r) => {
      let skip: SettleSkipReason | null = null;
      if (!r.learner_id) skip = 'not_a_learner';
      else if (!priced) skip = 'no_rate';
      else if (alreadyBilled.has(r.learner_id)) skip = 'already_billed';

      return {
        allocation_id: r.allocation_id,
        learner_id: r.learner_id,
        learner_name: r.learner_name,
        block_name: r.block_name,
        room_number: r.room_number,
        capacity,
        occupants,
        amount: skip ? 0 : share,
        would_be_billed: !skip,
        skip_reason: skip,
        sole_occupant: sole,
      };
    });

    return {
      room_id: roomId,
      block_name: first.block_name,
      room_number: first.room_number,
      capacity,
      occupants,
      share_per_resident: share,
      unpriced_reason,
      sole_occupant: sole,
      lines,
    };
  });

  // Biggest bills first — that is what the Director is reading for.
  rooms.sort((a, b) => b.share_per_resident - a.share_per_resident);
  return { rooms, truncated };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function emptyRun(
  status: SettlePreviewStatus,
  message: string,
  policy: SettlePolicySnapshot
): SettlePracticeRun {
  return {
    status,
    source: null,
    message,
    sourceNote: null,
    policy,
    rooms: [],
    totals: { ...EMPTY_TOTALS },
    credits: [],
    creditsMessage: null,
    truncated: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Late-join credits that would be issued, from their own dry run.
 *
 * A room owing a credit is already 'billed', so it can never appear in the
 * close list — this is a separate sweep, exactly as the cron runs it.
 * fn_settle_late_join_credit RAISEs while the master switch is off, but its due
 * list is empty in that state, so the loop never reaches it.
 */
async function buildCredits(
  client: Client
): Promise<{ credits: SettleLateJoinResult[]; creditsMessage: string | null }> {
  try {
    const due = await listLateJoinDue(client);
    if (due.length === 0) {
      return {
        credits: [],
        creditsMessage:
          'No room is owed a late-join credit. A credit becomes due only after a room has ' +
          'been billed and someone then moves in — which cannot have happened yet.',
      };
    }
    const credits = await mapWithConcurrency(due, 4, (d) =>
      creditLateJoins(client, d.room_id, true, d.window_id)
    );
    return { credits, creditsMessage: null };
  } catch (e) {
    const error = e as PgLikeError;
    if (isMissingObject(error) || isSwitchedOff(error)) {
      return {
        credits: [],
        creditsMessage:
          'Late-join credits cannot be worked out while the settle process is switched off.',
      };
    }
    logger.error(LOG, 'Late-join credit preview failed', e);
    return { credits: [], creditsMessage: 'Late-join credits could not be worked out.' };
  }
}

/**
 * Build the whole practice run. READ-ONLY: nothing in this call writes a row,
 * and nothing in it can bill anyone.
 */
export async function buildSettlePracticeRun(client: Client): Promise<SettlePracticeRun> {
  const policy = await getSettlePolicySnapshot(client);

  // Is the engine here at all? fn_settle_window_due is the cheapest probe: it
  // has no master-switch check, so a failure means the objects are absent.
  let due: { room_id: string; window_id: string }[] = [];
  try {
    due = await listDueSettleWindows(client);
  } catch (e) {
    if (isMissingObject(e as PgLikeError)) {
      return emptyRun(
        'not_installed',
        'The settle process is not installed on this database yet, so there is nothing to ' +
          'preview. Its migration file is written but has not been applied — applying it is a ' +
          'Director decision, and it changes nothing on its own because the mechanism ships off.',
        policy
      );
    }
    logger.error(LOG, 'Could not read the settle window due list', e);
    return emptyRun(
      'error',
      'The list of rooms due to settle could not be read, so no practice run can be shown.',
      policy
    );
  }

  const { credits, creditsMessage } = await buildCredits(client);

  if (due.length > 0) {
    try {
      const rooms = await fromEngineDryRun(client, due);
      return {
        status: 'ok',
        source: 'engine_dry_run',
        message: null,
        sourceNote: ENGINE_NOTE,
        policy,
        rooms,
        totals: totalsOf(rooms),
        credits,
        creditsMessage,
        truncated: false,
        generatedAt: new Date().toISOString(),
      };
    } catch (e) {
      // The switch flipped off between the two calls, or permission is missing.
      if (!isSwitchedOff(e as PgLikeError)) {
        logger.error(LOG, 'Engine dry run failed', e);
        return emptyRun('error', 'The settle process dry run could not be completed.', policy);
      }
      logger.warn(LOG, 'Engine dry run refused — falling back to the room projection');
    }
  }

  const { data: yearId } = await client.rpc('fn_settle_current_hostel_year' as never);
  if (!yearId) {
    return emptyRun(
      'no_hostel_year',
      'No hostel year is marked as the current one, so no room can be priced and no bill can ' +
        'be worked out. Set the current hostel year first.',
      policy
    );
  }

  try {
    const { rooms, truncated } = await fromRoomProjection(client, String(yearId));
    return {
      status: 'ok',
      source: 'room_projection',
      message: null,
      sourceNote: PROJECTION_NOTE + PROJECTION_CAVEAT,
      policy,
      rooms,
      totals: totalsOf(rooms),
      credits,
      creditsMessage,
      truncated,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    logger.error(LOG, 'Room projection failed', e);
    return emptyRun(
      'error',
      'The rooms could not be read, so no practice run can be shown. Nothing was billed and ' +
        'nothing was changed.',
      policy
    );
  }
}
