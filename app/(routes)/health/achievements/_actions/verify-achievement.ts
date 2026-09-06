'use server';

// app/(routes)/health/achievements/_actions/verify-achievement.ts
// ============================================================================
// IQAC-only verification of learner achievements (Director decision D4).
//
// WHO MAY VERIFY
//   user_has_permission('accreditation.certificates.manage')  — the existing
//   accreditation/IQAC key (already registered in lib/constants/permissions.ts;
//   this PR adds no key), plus the standard is_super_admin() / is_admin()
//   bypass. Explicitly NOT the owning learner, and NOT the HOD/Principal —
//   neither holds that key, and the owning-learner case is refused below by id
//   comparison, not by hiding a button.
//
// WHY A SERVER ACTION AND NOT THE BROWSER CLIENT
//   health_sports_achievements RLS is (a) self — ALL on own rows, (b) public —
//   SELECT WHERE verified = true. So through the browser client an IQAC officer
//   literally CANNOT SEE an unverified row belonging to someone else: the queue
//   would always be empty and the verify tick unreachable. Reading and writing
//   here with the service-role client behind an explicit session-side permission
//   gate makes verification work today with no DDL (migrations in this repo are
//   Director-gated files that merge/deploy never apply).
//
//   Client discipline mirrors accreditation/naac/narratives/_actions:
//     * session client (cookie-bound) — every authorization decision, so the
//       permission RPCs resolve against the real caller (auth.uid()).
//     * service-role client — only the reads/writes already authorized above.
//
// SELF-VERIFICATION — MEASURED, AND NOW FIXED IN A FILE THAT IS NOT YET APPLIED
//   The pre-existing health_sports_achievements_self policy is FOR ALL on own
//   rows, so a learner can flip verified on their OWN row by calling PostgREST
//   directly with the public anon key that ships in every Next.js bundle. RLS is
//   ROW-scoped, never COLUMN-scoped, so "edit your own row" silently reads
//   "verify your own row".
//
//   Re-measured on production 2026-07-31 inside BEGIN..ROLLBACK, as DB role
//   `authenticated` with request.jwt.claims.sub set to the owning learner —
//   the same execution shape PostgREST uses:
//     UPDATE health_sports_achievements SET verified = true WHERE id = <own row>
//       → 1 row updated, and the row read back as verified = true.
//   The same statement run as a DIFFERENT learner updated 0 rows, and that
//   learner could see 0 rows at all: the self policy's subquery is bounded by
//   learners_profiles' own RLS, which returns only the caller's learner record
//   (re-measured 2026-07-31: 1, not 7,156). So the exposure is self-verification
//   only — NOT cross-learner tampering, which is refused.
//
//   Column grants were not the missing lock either: UPDATE on the `verified`
//   column was granted to anon, authenticated, postgres and service_role.
//
//   CLOSED BY supabase/migrations/20260808110100_health_sports_achievement_self_
//   verify_lockdown.sql — the FOR ALL policy split four ways, and the table-level
//   UPDATE revoked from `authenticated` BEFORE column-level UPDATE is granted
//   back on the descriptive columns only (a column grant layered on top of a
//   table grant restricts nothing, which is how a first attempt at this on the
//   sibling PR looked fixed and was not). Proven live in that same rolled-back
//   transaction: the owning learner's SET verified = true now fails 42501, while
//   their descriptive edit still succeeds.
//
//   HONEST STATUS: migrations in this repo are Director-gated FILES that merging
//   and deploying never apply, so PRODUCTION IS STILL OPEN TO SELF-VERIFICATION
//   until a Director applies that file. What ships with this PR is the file plus
//   the app-side guards. Nothing in this UI ever sends verified = true from a
//   learner path, and the write below refuses anyone without the IQAC key — but
//   the UI has never been the boundary, and this comment must not pretend it is.
//
//   Note the deliberate consequence of the column revoke: after it is applied NO
//   user session may write `verified`, not even an IQAC officer's, because
//   column privileges attach to the DB role `authenticated` and every signed-in
//   person shares it. The only remaining writer is `service_role` — i.e. this
//   action. That is a narrowing, and it is the point: one auditable path, which
//   also enforces "nobody verifies their own row" below.
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const VERIFY_PERMISSION = 'accreditation.certificates.manage';
const QUEUE_LIMIT = 60;

export interface VerificationRow {
  id: string;
  learner_id: string;
  learner_name: string;
  learner_roll: string | null;
  achievement_date: string;
  sport: string | null;
  event_name: string;
  event_level: string;
  achievement_type: string;
  description: string | null;
  /**
   * Whether a certificate is attached — deliberately NOT the pointer itself. The
   * queue never ships a certificate reference to the browser; opening one goes
   * through getCertificateLink, which re-checks D7 and mints a short-lived
   * signed URL for that one viewing.
   */
  has_certificate: boolean;
  verified: boolean;
  /** True when this row belongs to the acting user — they may never verify it. */
  is_own: boolean;
}

// Flat result shapes (not discriminated unions): the repo runs with
// strictNullChecks:false, under which boolean-discriminant narrowing does not
// work — callers read the optional fields guarded by `ok`.
export interface VerificationQueueResult {
  ok: boolean;
  /** Whether the caller holds the IQAC verification key at all. */
  canVerify: boolean;
  rows: VerificationRow[];
  error?: string;
}

export interface SetVerifiedResult {
  ok: boolean;
  error?: string;
}

