// types/cdc/mentors.ts
// CDC Mentor Pairings (senior-learner ↔ fresher-learner) — type definitions from live DB

export type MentoringStatus = 'active' | 'concluded' | 'paused';

export interface CdcMentorPairing {
  id: string;
  mentor_learner_id: string;
  mentee_learner_id: string;
  mentorship_category_id: string | null;
  status: MentoringStatus;
  paired_at: string;
  concluded_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CdcMentorPairingWithLearners extends CdcMentorPairing {
  mentor: {
    id: string;
    name: string;
    roll_number: string | null;
    institution_id: string | null;
  } | null;
  mentee: {
    id: string;
    name: string;
    roll_number: string | null;
    institution_id: string | null;
  } | null;
}

export interface CreateMentorPairingDto {
  mentor_learner_id: string;
  mentee_learner_id: string;
  // Required on new records (BUG-004094): the mentorship domain, sourced
  // from the cdc_mentorship_categories config-master.
  mentorship_category_id: string;
  notes?: string;
}

export interface UpdateMentorPairingDto {
  status?: MentoringStatus;
  notes?: string;
  concluded_at?: string;
  mentorship_category_id?: string;
}

export interface MentorPairingFilters {
  mentor_learner_id?: string;
  mentee_learner_id?: string;
  status?: MentoringStatus;
  institution_id?: string;
  page?: number;
  limit?: number;
}

export interface MentorPairingListResponse {
  data: CdcMentorPairingWithLearners[];
  total: number;
  page: number;
  limit: number;
}
