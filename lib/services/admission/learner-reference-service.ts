// lib/services/admission/learner-reference-service.ts
// ============================================================================
// Learner Reference Service
// ============================================================================
// Writes the reference/referral attribution of ONE learner and nothing else.
//
// WHY A DEDICATED SERVICE RATHER THAN THE PROFILE FORM
// /api/learners/bulk-edit-exited and the shared EnquiryForm both write ~60
// mapped columns. The brief here is "reference details only", so this module
// names the six columns explicitly and can be read in one screen to confirm
// that no seventh column is reachable.
//
// TWO SYSTEMS, BOTH WRITTEN
//   typed  (authoritative): referral_type / referred_by_id / referred_by_name
//   legacy (mirror):        reference_type / reference_name / reference_contact
// The legacy trio still renders on /learners/profiles/[id] and is consumed by
// B2A/API integrations, so leaving it stale would make the two views disagree.
//
// referred_by_id is POLYMORPHIC with NO foreign key — its target table is
// decided by referral_type. A wrong-table uuid writes silently with no 23503,
// so the pairing is asserted here before the update is sent.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type { ReferralValue } from '@/components/admission/referral-picker';

/** Legacy free-text labels. All three are members of EXCEL_REFERENCE_TYPE
 *  (lib/utils/mappings/enquiry-excel-mappings.ts) so the bulk-edit export and
 *  this editor round-trip to the same vocabulary. */
const LEGACY_LABEL: Record<string, string> = {
  consultant: 'EDUCATIONAL CONSULTANT',
  student: 'CURRENT/FORMER STUDENT',
  faculty: 'JKKN STAFF',
};

/** The table referred_by_id must point at, per referral_type. */
const TARGET_TABLE: Record<string, string> = {
  consultant: 'education_consultants',
  student: 'learners_profiles',
  faculty: 'staff',
};

export interface LearnerReferenceInput extends ReferralValue {
  /** Legacy reference_contact — free text, no typed equivalent exists. */
  reference_contact?: string | null;
}

export const LearnerReferenceService = {
  /**
   * Update the six reference columns for one learner.
   *
   * Passing referral_type = null clears the typed trio and records the learner
   * as a direct application in the legacy column — there is no 'direct' value
   * in the learners_profiles_referral_type_check constraint.
   */
  async update(learnerId: string, input: LearnerReferenceInput): Promise<void> {
    const supabase = createClientSupabaseClient();

    const type = input.referral_type;
    const id = input.referred_by_id?.trim() || null;
    const name = input.referred_by_name?.trim() || null;

    // A polymorphic id with no type, or an id whose type has no target table,
    // would be unresolvable on read. Refuse rather than write it.
    if (id && (!type || !TARGET_TABLE[type])) {
      throw new Error('Cannot save a referrer id without a valid referral type');
    }

    // Prove the id lives in the table its type claims. Cheap (one indexed
    // lookup) and the only guard that exists — there is no FK to catch this.
    if (id && type) {
      const { data, error } = await (supabase as any)
        .from(TARGET_TABLE[type])
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw new Error(`Could not verify the referrer: ${getErrorMessage(error)}`);
      }
      if (!data) {
        throw new Error(
          `The selected referrer is not a valid ${type} record. Pick again or enter the name only.`
        );
      }
    }

    const payload = {
      // typed (authoritative)
      referral_type: type,
      referred_by_id: id,
      referred_by_name: name,
      // legacy (mirror) — kept in step so the detail page and API agree
      reference_type: type ? LEGACY_LABEL[type] ?? null : name ? 'OTHERS' : 'DIRECT APPLICATION',
      reference_name: name,
      reference_contact: input.reference_contact?.trim() || null,
    };

    const { error } = await (supabase as any)
      .from('learners_profiles')
      .update(payload)
      .eq('id', learnerId);

    // try/catch does NOT catch RLS denials or constraint violations — they come
    // back in `error`, and Supabase errors are plain objects, not Error.
    if (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