/**
 * Resolve the acting user: their auth id, whether they may verify, and which
 * learner record (if any) is theirs. Every authorization read uses the
 * cookie-bound session client on purpose.
 */
async function resolveActor(): Promise<{
  userId: string | null;
  canVerify: boolean;
  ownLearnerId: string | null;
}> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { userId: null, canVerify: false, ownLearnerId: null };

  const [{ data: hasPerm }, { data: isSuperAdmin }, { data: isAdmin }] =
    await Promise.all([
      session.rpc('user_has_permission', { permission_name: VERIFY_PERMISSION }),
      session.rpc('is_super_admin'),
      session.rpc('is_admin'),
    ]);

  const { data: profile } = await (session as any)
    .from('profiles')
    .select('learner_id')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    canVerify: Boolean(hasPerm) || Boolean(isSuperAdmin) || Boolean(isAdmin),
    ownLearnerId: profile?.learner_id ?? null,
  };
}

/**
 * The IQAC verification queue — unverified achievements first, so the honest
 * "20 learners went, 2 won" record can be confirmed row by row. Returns
 * canVerify:false with an empty list for everyone else, which is what hides the
 * panel; the write path below re-checks independently.
 */
export async function loadVerificationQueue(): Promise<VerificationQueueResult> {
  const actor = await resolveActor();
  if (!actor.userId) {
    return { ok: false, canVerify: false, rows: [], error: 'Not signed in.' };
  }
  if (!actor.canVerify) return { ok: true, canVerify: false, rows: [] };

  const admin = createServiceRoleClient();
  const { data: rows, error } = await (admin as any)
    .from('health_sports_achievements')
    .select(
      'id, learner_id, achievement_date, sport, event_name, event_level, achievement_type, description, certificate_url, verified',
    )
    .order('verified', { ascending: true })
    .order('achievement_date', { ascending: false })
    .limit(QUEUE_LIMIT);

  if (error) {
    return {
      ok: false,
      canVerify: true,
      rows: [],
      error: `Could not load the verification queue: ${error.message}`,
    };
  }

  const list: any[] = rows ?? [];
  const learnerIds = Array.from(new Set(list.map((r) => r.learner_id).filter(Boolean)));

  // Separate query, not an embedded join: an !inner join silently drops rows
  // whose learner record is missing, and a dropped row is an achievement that
  // can never be verified.
  const names = new Map<string, { name: string; roll: string | null }>();
  if (learnerIds.length > 0) {
    const { data: learners } = await (admin as any)
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .in('id', learnerIds);
    for (const l of learners ?? []) {
      const full = [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
      names.set(l.id, { name: full || 'Unnamed learner', roll: l.roll_number ?? null });
    }
  }

  return {
    ok: true,
    canVerify: true,
    rows: list.map((r) => ({
      id: r.id,
      learner_id: r.learner_id,
      learner_name: names.get(r.learner_id)?.name ?? 'Unknown learner',
      learner_roll: names.get(r.learner_id)?.roll ?? null,
      achievement_date: r.achievement_date,
      sport: r.sport ?? null,
      event_name: r.event_name,
      event_level: r.event_level,
      achievement_type: r.achievement_type,
      description: r.description ?? null,
      has_certificate: Boolean(r.certificate_url),
      verified: Boolean(r.verified),
      is_own: Boolean(actor.ownLearnerId) && r.learner_id === actor.ownLearnerId,
    })),
  };
}

/**
 * Set or clear the IQAC verified tick. Records verified_by as the acting user on
 * verify and clears it on un-verify, so the audit trail never points at someone
 * who did not make the current decision.
 *
 * Verifying a row also emits NAAC 8.3 evidence into quality_evidence_mappings,
 * via the trg_hsa_evidence_fanout trigger from migration 20260726114500 — and
 * withdraws it again on un-verify. An earlier round of this PR reported that
 * fan-out as broken; that was a false alarm. Re-measured on production
 * 2026-07-30 inside BEGIN..ROLLBACK: the trigger is installed and enabled
 * (AFTER INSERT OR UPDATE, tgenabled='O') and inserting a verified row produced
 * exactly one mapping — NAAC 8.3, period AY 2026-27, is_auto=true.
 */
export async function setAchievementVerified(
  id: string,
  verified: boolean,
): Promise<SetVerifiedResult> {
  if (!id) return { ok: false, error: 'An achievement id is required.' };

  const actor = await resolveActor();
  if (!actor.userId) return { ok: false, error: 'Not signed in.' };
  if (!actor.canVerify) {
    return {
      ok: false,
      error:
        'Only the accreditation / IQAC team can verify an achievement. Ask them to confirm this record.',
    };
  }

  const admin = createServiceRoleClient();
  const { data: row, error: readErr } = await (admin as any)
    .from('health_sports_achievements')
    .select('id, learner_id')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Could not load the achievement: ${readErr.message}` };
  if (!row) return { ok: false, error: 'That achievement no longer exists.' };

  // D4, enforced server-side rather than by hiding a button: nobody verifies
  // their own record, whatever permissions they hold.
  if (actor.ownLearnerId && row.learner_id === actor.ownLearnerId) {
    return {
      ok: false,
      error:
        'You cannot verify your own achievement. An IQAC colleague has to confirm it.',
    };
  }

  const { error: writeErr } = await (admin as any)
    .from('health_sports_achievements')
    .update({
      verified,
      verified_by: verified ? actor.userId : null,
    })
    .eq('id', id);
  if (writeErr) {
    return { ok: false, error: `Could not save the verification: ${writeErr.message}` };
  }

  return { ok: true };
}
