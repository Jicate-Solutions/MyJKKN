// types/cdc/idp.ts
// Individual Development Plan — type definitions derived from live DB schema

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
  source: 'native_form' | 'google_form_import';
  source_response_id: string | null;
  submitted_at: string;
  updated_at: string;
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
