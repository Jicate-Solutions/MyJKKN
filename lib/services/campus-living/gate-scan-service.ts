/**
 * Gate-scan lookups — turn a scanned card code into a learner the gate screen
 * can act on, plus the live answer to "is this person still here at all".
 *
 * TWO IDENTITY SPACES, and they are not the same one:
 *   • the ID card QR carries a `learners_profiles.id` UUID today
 *   • `hostel_gate_passes.learner_id` is a `profiles.id`
 * The bridge is `profiles.learner_id -> learners_profiles.id`, so every
 * resolution below ends by handing back a profiles row.
 *
 * A sibling lane is switching the card to the permanent JKKN ID
 * (`jkkn_identities.jkkn_id`, e.g. `348295-7`). Both shapes are accepted for
 * the whole overlap period. The JKKN register SHIPS DORMANT and its tables
 * are not applied on production yet, so a missing-relation error there is
 * treated as "no match", never as a crash.
 *
 * Deliberately NOT importing the sibling lane's identity helpers — the lanes
 * must stay independently mergeable. A follow-up de-duplicates.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  classifyCardCode,
  type ScanSubject,
} from '@/lib/services/campus-living/gate-scan-resolve';

const LOG = 'campus-living/gate-scan';

export interface ScannedLearner {
  /** profiles.id — what hostel_gate_passes.learner_id holds. */
  profileId: string;
  /** learners_profiles.id — what the card QR carries today. May be null. */
  learnerProfileId: string | null;
  fullName: string;
  /** learners_profiles.student_photo_url. Null when unreadable — the screen
   *  falls back to initials rather than failing the scan. */
  photoUrl: string | null;
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
async function profileById(id: string): Promise<ProfileRow | null> {
  const supabase = createClientSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Fetch a profiles row by the learners_profiles id it points at. */
async function profileByLearnerProfileId(learnerProfileId: string): Promise<ProfileRow | null> {
  const supabase = createClientSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('learner_id', learnerProfileId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/**
 * Look the card code up in the permanent-ID register. Returns the
 * learners_profiles id, or null when the code is unknown — or when the
 * register itself is not present on this database yet.
 */
async function learnerProfileIdFromJkknId(code: string): Promise<string | null> {
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('jkkn_identities')
      .select('learner_profile_id')
      .eq('jkkn_id', code)
      .is('retired_at', null)
      .maybeSingle();

    if (error) {
      // The register ships dormant and may not exist here at all. That is a
      // "not recognised" answer for the guard, not an error to surface.
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
 * The face and the lifecycle status, in one read of the learner record.
 *
 * Best-effort by design: learners_profiles SELECT RLS can refuse a
 * block-scoped guard, and a missing face must not block a gate. When the read
 * fails the status comes back null, which `describeDeparture` treats as "not
 * shown to have left" — the guard sees the pass decision, not an invented
 * block. That is the documented trade-off: this guard stops people it can
 * SHOW have gone, and a row it cannot read shows nothing.
 */
async function learnerFacts(
  learnerProfileId: string | null
): Promise<{ photoUrl: string | null; lifecycleStatus: string | null }> {
  if (!learnerProfileId) return { photoUrl: null, lifecycleStatus: null };
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select('student_photo_url, lifecycle_status')
      .eq('id', learnerProfileId)
      .maybeSingle();
    if (error) {
      logger.warn(LOG, 'Learner record unreadable on scan', { message: error.message });
      return { photoUrl: null, lifecycleStatus: null };
    }
    const row = data as { student_photo_url: string | null; lifecycle_status: string | null } | null;
    return {
      photoUrl: row?.student_photo_url ?? null,
      lifecycleStatus: row?.lifecycle_status ?? null,
    };
  } catch (err) {
    logger.warn(LOG, 'Learner record lookup threw', err);
    return { photoUrl: null, lifecycleStatus: null };
  }
}

/**
 * Is the person behind this card still on the staff register?
 *
 * `staff.is_active` is the employment flag — the same one the print guard
 * reads. NOT `staff.status`, which is a profile-page publish state
 * ('draft' / 'published') and says nothing about whether someone still works
 * here. The bridge is the canonical email one, matching how the card render
 * engine finds a team member. Returns null when we could not establish it.
 */
async function teamMemberIsActive(email: string | null): Promise<boolean | null> {
  const value = (email ?? '').trim();
  if (value === '') return null;
  try {
    const supabase = createClientSupabaseClient();
    for (const column of ['institution_email', 'email'] as const) {
      const { data, error } = await supabase
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
export async function resolveScannedLearner(rawCode: string): Promise<ScannedLearner | null> {
  const code = (rawCode ?? '').trim();
  if (!code) return null;

  const kind = classifyCardCode(code);
  let profile: ProfileRow | null = null;

  if (kind === 'uuid') {
    // Today's card: a raw learners_profiles.id. Fall back to treating the
    // UUID as a profiles.id, which is what an admin-side deep link carries.
    profile = await profileByLearnerProfileId(code);
    if (!profile) profile = await profileById(code);
  } else {
    // Tomorrow's card, and anything else the reader produced: ask the
    // permanent-ID register before giving up.
    const learnerProfileId = await learnerProfileIdFromJkknId(code);
    if (learnerProfileId) profile = await profileByLearnerProfileId(learnerProfileId);
  }

  if (!profile) return null;

  // profiles.learner_id IS the learners_profiles id — the only value that
  // belongs in this field. Never fall back to `code` here: on the
  // profileById path `code` is a profiles.id, and putting it in a field
  // named learnerProfileId would quietly hand the wrong identity space to
  // the next reader. Null is the honest answer.
  const learnerProfileId = profile.learner_id ?? null;
  const { photoUrl, lifecycleStatus } = await learnerFacts(learnerProfileId);

  // A card with no learner record behind it belongs to a team member, or to
  // an administrative account that is neither. Ask the staff register before
  // settling for "we could not classify this person".
  let subject: ScanSubject;
  if (learnerProfileId) {
    subject = { kind: 'learner', lifecycleStatus };
  } else {
    const isActive = await teamMemberIsActive(profile.email);
    subject = isActive === null ? { kind: 'unclassified' } : { kind: 'team_member', isActive };
  }

  return {
    profileId: profile.id,
    learnerProfileId,
    fullName: profile.full_name ?? 'Unnamed learner',
    photoUrl,
    subject,
  };
}

/** Display name of whoever approved the pass. Best-effort. */
export async function approverName(approvedBy: string | null): Promise<string | null> {
  if (!approvedBy) return null;
  try {
    const supabase = createClientSupabaseClient();
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', approvedBy)
      .maybeSingle();
    return (data as { full_name: string | null } | null)?.full_name ?? null;
  } catch {
    return null;
  }
}
