/**
 * Gate-scan lookups — turn a scanned card code into a learner the gate screen
 * can act on.
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
import { classifyCardCode } from '@/lib/services/campus-living/gate-scan-resolve';

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
}

/** Fetch a profiles row by its own id. */
async function profileById(id: string): Promise<{ id: string; full_name: string | null; learner_id: string | null } | null> {
  const supabase = createClientSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, learner_id')
    .eq('id', id)
    .maybeSingle();
  return (data as { id: string; full_name: string | null; learner_id: string | null } | null) ?? null;
}

/** Fetch a profiles row by the learners_profiles id it points at. */
async function profileByLearnerProfileId(
  learnerProfileId: string
): Promise<{ id: string; full_name: string | null; learner_id: string | null } | null> {
  const supabase = createClientSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, learner_id')
    .eq('learner_id', learnerProfileId)
    .maybeSingle();
  return (data as { id: string; full_name: string | null; learner_id: string | null } | null) ?? null;
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

/** Photo lookup is best-effort: learners_profiles SELECT RLS can refuse a
 *  block-scoped guard, and a missing face must not block a gate. */
async function photoFor(learnerProfileId: string | null): Promise<string | null> {
  if (!learnerProfileId) return null;
  try {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select('student_photo_url')
      .eq('id', learnerProfileId)
      .maybeSingle();
    if (error) return null;
    return (data as { student_photo_url: string | null } | null)?.student_photo_url ?? null;
  } catch {
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
  let profile: { id: string; full_name: string | null; learner_id: string | null } | null = null;

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
  return {
    profileId: profile.id,
    learnerProfileId,
    fullName: profile.full_name ?? 'Unnamed learner',
    photoUrl: await photoFor(learnerProfileId),
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
