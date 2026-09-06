// types/cdc/idp.ts
// Individual Development Plan — type definitions derived from live DB schema

// Learner self-submit + staff approval workflow (BUG-004298).
// State machine: 'draft' -> 'submitted' (learner) -> 'approved' (CDC staff only).
// The plan stays editable by the learner until it is approved.
export type IdpSubmissionStatus = 'draft' | 'submitted' | 'approved';

export interface CdcIdpResponse {
  id: string;
  learner_id: string;
  batch_id: string | null;
  academic_year_label: string | null;
  interests: string[];
  aspirations: Record<string, unknown>;
  club_picks: string[];
  three_year_plan: Record<string, unknown>;
  skills_self_attribution: string[];
  // Free-text narrative answer to "My Academic Strengths" (BUG-004061).
  // Distinct from skills_self_attribution: that is a tag array of self-rated
  // skills; this is a written paragraph the learner authors about their
  // academic strong points. Nullable for rows created before this field.
  academic_strengths: string | null;
  free_text_notes: string | null;
  // BUG-004197 (provenance): map of field -> source recording which IDP fields
  // received a non-empty machine suggestion at create time (e.g.
  // { interests: 'prior_idp', club_picks: 'cdc_club_memberships' }). Empty {}
  // for fully hand-typed rows. Lets CDC report "% machine-suggested".
  prefill_sources: Record<string, string>;
  source: 'native_form' | 'google_form_import';
  source_response_id: string | null;
  // Self-submit workflow (BUG-004298). NOT NULL DEFAULT 'draft' at the DB level;
  // '' is never valid. Rows created before this column read as 'draft' via default.
  submission_status: IdpSubmissionStatus;
  submitted_at: string;
  updated_at: string;
  // Set when a CDC coordinator approves the plan (BUG-004298); null until then.
  approved_at: string | null;
  approved_by: string | null;
  created_by: string | null;
  updated_by: string | null;
}

export interface CdcIdpResponseWithLearner extends CdcIdpResponse {
  learner: {
    id: string;
    name: string;
    roll_number: string | null;
    institution_id: string | null;
  } | null;
}

export interface CreateIdpResponseDto {
  learner_id: string;
  batch_id?: string;
  academic_year_label?: string;
  interests?: string[];
  aspirations?: Record<string, unknown>;
  club_picks?: string[];
  three_year_plan?: Record<string, unknown>;
  skills_self_attribution?: string[];
  // Free-text "My Academic Strengths" answer (BUG-004061). Distinct from
  // skills_self_attribution (tag array).
  academic_strengths?: string;
  free_text_notes?: string;
  // BUG-004197 (provenance): which fields were machine-suggested at create time.
  // Set by the create form from the prefill draft; '{}' when nothing was prefilled.
  prefill_sources?: Record<string, string>;
  // Self-submit workflow (BUG-004298). Learner create/save uses 'draft'; the
  // Submit button uses 'submitted'. Learners may never pass 'approved' (RLS
  // rejects it) — approval goes through IdpService.approve(), staff-only.
  submission_status?: IdpSubmissionStatus;
}

export interface UpdateIdpResponseDto extends Partial<CreateIdpResponseDto> {
  updated_by?: string;
}

export interface IdpFilters {
  institution_id?: string;
  academic_year_label?: string;
  learner_id?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export interface IdpListResponse {
  data: CdcIdpResponseWithLearner[];
  total: number;
  page: number;
  limit: number;
}

// IDP create-time prefill (BUG-004197). Read-only draft assembled from a
// learner's existing data; hydrates the NEW IDP form so it starts pre-filled
// instead of blank. Create-only — never used to re-fill an existing plan.
export interface PrefilledIdpDraft {
  learner: {
    id: string;
    name: string;
    register_number: string | null;
    // Contact + academic enrichment for the IDP Learner card (BUG-004264).
    // Read from learners_profiles; each is null when the underlying field is blank.
    // Academic performance (CGPA / backlogs) is intentionally absent — MyJKKN stores
    // no per-learner CGPA/backlog anywhere (only drive-side eligibility thresholds),
    // matching this route's existing "OBE marks are empty in prod" note.
    email: string | null;
    mobile: string | null;
    program: string | null;
    department: string | null;
    semester: string | null;
  };
  interests: string[];
  skills: string[];               // → skills_self_attribution
  academicStrengths: string;      // self-reported carry-forward (D1)
  clubPicks: string[];            // from active club memberships
  priorIdpYear: string | null;    // AY of the prior IDP, for the "carried from" banner
  hasPriorIdp: boolean;
}
