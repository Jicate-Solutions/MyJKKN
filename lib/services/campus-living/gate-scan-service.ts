/**
 * Gate-scan lookups — turn a scanned card code into a learner the gate can act
 * on, plus the live answer to "is this person still here, and do they live in
 * a hostel at all".
 *
 * TWO IDENTITY SPACES, and they are not the same one:
 *   • the MyJKKN QR carries a permanent JKKN ID (`348295-7`), and older cards
 *     carry a raw `learners_profiles.id` UUID
 *   • `hostel_gate_passes.learner_id` is a `profiles.id`
 * The bridge is `profiles.learner_id -> learners_profiles.id`, so every
 * resolution below ends by handing back a profiles row.
 *
 * BOTH CARD SHAPES ARE ACCEPTED for the whole overlap period. The JKKN QR the
 * learner shows from the top navbar (components/identity/jkkn-qr-dialog.tsx)
 * encodes the plain JKKN ID — the same value the printed card carries — so the
 * gate works against the existing identity system with no change to it.
 *
 * CLIENT INJECTION. Every function takes an optional Supabase client and falls
 * back to the browser singleton. The gate's write path
 * (/api/campus-living/gate-passes/scan) runs server-side under the service
 * role, because the audit-log half of a scan cannot be written from a browser
 * at all — see the route for the measured reason. Threading the client keeps
 * ONE resolver for both callers instead of a server copy that drifts.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  classifyCardCode,
  type ScanSubject,
} from '@/lib/services/campus-living/gate-scan-resolve';

const LOG = 'campus-living/gate-scan';

/** Any Supabase client — browser singleton, request-scoped server, or service role. */
type AnyClient = ReturnType<typeof createClientSupabaseClient>;

const db = (client?: AnyClient): AnyClient => client ?? createClientSupabaseClient();

export interface ScannedLearner {
  /** profiles.id — what hostel_gate_passes.learner_id holds. */
  profileId: string;
  /** learners_profiles.id — what an older card QR carries. May be null. */
  learnerProfileId: string | null;
  fullName: string;
  /** learners_profiles.student_photo_url. Null when unreadable — the screen
   *  falls back to initials rather than failing the scan. */
  photoUrl: string | null;
  /** The learner's institution, for the audit-log row. */
  institutionId: string | null;
  /** The block they live in, for the audit-log row. Null when unallocated. */
  blockId: string | null;
  /**
   * Who this card belongs to, read LIVE on this scan — never cached and never
   * taken from the card. The plastic is what a leaver still holds; only the
   * record can say they have gone.
   */
  subject: ScanSubject;
}

/** The profiles columns every resolution path needs. `email` is the bridge to
 *  a team-member record for a card that is not a learner's. */
const PROFILE_COLS = 'id, full_name, learner_id, email';

type ProfileRow = {
  id: string;
  full_name: string | null;
  learner_id: string | null;
  email: string | null;
};

