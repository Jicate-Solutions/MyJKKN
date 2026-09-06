/**
 * Empty-bed intimation — tell residents their room is under-filled and what it
 * is costing them (Director interview 2026-08-09).
 *
 * The Director's words were that "some kind of intimation should be made so
 * that they will actively try to fill up the room". Today nothing tells a
 * learner her room has empty beds; she discovers the bigger share when the bill
 * arrives. The invite-a-roommate page has existed for months and has never been
 * used once.
 *
 * SHIPS OFF. hostel.empty_bed_notice.enabled is seeded false and this service
 * REFUSES ENTIRELY while it is false — it does not fall back to a dry run, it
 * returns having composed nothing. Arming it is a separate Director decision.
 *
 * WHAT IT DOES, when armed:
 *   for every room with an OPEN settle window and at least one empty bed
 *     for every resident of that room
 *       if she has not been told about this room within
 *       hostel.empty_bed_notice.reminder_interval_days → send one notice.
 *
 * MECHANISMS REUSED, NOTHING PARALLEL INVENTED:
 *   - occupancy      → v_hostel_room_occupancy (active = check_out_date IS NULL)
 *   - fee maths      → computeFeeBreakdown from hostel-fee-compute-service, fed
 *                      by buildFeeContext from premium-upgrade-service. The
 *                      formula is NOT restated here.
 *   - sending        → createNotification from the platform notification service
 *   - config         → fn_get_policy / platform_policies
 *   - service-role   → same shape as occupancy-snapshot-service
 *
 * TWO "HAS LEFT" DATES — READ BEFORE CHANGING THE OCCUPANCY TEST.
 * hostel_allocations carries BOTH actual_vacate_date and check_out_date, and
 * they have drifted apart in production before. Occupancy here is taken from
 * v_hostel_room_occupancy, which counts check_out_date IS NULL and is the same
 * definition the bed-uniqueness index enforces. Do not swap in the other column
 * to "be safe" — that silently changes who is counted as living in the room and
 * therefore what every learner is told she owes.
 *
 * SIBLING LANE CONTRACT. public.hostel_room_settle_windows is created by the
 * settle-bill PR, not this one. When the table is absent this service returns a
 * clean no-op with reason 'settle_windows_absent', so the two PRs merge in
 * either order.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { computeFeeBreakdown } from '@/lib/services/campus-living/hostel-fee-compute-service';
import { buildFeeContext } from '@/lib/services/campus-living/premium-upgrade-service';
import { createNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '@/types/notification';

const LOG = 'campus-living/empty-bed-notice';

/** Where a learner goes to act on the notice. */
const INVITE_ROUTE = '/campus-living/my-hostel/premium/invite-roommate';

/** Used only if the message_template policy row is missing or blank. */
const FALLBACK_TEMPLATE =
  'Hello {learner_name}. Your room {room_number} in {block_name} has {empty_beds} of {capacity} beds still empty. ' +
  'Your share of the room charge is Rs {current_share} for the year right now; if all {capacity} beds are taken it would be Rs {full_share}, which is Rs {saving} less for you. ' +
  'You have until {deadline} to bring someone in, and you can invite a roommate from the Campus Living section of MyJKKN.';

const DEFAULT_INTERVAL_DAYS = 2;

/** One learner who would be, or was, told. */
export interface EmptyBedNoticeRecipient {
  learner_id: string;
  learner_name: string;
  /** The exact text, tokens already substituted. */
  message: string;
  /** Live runs only: false when the send failed or was already banked today. */
  sent?: boolean;
  skipped_reason?: string;
}

/** One under-filled room and everyone in it. */
export interface EmptyBedNoticePlan {
  room_id: string;
  room_number: string;
  block_name: string;
  capacity: number;
  active_residents: number;
  empty_beds: number;
  /** Share of the ROOM charge only (base + AC). Mess is flat and excluded. */
  current_share_inr: number;
  full_share_inr: number;
  saving_inr: number;
  deadline: string;
  recipients: EmptyBedNoticeRecipient[];
}

