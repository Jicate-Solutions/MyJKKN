// Service for `learner_hostel_profiles` — the 1:1 side-table on top of
// `learners_profiles` carrying warden-writable hostel fields (emergency
// contact + medical + parent hostel phone).
//
// Why a side-table: admission owns learners_profiles, wardens own hostel-
// specific fields. Keeping them in a separate table avoids column-ownership
// confusion and simplifies RLS (the 5 fields here get the
// `campus_living.residents.edit` permission gate; the admission columns on
// learners_profiles stay under admission's RLS policies).
//
// `hostel_type` is an intentional exception — it lives on
// learners_profiles.hostel_type (billing reads from there) and is updated
// via `updateHostelType` below, not through this table. The drawer's Save
// button calls `saveHostelFields` which bundles both writes so the UX
// reads as one atomic save even though it's two queries underneath.
//
// See specs/warden-edit-hostel-fields-spec.md for rationale.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { LearnerHostelType } from '@/types/campus-living';
import type {
  LearnerHostelProfile,
  UpsertLearnerHostelProfileDTO,
} from '@/types/learner-hostel-profile';

const LOG_MODULE = 'campus-living/learner-hostel-profile';

const PROFILE_SELECT = [
  'id',
  'learner_id',
  'hostel_emergency_contact_name',
  'hostel_emergency_contact_phone',
  'hostel_emergency_contact_relation',
  'hostel_medical_notes',
  'hostel_parent_phone',
  'updated_by',
  'created_at',
  'updated_at',
].join(',');

export class LearnerHostelProfileService {
  // ── Fetch single profile (or null if no row yet) ─────────────────────
  // Uses `.maybeSingle()` — a missing row is a valid "first-save" state and
  // must return null, not throw PGRST116. This is the same gotcha PR #414
  // documented; we follow the fix here.
  static async getProfile(learnerId: string): Promise<LearnerHostelProfile | null> {
    try {
      if (!learnerId) return null;
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('learner_hostel_profiles')
        .select(PROFILE_SELECT)
        .eq('learner_id', learnerId)
        .maybeSingle();

      if (error) {
        logger.error(LOG_MODULE, 'getProfile failed', error);
        throw error;
      }
      return (data as LearnerHostelProfile | null) ?? null;
    } catch (error) {
      logger.error(LOG_MODULE, 'Unexpected error in getProfile', error);
      throw error;
    }
  }

  // ── Upsert the hostel profile row ────────────────────────────────────
  // `onConflict: 'learner_id'` uses the UNIQUE constraint on learner_id
  // (see migration in Agent A's PR). updated_by is stamped from the caller
  // (auth context is not read here — keep the service pure).
  static async upsertProfile(
    payload: UpsertLearnerHostelProfileDTO,
    updatedBy: string | null,
  ): Promise<LearnerHostelProfile> {
    try {
      if (!payload.learner_id) {
        throw new Error('learner_id is required for upsertProfile');
      }
      const supabase = createClientSupabaseClient();

      // Normalise empty strings to null — the DB column allows null and
      // that's a cleaner "unset" representation than empty-string.
      const normalised: UpsertLearnerHostelProfileDTO & { updated_by: string | null } = {
        learner_id: payload.learner_id,
        hostel_emergency_contact_name:
          emptyToNull(payload.hostel_emergency_contact_name),
        hostel_emergency_contact_phone:
          emptyToNull(payload.hostel_emergency_contact_phone),
        hostel_emergency_contact_relation:
          emptyToNull(payload.hostel_emergency_contact_relation),
        hostel_medical_notes: emptyToNull(payload.hostel_medical_notes),
        hostel_parent_phone: emptyToNull(payload.hostel_parent_phone),
        updated_by: updatedBy,
      };

      const { data, error } = await supabase
        .from('learner_hostel_profiles')
        .upsert(normalised, { onConflict: 'learner_id' })
        .select(PROFILE_SELECT)
        .single();

      if (error) {
        logger.error(LOG_MODULE, 'upsertProfile failed', error);
        throw error;
      }
      return data as LearnerHostelProfile;
    } catch (error) {
      logger.error(LOG_MODULE, 'Unexpected error in upsertProfile', error);
      throw error;
    }
  }

  // ── Update hostel_type on learners_profiles ──────────────────────────
  // hostel_type stays on learners_profiles (not in the side-table) because
  // billing reads from there. This helper exists so the drawer can update
  // both surfaces from one Save click.
  //
  // hostelType === null → clears the column back to NULL ("Not set").
  static async updateHostelType(
    learnerId: string,
    hostelType: LearnerHostelType,
  ): Promise<void> {
    try {
      if (!learnerId) {
        throw new Error('learnerId is required for updateHostelType');
      }
      const supabase = createClientSupabaseClient();
      // Treat empty string as null for consistency with the rest of the
      // codebase (LearnerHostelType allows both).
      const value = hostelType && hostelType !== '' ? hostelType : null;
      const { error } = await supabase
        .from('learners_profiles')
        .update({ hostel_type: value })
        .eq('id', learnerId);

      if (error) {
        logger.error(LOG_MODULE, 'updateHostelType failed', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG_MODULE, 'Unexpected error in updateHostelType', error);
      throw error;
    }
  }

  // ── Composite save (what the drawer actually calls) ──────────────────
  // Runs hostel_type update + profile upsert. Two queries, not a single
  // transaction — Supabase JS client doesn't expose client-side tx, and
  // for this form the failure modes are benign:
  //   - If updateHostelType succeeds but upsertProfile fails, the user
  //     sees an error toast and retries; hostel_type change is already
  //     persisted (billing-safe).
  //   - If upsertProfile succeeds but updateHostelType fails (much less
  //     likely since it's the first call), same outcome — user retries.
  //
  // If future usage shows this is too fragile, move both writes into a
  // SECURITY DEFINER function on the DB side.
  static async saveHostelFields(input: {
    learnerId: string;
    hostelType: LearnerHostelType;
    profileFields: Omit<UpsertLearnerHostelProfileDTO, 'learner_id'>;
    updatedBy: string | null;
  }): Promise<LearnerHostelProfile> {
    await this.updateHostelType(input.learnerId, input.hostelType);
    return this.upsertProfile(
      { learner_id: input.learnerId, ...input.profileFields },
      input.updatedBy,
    );
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
