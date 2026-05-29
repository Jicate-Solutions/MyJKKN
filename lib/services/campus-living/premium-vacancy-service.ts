// ============================================================================
// Premium Vacancy Detection + Upgrade-Pool Notification (PR ζ)
// ============================================================================
// Locked decisions (2026-05-28):
//   5. A mid-year vacate of a Premium-category bed leaves existing residents'
//      fees unchanged; the freed bed becomes an "upgrade vacancy".
//   6. On opening, notify all CLASSIC-category residents in the SAME hostel
//      cluster, gender-matched, of the upgrade opportunity.
//
// The dynamic 20% / 60-day price drop is a SEPARATE later PR (θ). This service
// only builds detection + the vacancy record + the first notification.
//
// ── Discoveries that shape this service (see PR body for full flags) ────────
// - Premium vs Classic lives on hostel_categories (post-Boobalan, category is
//   on hostel_rooms.category_id). "Premium" = category name ILIKE '%Premium%'
//   (covers "Premium Room" + "Premium Plus Room"). "Classic" = name 'Classic Room'.
//   ("Deluxe Room" is neither — not in the upgrade pool, not a Premium vacancy.)
// - hostel_blocks has NO cluster column and NO institution_id. Gender on a block
//   is hostel_type (boys|girls|...). Institution scope flows through the
//   hostel_block_institutions junction. CLUSTER (FLAGGED, needs Director
//   confirmation) is therefore "<institution_id>:<hostel_type>".
// - hostel_allocations.learner_id → profiles(id); gender is profiles.gender
//   (mixed case in prod: male/MALE/female/FEMALE — normalised below).
// - There is no real SMS dispatcher in campus-living (vacate-service comments
//   confirm SMS is NOT wired). The canonical app-wide dispatcher is
//   lib/services/notification/sendNotification — in-app delivery is real;
//   email/SMS/push are TODO stubs there. We reuse it; recorded channel = in_app.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { sendNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
} from '@/types/notification';

const LOG = 'campus-living/premium-vacancy';

export interface PremiumVacancy {
  id: string;
  institution_id: string;
  room_id: string;
  bed_id: string | null;
  block_id: string | null;
  room_category_id: string | null;
  hostel_type: string | null;
  cluster_key: string | null;
  status: 'open' | 'filled' | 'closed_year_end' | 'cancelled';
  current_discount_pct: number;
}

/** Resolve the cluster key from institution + block gender. FLAGGED assumption. */
function clusterKeyFor(institutionId: string, hostelType: string | null): string {
  return `${institutionId}:${hostelType ?? 'unknown'}`;
}

/** Normalise profiles.gender (male/MALE/...) to the hostel_categories.type
 *  vocabulary (boys/girls). Returns null when it can't be mapped. */
function genderToHostelType(gender: string | null | undefined): string | null {
  if (!gender) return null;
  const g = gender.trim().toLowerCase();
  if (g === 'male' || g === 'boy' || g === 'boys' || g === 'm') return 'boys';
  if (g === 'female' || g === 'girl' || g === 'girls' || g === 'f') return 'girls';
  return null;
}

// ─── Detection ──────────────────────────────────────────────────────────────

/**
 * Given a finalized vacate request, determine whether the freed bed sits in a
 * Premium-category room. If yes, open a hostel_premium_vacancies row and return
 * it. If not Premium (or anything is missing), no-op and return null.
 *
 * Idempotent: if an OPEN vacancy already exists for this vacate request, the
 * existing row is returned instead of opening a duplicate.
 */