export interface EmptyBedNoticeResult {
  /** False when the master switch is off — nothing was composed. */
  enabled: boolean;
  dry_run: boolean;
  /** Set whenever the run ended early; null on a normal run. */
  reason: string | null;
  rooms_with_open_window: number;
  rooms_with_empty_beds: number;
  notices_planned: number;
  notices_sent: number;
  reminder_interval_days: number;
  plans: EmptyBedNoticePlan[];
}

function emptyResult(
  overrides: Partial<EmptyBedNoticeResult> & { reason: string | null },
): EmptyBedNoticeResult {
  return {
    enabled: true,
    dry_run: true,
    rooms_with_open_window: 0,
    rooms_with_empty_beds: 0,
    notices_planned: 0,
    notices_sent: 0,
    reminder_interval_days: DEFAULT_INTERVAL_DAYS,
    plans: [],
    ...overrides,
  };
}

/** Read one policy value via fn_get_policy. Mirrors occupancy-snapshot-service. */
async function readPolicy(
  supabase: ReturnType<typeof createServiceRoleClient>,
  key: string,
): Promise<unknown> {
  try {
    const { data, error } = await supabase.rpc('fn_get_policy', { p_key: key, p_scope_id: null });
    if (error) {
      logger.warn(LOG, 'policy read failed', { key, error: error.message });
      return null;
    }
    return data;
  } catch (err) {
    logger.warn(LOG, 'policy read threw', { key, err });
    return null;
  }
}

/**
 * True when a PostgREST error means "that relation does not exist".
 * 42P01 is the Postgres code; PGRST205 is the schema-cache miss PostgREST
 * returns for an unknown table, which is what the sibling lane's absence looks
 * like from here.
 */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /does not exist|schema cache/i.test(error.message ?? '');
}

