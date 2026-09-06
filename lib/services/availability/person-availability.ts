// lib/services/availability/person-availability.ts
//
// The Availability Spine — Limb 2 (PEOPLE) client wrapper.
//
// ONE shared question — "is this person free during [start, end)?" — answered by
// the database brain fn_person_conflicts / fn_people_conflicts, which unions a
// person's three diaries that today can't see each other:
//   • TEACHING  — timetables (recurring weekly grid, resolved to absolute IST)
//   • MEETINGS  — meeting_bookings (host or attendee)
//   • EVENT WORK — speaking at a session / a timed role on an event
//
// This service holds NO availability logic of its own (same discipline as Limb 1's
// event-venue layer over ReservationService): it only calls the brain. Any module
// that assigns a person to a timed slot can import this to surface conflicts.
//
// POLICY: conflicts are ADVISORY — the brain reports, the caller decides. A
// teaching overlap is often legitimately resolvable; v1 warns rather than refuses.
//
// excludeSessionId: when EDITING an existing timed assignment, the booking being
// edited is not a conflict with itself — pass its session id and the brain skips
// that one row. The key is spread in only when set, so on a database that hasn't
// taken 20260827010000 yet the 3-arg call still resolves and create-new keeps
// its full conflict check.
import { createClientSupabaseClient } from '@/lib/supabase/client';

// The availability-brain RPCs (fn_person_conflicts / fn_people_conflicts) are
// newer than the generated DB types, so type the client as `any` for these calls
// — same pattern as InductionSpeakersService. The return values are cast back to
// the strongly-typed PersonConflict[] so callers keep full type safety.
const getSupabase = (): any => createClientSupabaseClient();

export type PersonConflictSource = 'teaching' | 'meeting' | 'event';

export interface PersonConflict {
  /** present on batch (fn_people_conflicts) results; absent on single calls */
  profile_id?: string;
  /** present on guest (fn_guest_speaker_conflicts) results */
  guest_id?: string;
  source: PersonConflictSource | string;
  ref_id: string | null;
  label: string;
  starts_at: string | null;
  ends_at: string | null;
}

export class PersonAvailabilityService {
  /** Conflicts for ONE person in [startIso, endIso). Empty if inputs are missing
   *  or the caller isn't scoped to that person's institution (graceful). */
  static async getConflicts(
    profileId: string,
    startIso: string,
    endIso: string,
    excludeSessionId?: string | null,
  ): Promise<PersonConflict[]> {
    if (!profileId || !startIso || !endIso) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_person_conflicts', {
      p_profile_id: profileId,
      p_start: startIso,
      p_end: endIso,
      ...(excludeSessionId ? { p_exclude_session_id: excludeSessionId } : {}),
    });
    if (error) throw error;
    return (data as PersonConflict[]) ?? [];
  }

  /** Conflicts for MANY people in one round-trip — rows are tagged with
   *  profile_id. Used by the speaker picker to check every selected person at
   *  once. Empty for an empty id list. */
  static async getPeopleConflicts(
    profileIds: string[],
    startIso: string,
    endIso: string,
    excludeSessionId?: string | null,
  ): Promise<PersonConflict[]> {
    if (!profileIds.length || !startIso || !endIso) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_people_conflicts', {
      p_profile_ids: profileIds,
      p_start: startIso,
      p_end: endIso,
      ...(excludeSessionId ? { p_exclude_session_id: excludeSessionId } : {}),
    });
    if (error) throw error;
    return (data as PersonConflict[]) ?? [];
  }

  /** The same question for an outside guest who has no login account, so the
   *  double-booking check covers them too (Director decision D11). Rows come
   *  back in the identical shape and are merged into the same conflict map —
   *  this is the one availability spine reading a second identity, not a second
   *  mechanism. A guest has exactly one diary (the sessions they speak at):
   *  no timetable, no meetings, no event roles. */
  static async getGuestConflicts(
    guestIds: string[],
    startIso: string,
    endIso: string,
  ): Promise<PersonConflict[]> {
    if (!guestIds.length || !startIso || !endIso) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_guest_speaker_conflicts', {
      p_guest_ids: guestIds,
      p_start: startIso,
      p_end: endIso,
    });
    if (error) throw error;
    return (data as PersonConflict[]) ?? [];
  }
}