export async function detectVacancyOnVacate(
  vacateRequestId: string,
): Promise<PremiumVacancy | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  // Short-circuit: already opened for this request?
  const { data: existing } = await supabase
    .from('hostel_premium_vacancies')
    .select('id, institution_id, room_id, bed_id, block_id, room_category_id, hostel_type, cluster_key, status, current_discount_pct')
    .eq('opened_by_vacate_request_id', vacateRequestId)
    .maybeSingle();
  if (existing) return existing as PremiumVacancy;

  // 1) Vacate request → its allocation.
  const { data: req, error: reqErr } = await supabase
    .from('hostel_vacate_requests')
    .select('id, allocation_id, institution_id')
    .eq('id', vacateRequestId)
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!req?.allocation_id) {
    logger.warn(LOG, 'Vacate request has no allocation_id; skipping detection', { vacateRequestId });
    return null;
  }

  // 2) Allocation → room / bed / block / institution.
  const { data: alloc, error: allocErr } = await supabase
    .from('hostel_allocations')
    .select('id, room_id, bed_id, block_id, institution_id')
    .eq('id', req.allocation_id)
    .maybeSingle();
  if (allocErr) throw allocErr;
  if (!alloc?.room_id) {
    logger.warn(LOG, 'Allocation has no room_id; skipping detection', { vacateRequestId });
    return null;
  }

  // 3) Room → category (Premium?).
  const { data: room, error: roomErr } = await supabase
    .from('hostel_rooms')
    .select('id, block_id, category_id, hostel_categories(id, name, type)')
    .eq('id', alloc.room_id)
    .maybeSingle();
  if (roomErr) throw roomErr;

  const category = room?.hostel_categories ?? null;
  const categoryName: string = category?.name ?? '';
  const isPremium = /premium/i.test(categoryName);
  if (!isPremium) {
    // Not a premium bed — nothing to open.
    return null;
  }

  const institutionId: string = alloc.institution_id ?? req.institution_id;
  const blockId: string | null = alloc.block_id ?? room?.block_id ?? null;
  // hostel_type for the pool: prefer the category gender, fall back to block.
  let hostelType: string | null = category?.type ?? null;
  if (!hostelType && blockId) {
    const { data: block } = await supabase
      .from('hostel_blocks')
      .select('hostel_type')
      .eq('id', blockId)
      .maybeSingle();
    hostelType = block?.hostel_type ?? null;
  }

  const { data: inserted, error: insErr } = await supabase
    .from('hostel_premium_vacancies')
    .insert({
      institution_id: institutionId,
      room_id: alloc.room_id,
      bed_id: alloc.bed_id ?? null,
      block_id: blockId,
      room_category_id: room?.category_id ?? null,
      hostel_type: hostelType,
      cluster_key: clusterKeyFor(institutionId, hostelType),
      opened_by_vacate_request_id: vacateRequestId,
      status: 'open',
    })
    .select('id, institution_id, room_id, bed_id, block_id, room_category_id, hostel_type, cluster_key, status, current_discount_pct')
    .single();
  if (insErr) throw insErr;

  logger.info(LOG, 'Opened premium upgrade vacancy', {
    vacancyId: inserted.id,
    vacateRequestId,
    cluster_key: inserted.cluster_key,
  });
  return inserted as PremiumVacancy;
}

// ─── Upgrade-pool resolution ─────────────────────────────────────────────────

export interface UpgradePoolMember {
  learner_id: string;       // profiles.id
  full_name: string | null;
  allocation_id: string;
}

/**
 * Return CLASSIC residents in the same cluster (institution + gender) as the
 * vacancy, gender-matched. Classic = the resident's current room category name
 * is 'Classic Room'. Gender match = the resident's profile gender normalises to
 * the vacancy's hostel_type.
 */
export async function resolveUpgradePool(
  vacancy: PremiumVacancy,
): Promise<UpgradePoolMember[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  // 1) Blocks belonging to this institution (cluster scope).
  const { data: blockRows, error: blockErr } = await supabase
    .from('hostel_block_institutions')
    .select('block_id')
    .eq('institution_id', vacancy.institution_id);
  if (blockErr) throw blockErr;
  const blockIds = ((blockRows ?? []) as Array<{ block_id: string }>).map((b) => b.block_id);
  if (blockIds.length === 0) return [];

  // 2) Active allocations in those blocks, with learner + room category.
  const { data: allocs, error: allocErr } = await supabase
    .from('hostel_allocations')
    .select(
      'id, learner_id, room_id, ' +
        'learner:profiles!hostel_allocations_learner_id_fkey(id, full_name, gender), ' +
        'room:hostel_rooms!hostel_allocations_room_id_fkey(id, hostel_categories(name, type))',
    )
    .in('block_id', blockIds)
    .eq('status', 'active')
    .not('learner_id', 'is', null);
  if (allocErr) throw allocErr;

  const pool: UpgradePoolMember[] = [];
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (allocs ?? []) as any[]) {
    const learner = a.learner;
    if (!learner?.id) continue;

    // Gender match against the vacancy's hostel_type pool key.
    const learnerType = genderToHostelType(learner.gender);
    if (vacancy.hostel_type && learnerType !== vacancy.hostel_type) continue;

    // Classic-category only.
    const catName: string = a.room?.hostel_categories?.name ?? '';
    if (catName.trim().toLowerCase() !== 'classic room') continue;

    if (seen.has(learner.id)) continue;
    seen.add(learner.id);
    pool.push({ learner_id: learner.id, full_name: learner.full_name ?? null, allocation_id: a.id });
  }
  return pool;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface NotifyResult {
  vacancyId: string;
  notified: number;       // new notifications dispatched this run
  skipped: number;        // already-notified (idempotency)
  poolSize: number;
}