/** Fetch a profiles row by its own id. */
async function profileById(id: string, client?: AnyClient): Promise<ProfileRow | null> {
  const { data } = await db(client)
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Fetch a profiles row by the learners_profiles id it points at. */
async function profileByLearnerProfileId(
  learnerProfileId: string,
  client?: AnyClient,
): Promise<ProfileRow | null> {
  const { data } = await db(client)
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('learner_id', learnerProfileId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/**
 * Look the card code up in the permanent-ID register. Returns the
 * learners_profiles id, or null when the code is unknown.
 */
async function learnerProfileIdFromJkknId(
  code: string,
  client?: AnyClient,
): Promise<string | null> {
  try {
    const { data, error } = await db(client)
      .from('jkkn_identities')
      .select('learner_profile_id')
      .eq('jkkn_id', code)
      .is('retired_at', null)
      .maybeSingle();

    if (error) {
      logger.warn(LOG, 'JKKN identity lookup unavailable', { message: error.message });
      return null;
    }
    return (data as { learner_profile_id: string | null } | null)?.learner_profile_id ?? null;
  } catch (err) {
    logger.warn(LOG, 'JKKN identity lookup threw', err);
    return null;
  }
}

/**
 * The face, the lifecycle status and the institution, in one read of the
 * learner record.
 *
 * Best-effort by design: learners_profiles SELECT RLS can refuse a
 * block-scoped guard, and a missing face must not block a gate. When the read
 * fails everything comes back null, which `describeDeparture` treats as "not
 * shown to have left" — the guard sees the pass decision, not an invented
 * block. This scanner stops people it can SHOW have gone, and a row it cannot
 * read shows nothing.
 */
async function learnerFacts(
  learnerProfileId: string | null,
  client?: AnyClient,
): Promise<{ photoUrl: string | null; lifecycleStatus: string | null; institutionId: string | null }> {
  const empty = { photoUrl: null, lifecycleStatus: null, institutionId: null };
  if (!learnerProfileId) return empty;
  try {
    const { data, error } = await db(client)
      .from('learners_profiles')
      .select('student_photo_url, lifecycle_status, institution_id')
      .eq('id', learnerProfileId)
      .maybeSingle();
    if (error) {
      logger.warn(LOG, 'Learner record unreadable on scan', { message: error.message });
      return empty;
    }
    const row = data as {
      student_photo_url: string | null;
      lifecycle_status: string | null;
      institution_id: string | null;
    } | null;
    return {
      photoUrl: row?.student_photo_url ?? null,
      lifecycleStatus: row?.lifecycle_status ?? null,
      institutionId: row?.institution_id ?? null,
    };
  } catch (err) {
    logger.warn(LOG, 'Learner record lookup threw', err);
    return empty;
  }
}

/**
 * Does this learner currently live in a hostel, and in which block?
 *
 * Returns `hasAllocation: null` when the read itself failed — a refusal the
 * scanner must NOT convert into "not a resident". Only a successful read that
 * found no active allocation is evidence.
 */
async function currentAllocation(
  profileId: string,
  client?: AnyClient,
): Promise<{ hasAllocation: boolean | null; blockId: string | null }> {
  try {
    const { data, error } = await db(client)
      .from('hostel_allocations')
      .select('block_id')
      .eq('learner_id', profileId)
      .eq('status', 'active')
      .order('allocation_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn(LOG, 'Allocation unreadable on scan', { message: error.message });
      return { hasAllocation: null, blockId: null };
    }
    const row = data as { block_id: string | null } | null;
    return { hasAllocation: Boolean(row), blockId: row?.block_id ?? null };
  } catch (err) {
    logger.warn(LOG, 'Allocation lookup threw', err);
    return { hasAllocation: null, blockId: null };
  }
}

/**
 * Is the person behind this card still on the staff register?
 *
 * `staff.is_active` is the employment flag — the same one the print guard
 * reads. NOT `staff.status`, which is a profile-page publish state
 * ('draft' / 'published') and says nothing about whether someone still works
 * here. Returns null when we could not establish it.
 */
async function teamMemberIsActive(
  email: string | null,
  client?: AnyClient,
): Promise<boolean | null> {
  const value = (email ?? '').trim();
  if (value === '') return null;
  try {
    for (const column of ['institution_email', 'email'] as const) {
      const { data, error } = await db(client)
        .from('staff')
        .select('is_active')
        .eq(column, value)
        .limit(1);
      if (error) continue;
      const rows = data as Array<{ is_active: boolean | null }> | null;
      if (rows && rows.length > 0) return rows[0].is_active ?? null;
    }
    return null;
  } catch (err) {
    logger.warn(LOG, 'Team-member lookup threw', err);
    return null;
  }
}

/**
 * Resolve a scanned card code to the learner the gate pass belongs to.
 * Returns null when the code matches nobody — the screen shows
 * "Card not recognised", never a crash and never a silent no-op.
 */
export async function resolveScannedLearner(
  rawCode: string,
  client?: AnyClient,
): Promise<ScannedLearner | null> {
  const code = (rawCode ?? '').trim();
  if (!code) return null;

  const kind = classifyCardCode(code);
  let profile: ProfileRow | null = null;

  if (kind === 'uuid') {
    // Older card: a raw learners_profiles.id. Fall back to treating the UUID
    // as a profiles.id, which is what an admin-side deep link carries.
    profile = await profileByLearnerProfileId(code, client);
    if (!profile) profile = await profileById(code, client);
  } else {
    // The MyJKKN QR, and anything else the reader produced: ask the permanent
    // ID register before giving up.
    const learnerProfileId = await learnerProfileIdFromJkknId(code, client);
    if (learnerProfileId) profile = await profileByLearnerProfileId(learnerProfileId, client);
  }

  if (!profile) return null;

  // profiles.learner_id IS the learners_profiles id — the only value that
  // belongs in this field. Never fall back to `code`: on the profileById path
  // `code` is a profiles.id, and putting it in a field named learnerProfileId
  // would quietly hand the wrong identity space to the next reader.
  const learnerProfileId = profile.learner_id ?? null;
  const [{ photoUrl, lifecycleStatus, institutionId }, allocation] = await Promise.all([
    learnerFacts(learnerProfileId, client),
    currentAllocation(profile.id, client),
  ]);

  // A card with no learner record behind it belongs to a team member, or to an
  // administrative account that is neither. Ask the staff register before
  // settling for "we could not classify this person".
  let subject: ScanSubject;
  if (learnerProfileId) {
    subject = {
      kind: 'learner',
      lifecycleStatus,
      hasActiveAllocation: allocation.hasAllocation,
    };
  } else {
    const isActive = await teamMemberIsActive(profile.email, client);
    subject = isActive === null ? { kind: 'unclassified' } : { kind: 'team_member', isActive };
  }

  return {
    profileId: profile.id,
    learnerProfileId,
    fullName: profile.full_name ?? 'Unnamed learner',
    photoUrl,
    institutionId,
    blockId: allocation.blockId,
    subject,
  };
}

/** Display name of whoever approved the pass. Best-effort. */
export async function approverName(
  approvedBy: string | null,
  client?: AnyClient,
): Promise<string | null> {
  if (!approvedBy) return null;
  try {
    const { data } = await db(client)
      .from('profiles')
      .select('full_name')
      .eq('id', approvedBy)
      .maybeSingle();
    return (data as { full_name: string | null } | null)?.full_name ?? null;
  } catch {
    return null;
  }
}