/** Rupees, grouped the Indian way, no decimals. */
function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** A date a learner can read: 21 August 2026. */
function formatDate(iso: string | null): string {
  if (!iso) return 'the settle date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'the settle date';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Substitute {tokens}. An UNKNOWN token is left exactly as written rather than
 * replaced with a blank — a typo in the template then shows up in the message
 * instead of quietly deleting a sentence's subject.
 */
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

interface OpenWindow {
  room_id: string;
  hostel_year_id: string;
  current_deadline: string | null;
}

interface OccupancyRow {
  room_id: string;
  room_number: string;
  block_id: string | null;
  capacity: number | null;
  active_residents: number | null;
  beds_available: number | null;
}

/**
 * Compose (and optionally send) the empty-bed notices.
 *
 * @param dryRun when true — the default at every call site — the exact
 *        recipients and the exact message text are returned and NOTHING is
 *        sent and nothing is written.
 */
export async function runEmptyBedNotices(
  dryRun = true,
): Promise<EmptyBedNoticeResult> {
  const supabase = createServiceRoleClient();

  // ── Master switch. Off means off: no composing, no dry run, no reads. ──────
  const enabledRaw = await readPolicy(supabase, 'hostel.empty_bed_notice.enabled');
  if (enabledRaw !== true) {
    logger.info(LOG, 'master switch off — refusing', { enabledRaw });
    return emptyResult({
      enabled: false,
      dry_run: dryRun,
      reason: 'hostel.empty_bed_notice.enabled is false',
    });
  }

  const intervalRaw = await readPolicy(supabase, 'hostel.empty_bed_notice.reminder_interval_days');
  const intervalDays =
    typeof intervalRaw === 'number' && intervalRaw > 0 ? intervalRaw : DEFAULT_INTERVAL_DAYS;
  const templateRaw = await readPolicy(supabase, 'hostel.empty_bed_notice.message_template');
  const template =
    typeof templateRaw === 'string' && templateRaw.trim().length > 0
      ? templateRaw
      : FALLBACK_TEMPLATE;

  // ── Open settle windows. Absent table = clean no-op (sibling lane). ────────
  const { data: windowRows, error: windowErr } = await supabase
    .from('hostel_room_settle_windows')
    .select('room_id, hostel_year_id, current_deadline')
    .eq('status', 'open');
  if (windowErr) {
    if (isMissingRelation(windowErr)) {
      logger.info(LOG, 'hostel_room_settle_windows not present yet — nothing to do', {
        code: windowErr.code,
      });
      return emptyResult({
        dry_run: dryRun,
        reason: 'settle_windows_absent',
        reminder_interval_days: intervalDays,
      });
    }
    logger.error(LOG, 'settle window read failed', { error: windowErr.message });
    throw new Error(`hostel_room_settle_windows read failed: ${windowErr.message}`);
  }

  const windows = (windowRows ?? []) as OpenWindow[];
  if (windows.length === 0) {
    return emptyResult({
      dry_run: dryRun,
      reason: 'no_open_settle_windows',
      reminder_interval_days: intervalDays,
    });
  }
  // One window per room is the sibling lane's intent; if two ever exist, the
  // earlier deadline is the one the learner is actually racing. A NULL deadline
  // sorts LAST, not first — an empty string would beat every real date and hand
  // the learner the least informative of the two windows.
  const deadlineKey = (w: OpenWindow) => w.current_deadline ?? '9999-12-31';
  const windowByRoom = new Map<string, OpenWindow>();
  for (const w of windows) {
    const seen = windowByRoom.get(w.room_id);
    if (!seen || deadlineKey(w) < deadlineKey(seen)) {
      windowByRoom.set(w.room_id, w);
    }
  }
  const roomIds = Array.from(windowByRoom.keys());

  // ── Occupancy, from the canonical view. ───────────────────────────────────
  const { data: occRows, error: occErr } = await supabase
    .from('v_hostel_room_occupancy')
    .select('room_id, room_number, block_id, capacity, active_residents, beds_available')
    .in('room_id', roomIds);
  if (occErr) {
    logger.error(LOG, 'occupancy read failed', { error: occErr.message });
    throw new Error(`v_hostel_room_occupancy read failed: ${occErr.message}`);
  }
  const underFilled = ((occRows ?? []) as OccupancyRow[]).filter(
    (r) => (r.beds_available ?? 0) > 0 && (r.capacity ?? 0) > 0,
  );
  if (underFilled.length === 0) {
    return emptyResult({
      dry_run: dryRun,
      reason: 'no_rooms_with_empty_beds',
      rooms_with_open_window: roomIds.length,
      reminder_interval_days: intervalDays,
    });
  }
  const targetRoomIds = underFilled.map((r) => r.room_id);

  // ── Block names, room categories, residents, names. ───────────────────────
  const { data: roomRows } = await supabase
    .from('hostel_rooms')
    .select('id, category_id, block_id')
    .in('id', targetRoomIds);
  const categoryByRoom = new Map<string, string | null>();
  const blockIdByRoom = new Map<string, string | null>();
  for (const r of (roomRows ?? []) as { id: string; category_id: string | null; block_id: string | null }[]) {
    categoryByRoom.set(r.id, r.category_id);
    blockIdByRoom.set(r.id, r.block_id);
  }

  const blockIds = Array.from(
    new Set(
      underFilled
        .map((r) => r.block_id ?? blockIdByRoom.get(r.room_id) ?? null)
        .filter((v): v is string => !!v),
    ),
  );
  const blockNameById = new Map<string, string>();
  if (blockIds.length > 0) {
    const { data: blockRows } = await supabase
      .from('hostel_blocks')
      .select('id, name')
      .in('id', blockIds);
    for (const b of (blockRows ?? []) as { id: string; name: string }[]) {
      blockNameById.set(b.id, b.name);
    }
  }

  // Residents = active allocations. check_out_date IS NULL, matching the view.
  const { data: allocRows, error: allocErr } = await supabase
    .from('hostel_allocations')
    .select('room_id, learner_id')
    .in('room_id', targetRoomIds)
    .is('check_out_date', null);
  if (allocErr) {
    logger.error(LOG, 'allocation read failed', { error: allocErr.message });
    throw new Error(`hostel_allocations read failed: ${allocErr.message}`);
  }
  const residentsByRoom = new Map<string, string[]>();
  for (const a of (allocRows ?? []) as { room_id: string; learner_id: string }[]) {
    const list = residentsByRoom.get(a.room_id) ?? [];
    list.push(a.learner_id);
    residentsByRoom.set(a.room_id, list);
  }

  const learnerIds = Array.from(new Set((allocRows ?? []).map((a: { learner_id: string }) => a.learner_id)));
  const nameById = new Map<string, string>();
  if (learnerIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', learnerIds);
    for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) nameById.set(p.id, p.full_name);
    }
  }

  // ── Who has heard about this room recently? ───────────────────────────────
  const since = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000).toISOString();
  const recentlyTold = new Set<string>();
  if (learnerIds.length > 0) {
    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from('hostel_empty_bed_notices')
      .select('room_id, learner_id')
      .in('room_id', targetRoomIds)
      .gte('sent_at', since);
    if (ledgerErr) {
      logger.error(LOG, 'notice ledger read failed', { error: ledgerErr.message });
      throw new Error(`hostel_empty_bed_notices read failed: ${ledgerErr.message}`);
    }
    for (const l of (ledgerRows ?? []) as { room_id: string; learner_id: string }[]) {
      recentlyTold.add(`${l.room_id}:${l.learner_id}`);
    }
  }

  // ── Build one plan per room. ──────────────────────────────────────────────
  const plans: EmptyBedNoticePlan[] = [];
  for (const room of underFilled) {
    const win = windowByRoom.get(room.room_id);
    const categoryId = categoryByRoom.get(room.room_id);
    if (!win || !categoryId) {
      logger.warn(LOG, 'room skipped — no settle window or no fee category', {
        room_id: room.room_id,
        has_category: !!categoryId,
      });
      continue;
    }

    const capacity = room.capacity ?? 0;
    const activeResidents = room.active_residents ?? 0;
    const emptyBeds = room.beds_available ?? 0;

    // Fee maths: the SAME context priced twice, once at today's headcount and
    // once at a full room. computeFeeBreakdown is the formula; nothing about
    // per-bed rates, AC or splitting is restated here.
    const ctx = await buildFeeContext(supabase, room.room_id, categoryId, win.hostel_year_id);
    if (!ctx.perBedAnnualRate) {
      logger.warn(LOG, 'room skipped — no active fee row for its category', {
        room_id: room.room_id,
        category_id: categoryId,
      });
      continue;
    }
    const nowShare = computeFeeBreakdown({ ...ctx, activeOccupants: activeResidents });
    const fullShare = computeFeeBreakdown({ ...ctx, activeOccupants: capacity });
    // Room charge only. ctx.messAnnualFee is 0 by construction, and mess is flat
    // per learner so it is identical in both scenarios and would cancel anyway.
    const currentShareInr = nowShare.base_share + nowShare.ac_share;
    const fullShareInr = fullShare.base_share + fullShare.ac_share;
    const savingInr = Math.max(0, currentShareInr - fullShareInr);

    const blockName =
      blockNameById.get(room.block_id ?? blockIdByRoom.get(room.room_id) ?? '') ?? 'your block';
    const deadline = formatDate(win.current_deadline);

    const recipients: EmptyBedNoticeRecipient[] = [];
    for (const learnerId of residentsByRoom.get(room.room_id) ?? []) {
      if (recentlyTold.has(`${room.room_id}:${learnerId}`)) continue;
      const learnerName = nameById.get(learnerId) ?? 'there';
      recipients.push({
        learner_id: learnerId,
        learner_name: learnerName,
        message: renderTemplate(template, {
          learner_name: learnerName,
          room_number: room.room_number,
          block_name: blockName,
          empty_beds: String(emptyBeds),
          capacity: String(capacity),
          current_share: formatInr(currentShareInr),
          full_share: formatInr(fullShareInr),
          saving: formatInr(savingInr),
          deadline,
        }),
      });
    }
    if (recipients.length === 0) continue;

    plans.push({
      room_id: room.room_id,
      room_number: room.room_number,
      block_name: blockName,
      capacity,
      active_residents: activeResidents,
      empty_beds: emptyBeds,
      current_share_inr: currentShareInr,
      full_share_inr: fullShareInr,
      saving_inr: savingInr,
      deadline,
      recipients,
    });
  }

  const planned = plans.reduce((n, p) => n + p.recipients.length, 0);

  if (dryRun) {
    logger.info(LOG, 'dry run — nothing sent', {
      rooms: plans.length,
      notices_planned: planned,
    });
    return {
      enabled: true,
      dry_run: true,
      reason: null,
      rooms_with_open_window: roomIds.length,
      rooms_with_empty_beds: underFilled.length,
      notices_planned: planned,
      notices_sent: 0,
      reminder_interval_days: intervalDays,
      plans,
    };
  }

  // ── Live send. Ledger row FIRST. ──────────────────────────────────────────
  // The unique key (room_id, learner_id, sent_on) is the race guard, so the row
  // is banked before the notification goes out: two overlapping runs then have
  // exactly one winner. The cost of a send that fails after the row is banked
  // is one missed nudge for one day, which is much cheaper than telling the
  // same learner the same thing twice in a morning.
  let sent = 0;
  for (const plan of plans) {
    for (const recipient of plan.recipients) {
      const { error: ledgerErr } = await supabase.from('hostel_empty_bed_notices').insert({
        room_id: plan.room_id,
        learner_id: recipient.learner_id,
        occupants_at_send: plan.active_residents,
      });
      if (ledgerErr) {
        // 23505 = already told today by a concurrent run. Not an error.
        recipient.sent = false;
        recipient.skipped_reason =
          ledgerErr.code === '23505' ? 'already_sent_today' : ledgerErr.message;
        if (ledgerErr.code !== '23505') {
          logger.error(LOG, 'ledger insert failed', {
            room_id: plan.room_id,
            error: ledgerErr.message,
          });
        }
        continue;
      }

      try {
        await createNotification(
          {
            user_id: recipient.learner_id,
            type: NotificationType.INFO,
            category: NotificationCategory.SYSTEM,
            priority: NotificationPriority.NORMAL,
            title: `Your room has ${plan.empty_beds} of ${plan.capacity} beds empty`,
            message: recipient.message,
            metadata: {
              reference_id: plan.room_id,
              reference_type: 'hostel_room_empty_beds',
              custom_data: {
                empty_beds: plan.empty_beds,
                current_share_inr: plan.current_share_inr,
                full_share_inr: plan.full_share_inr,
                saving_inr: plan.saving_inr,
              },
            },
            action_url: INVITE_ROUTE,
            action_label: 'Invite a roommate',
            channels: [NotificationChannel.IN_APP],
          },
          recipient.learner_id,
          supabase,
        );
        recipient.sent = true;
        sent += 1;
      } catch (err) {
        recipient.sent = false;
        recipient.skipped_reason = err instanceof Error ? err.message : String(err);
        logger.error(LOG, 'notification send failed after ledger write', {
          room_id: plan.room_id,
          learner_id: recipient.learner_id,
          err,
        });
      }
    }
  }

  logger.info(LOG, 'empty-bed notices sent', { rooms: plans.length, planned, sent });
  return {
    enabled: true,
    dry_run: false,
    reason: null,
    rooms_with_open_window: roomIds.length,
    rooms_with_empty_beds: underFilled.length,
    notices_planned: planned,
    notices_sent: sent,
    reminder_interval_days: intervalDays,
    plans,
  };
}