/**
 * Notify every member of the upgrade pool exactly once. For each pool member
 * NOT already notified for this vacancy, insert a hostel_premium_vacancy_notifications
 * row (the table's UNIQUE (vacancy_id, notified_learner_id) index is the second
 * line of defence) and dispatch an in-app notification via the canonical
 * sendNotification dispatcher.
 *
 * Idempotent: re-running for an already-notified learner neither double-inserts
 * nor double-dispatches.
 */
export async function notifyUpgradePool(vacancyId: string): Promise<NotifyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  const { data: vacancy, error: vErr } = await supabase
    .from('hostel_premium_vacancies')
    .select('id, institution_id, room_id, bed_id, block_id, room_category_id, hostel_type, cluster_key, status, current_discount_pct')
    .eq('id', vacancyId)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!vacancy) {
    logger.warn(LOG, 'notifyUpgradePool: vacancy not found', { vacancyId });
    return { vacancyId, notified: 0, skipped: 0, poolSize: 0 };
  }

  const pool = await resolveUpgradePool(vacancy as PremiumVacancy);
  if (pool.length === 0) {
    return { vacancyId, notified: 0, skipped: 0, poolSize: 0 };
  }

  // Already-notified learners for this vacancy (idempotency).
  const { data: existing } = await supabase
    .from('hostel_premium_vacancy_notifications')
    .select('notified_learner_id')
    .eq('vacancy_id', vacancyId);
  const alreadyNotified = new Set(
    ((existing ?? []) as Array<{ notified_learner_id: string }>).map((r) => r.notified_learner_id),
  );

  const fresh = pool.filter((m) => !alreadyNotified.has(m.learner_id));
  const skipped = pool.length - fresh.length;
  if (fresh.length === 0) {
    return { vacancyId, notified: 0, skipped, poolSize: pool.length };
  }

  const discountPct = (vacancy as PremiumVacancy).current_discount_pct ?? 0;

  // 1) Log rows first (the UNIQUE index makes this the durable idempotency record).
  const { error: logErr } = await supabase
    .from('hostel_premium_vacancy_notifications')
    .insert(
      fresh.map((m) => ({
        vacancy_id: vacancyId,
        notified_learner_id: m.learner_id,
        discount_pct_at_notify: discountPct,
        channel: NotificationChannel.IN_APP,
      })),
    );
  if (logErr) throw logErr;

  // 2) Dispatch via the canonical app-wide notifier (in-app delivery is real).
  await sendNotification({
    user_ids: fresh.map((m) => m.learner_id),
    type: NotificationType.INFO,
    category: NotificationCategory.SYSTEM,
    priority: NotificationPriority.NORMAL,
    title: 'A Premium hostel room just opened up',
    message:
      'A Premium room in your hostel is now available for upgrade. ' +
      'Your current fees stay the same. Contact your warden to claim it.',
    channels: [NotificationChannel.IN_APP],
    metadata: {
      reference_id: vacancyId,
      reference_type: 'hostel_premium_vacancy',
      custom_data: { cluster_key: (vacancy as PremiumVacancy).cluster_key ?? '' },
    },
  });

  logger.info(LOG, 'Notified upgrade pool', {
    vacancyId,
    notified: fresh.length,
    skipped,
    poolSize: pool.length,
  });
  return { vacancyId, notified: fresh.length, skipped, poolSize: pool.length };
}
