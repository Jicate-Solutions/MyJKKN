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
//
// ── 2026-08-10: SUPERSEDES the name-matching rule above ─────────────────────
// The `/premium/i` name test excluded "Deluxe Room" BY DESIGN (locked decision
// 2026-05-28, quoted above). That is now reversed on operator instruction: nine
// learners had been waiting since 2026-08-05 for a Deluxe upgrade while 76 free
// Deluxe beds sat idle, because a Deluxe bed could never open a vacancy.
//
// Eligibility is now RANK-BASED, not name-based:
//     hostel_categories.upgrades_enabled = true
//     AND sort_order > (sort_order of 'Classic Room' for the SAME type)
// so adding or renaming a category no longer needs a code change. The upgrade
// POOL is still Classic residents only (resolveUpgradePool, unchanged).
//
// DATA QUIRK worth knowing: 'Deluxe Plus Room' currently has sort_order = 0,
// i.e. BELOW Classic (1), so it does not qualify as an upgrade target. It has
// zero rooms today so nothing is affected, but if rooms are ever added to it
// its sort_order must be corrected first. isUpgradeTargetCategory logs a
// warning when an upgrades_enabled category ranks at or below Classic, so the
// misconfiguration surfaces instead of silently dropping beds.
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

import type { SupabaseClient } from '@supabase/supabase-js';
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

// ─── Category eligibility (rank-based) ───────────────────────────────────────

interface CategoryRow {
  id: string;
  name: string;
  type: string | null;
  sort_order: number | null;
  upgrades_enabled: boolean | null;
  is_active: boolean | null;
}

/**
 * The set of hostel_categories ids that count as an UPGRADE TARGET for a
 * Classic resident: upgrades_enabled, active, and ranked strictly above the
 * 'Classic Room' row of the SAME gender type.
 *
 * Replaces the old `/premium/i` name test — see the 2026-08-10 note in the file
 * header. Rank comes from hostel_categories.sort_order, so a new category needs
 * no code change; it only needs a sort_order above Classic and upgrades_enabled.
 *
 * A category that is upgrades_enabled but ranks at or below Classic is a
 * MISCONFIGURATION, not a silent exclusion: it is logged so it can be fixed.
 */
export async function loadUpgradeTargetCategoryIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('hostel_categories')
    .select('id, name, type, sort_order, upgrades_enabled, is_active');
  if (error) throw error;

  const rows = (data ?? []) as CategoryRow[];

  // Classic's rank per gender type — the floor every target must beat.
  const classicRank = new Map<string, number>();
  for (const c of rows) {
    if (c.name?.trim().toLowerCase() === 'classic room' && c.type && c.sort_order != null) {
      classicRank.set(c.type, c.sort_order);
    }
  }

  const ids = new Set<string>();
  for (const c of rows) {
    if (!c.is_active || !c.upgrades_enabled || !c.type) continue;
    const floor = classicRank.get(c.type);
    if (floor == null || c.sort_order == null) continue;
    if (c.name?.trim().toLowerCase() === 'classic room') continue;
    if (c.sort_order > floor) {
      ids.add(c.id);
    } else {
      logger.warn(
        LOG,
        'Category is upgrades_enabled but ranks at or below Classic — it will never be offered as an upgrade. Fix its sort_order.',
        { category: c.name, type: c.type, sort_order: c.sort_order, classic_sort_order: floor },
      );
    }
  }
  return ids;
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
  // Rank-based, replacing the old `/premium/i` name test which excluded Deluxe
  // by design — see the 2026-08-10 note in the file header.
  const upgradeTargets = await loadUpgradeTargetCategoryIds(supabase);
  if (!room?.category_id || !upgradeTargets.has(room.category_id)) {
    // Freed bed is not an upgrade target for a Classic resident — nothing to open.
    logger.info(LOG, 'Vacated bed is not an upgrade-target category; no vacancy opened', {
      vacateRequestId, category: categoryName,
    });
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

// ─── Sweep: open vacancies for beds that are simply FREE ────────────────────

export interface SweepResult {
  /** Free beds found in upgrade-target categories, before any filtering. */
  scanned: number;
  /** Skipped because an OPEN vacancy already exists for that bed. */
  alreadyOpen: number;
  /** Vacancy rows inserted. Always 0 when dryRun. */
  opened: number;
  /** Eligible beds left untouched because `limit` was reached. */
  capped: number;
  dryRun: boolean;
  /** Eligible free-bed counts keyed by category name — for the operator. */
  byCategory: Record<string, number>;
}

/**
 * Open upgrade vacancies for beds that are ALREADY FREE, rather than waiting for
 * a vacate to finalize.
 *
 * WHY THIS EXISTS: `detectVacancyOnVacate` is the only other producer of
 * hostel_premium_vacancies rows, and it fires from exactly one call site —
 * HostelVacateRequestService.finalize(). With no vacate request ever finalized,
 * that table stayed empty forever, so 145 free upgrade-category beds generated
 * no offers and 162 waitlist entries expired unoffered.
 *
 * ── THIS FUNCTION NEVER NOTIFIES ────────────────────────────────────────────
 * It opens rows and returns counts. Notification stays a separate, explicit
 * step (notifyUpgradePool per vacancy). That separation is deliberate and load
 * bearing: measured 2026-08-10, a full sweep would open 145 vacancies against a
 * pool of 210 Classic girls residents = **30,450 in-app notifications**. Wiring
 * notify into the sweep would make one call fire all of them irreversibly.
 *
 * Defaults are chosen so an accidental call is harmless:
 *   dryRun = TRUE  — counts only, writes nothing
 *   limit  = 25    — even a deliberate run opens a bounded number
 *
 * Idempotent: a bed with an OPEN vacancy is skipped, so re-running does not
 * duplicate. Beds holding an active/pending allocation are never eligible.
 */
export async function sweepFreeBedsForVacancies(opts?: {
  /** 'boys' | 'girls' — restrict to one hostel type. */
  hostelType?: string;
  institutionId?: string;
  /** Max vacancies to open in one run. Default 25. */
  limit?: number;
  /** Default TRUE — count without writing. */
  dryRun?: boolean;
  /** Service-role client for cron/server call sites (RLS). */
  client?: SupabaseClient;
}): Promise<SweepResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (opts?.client ?? createClientSupabaseClient()) as any;
  const limit = opts?.limit ?? 25;
  const dryRun = opts?.dryRun ?? true;

  const upgradeTargets = await loadUpgradeTargetCategoryIds(supabase);
  if (upgradeTargets.size === 0) {
    return { scanned: 0, alreadyOpen: 0, opened: 0, capped: 0, dryRun, byCategory: {} };
  }

  // Free beds in upgrade-target rooms. `status = 'available'` is not sufficient
  // on its own — a bed can read available while a pending_approval allocation
  // holds it — so the allocation check below is a second gate.
  const { data: bedRows, error: bedErr } = await supabase
    .from('hostel_beds')
    .select(
      'id, room_id, status, ' +
        'room:hostel_rooms!hostel_beds_room_id_fkey(' +
        'id, block_id, category_id, room_purpose, ' +
        'block:hostel_blocks!hostel_rooms_block_id_fkey(id, hostel_type), ' +
        'category:hostel_categories!hostel_rooms_category_id_fkey(id, name))',
    )
    .eq('status', 'available');
  if (bedErr) throw bedErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eligible: any[] = [];
  const byCategory: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bedRows ?? []) as any[]) {
    const room = b.room;
    if (!room || room.room_purpose !== 'student') continue;
    if (!room.category_id || !upgradeTargets.has(room.category_id)) continue;
    const htype = room.block?.hostel_type ?? null;
    if (opts?.hostelType && htype !== opts.hostelType) continue;
    eligible.push({ ...b, hostel_type: htype });
    const cname = room.category?.name ?? 'unknown';
    byCategory[cname] = (byCategory[cname] ?? 0) + 1;
  }

  if (eligible.length === 0) {
    return { scanned: 0, alreadyOpen: 0, opened: 0, capped: 0, dryRun, byCategory };
  }

  const bedIds = eligible.map((b) => b.id);

  // Beds already held by a live allocation are not free, whatever their status.
  const { data: heldRows, error: heldErr } = await supabase
    .from('hostel_allocations')
    .select('bed_id')
    .in('bed_id', bedIds)
    .in('status', ['active', 'pending_approval']);
  if (heldErr) throw heldErr;
  const held = new Set(((heldRows ?? []) as Array<{ bed_id: string }>).map((r) => r.bed_id));

  // Beds that already have an OPEN vacancy — idempotency.
  const { data: openRows, error: openErr } = await supabase
    .from('hostel_premium_vacancies')
    .select('bed_id')
    .in('bed_id', bedIds)
    .eq('status', 'open');
  if (openErr) throw openErr;
  const alreadyOpenSet = new Set(
    ((openRows ?? []) as Array<{ bed_id: string | null }>).map((r) => r.bed_id).filter(Boolean) as string[],
  );

  const candidates = eligible.filter((b) => !held.has(b.id) && !alreadyOpenSet.has(b.id));
  const scanned = candidates.length;
  const take = candidates.slice(0, limit);
  const capped = Math.max(0, scanned - take.length);

  if (dryRun || take.length === 0) {
    logger.info(LOG, 'Free-bed vacancy sweep (dry run — nothing written)', {
      scanned, alreadyOpen: alreadyOpenSet.size, capped, byCategory,
    });
    return { scanned, alreadyOpen: alreadyOpenSet.size, opened: 0, capped, dryRun: true, byCategory };
  }

  // institution_id is NOT NULL on the vacancy table, and a block can serve
  // several institutions, so it is resolved per block from the junction. A bed
  // whose block serves no institution is skipped rather than guessed at.
  const blockIds = [...new Set(take.map((b) => b.room?.block_id).filter(Boolean))] as string[];
  const { data: bi, error: biErr } = await supabase
    .from('hostel_block_institutions')
    .select('block_id, institution_id, is_primary')
    .in('block_id', blockIds);
  if (biErr) throw biErr;
  const instForBlock = new Map<string, string>();
  for (const row of (bi ?? []) as Array<{ block_id: string; institution_id: string; is_primary: boolean | null }>) {
    if (!instForBlock.has(row.block_id) || row.is_primary) instForBlock.set(row.block_id, row.institution_id);
  }

  const payload = take
    .map((b) => {
      const blockId = b.room?.block_id ?? null;
      const institutionId = opts?.institutionId ?? (blockId ? instForBlock.get(blockId) : undefined);
      if (!institutionId) return null;
      return {
        institution_id: institutionId,
        room_id: b.room_id,
        bed_id: b.id,
        block_id: blockId,
        room_category_id: b.room?.category_id ?? null,
        hostel_type: b.hostel_type,
        cluster_key: clusterKeyFor(institutionId, b.hostel_type),
        status: 'open' as const,
      };
    })
    .filter(Boolean);

  if (payload.length === 0) {
    return { scanned, alreadyOpen: alreadyOpenSet.size, opened: 0, capped, dryRun: false, byCategory };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('hostel_premium_vacancies')
    .insert(payload)
    .select('id');
  if (insErr) throw insErr;

  logger.info(LOG, 'Free-bed vacancy sweep opened vacancies (NO notifications sent)', {
    opened: inserted?.length ?? 0, scanned, capped,
  });
  return {
    scanned,
    alreadyOpen: alreadyOpenSet.size,
    opened: inserted?.length ?? 0,
    capped,
    dryRun: false,
    byCategory,
  };
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

  // profiles.gender is the LOGIN SHADOW and can be blank while the
  // learners_profiles master record has a perfectly good value — the same split
  // brain that made auto-allocate blame a missing room rule (20260810190000) and
  // then abort whole batches from the validation trigger (20260810220000).
  // Unfixed here, a blank shadow silently drops that resident from the upgrade
  // pool. One batched lookup, only for the rows that actually need it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blankGenderIds = ((allocs ?? []) as any[])
    .map((a) => a.learner)
    .filter((l) => l?.id && !String(l.gender ?? '').trim())
    .map((l) => l.id as string);
  const masterGender = new Map<string, string>();
  if (blankGenderIds.length > 0) {
    const { data: mg } = await supabase
      .from('profiles')
      .select('id, learners_profiles:learner_id(gender)')
      .in('id', [...new Set(blankGenderIds)]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (mg ?? []) as any[]) {
      const g = row?.learners_profiles?.gender;
      if (g) masterGender.set(row.id, g);
    }
  }

  const pool: UpgradePoolMember[] = [];
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (allocs ?? []) as any[]) {
    const learner = a.learner;
    if (!learner?.id) continue;

    // Gender match against the vacancy's hostel_type pool key. Shadow first,
    // master record fills a blank — same precedence as the allocation engine.
    const effGender = String(learner.gender ?? '').trim() || masterGender.get(learner.id) || null;
    const learnerType = genderToHostelType(effGender);
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
 *
 * Context: the INSERT into hostel_premium_vacancy_notifications requires the
 * `authenticated` role under RLS. Call sites with a user session (e.g.
 * vacate-finalize) can rely on the default anon/browser client. Server/cron
 * call sites (no session) MUST pass a privileged client via `opts.client`
 * (the price-drop cron passes its service-role client) — otherwise the anon
 * client is silently denied by RLS and the notify round no-ops.
 */
export async function notifyUpgradePool(
  vacancyId: string,
  opts?: { client?: SupabaseClient },
): Promise<NotifyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (opts?.client ?? createClientSupabaseClient()) as any;

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
