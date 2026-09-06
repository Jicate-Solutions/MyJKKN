// types/cdc/mentor-sessions.ts — mentor session mapping (BUG-004198).
// Unified session log over BOTH peer (cdc_mentor_pairings) and industry
// (cdc_industry_mentor_pairings) mentoring, plus the fixed industry assignment.

export type MentorPairingKind = 'peer' | 'industry';

export interface MentorSession {
  id: string;
  pairing_kind: MentorPairingKind;
  peer_pairing_id: string | null;
  industry_pairing_id: string | null;
  session_date: string;
  duration_minutes: number | null;
  mode: string | null;
  topics_discussed: string[];
  outcome_notes: string | null;
  action_items: string | null;
  next_session_date: string | null;
  mentor_rating: number | null;
  mentee_rating: number | null;
  logged_by: string | null;
  created_at: string;
}

export interface PairingRollup {
  pairing_id: string;
  session_count: number;
  total_minutes: number;
  last_session_at: string | null;
  next_session_at: string | null;
}

export interface IndustryMentorPairing {
  id: string;
  industry_mentor_id: string;
  mentee_learner_id: string;
  institution_id: string | null;
  status: 'active' | 'concluded' | 'paused';
  assigned_at: string;
  concluded_at: string | null;
  notes: string | null;
  // Joined
  mentee?: { first_name: string | null; last_name: string | null; register_number: string | null } | null;
  rollup?: PairingRollup | null;
}

export interface LogSessionPayload {
  kind: MentorPairingKind;
  pairing_id: string;
  session_date: string;
  duration_minutes?: number | null;
  mode?: string | null;
  topics_discussed?: string[];
  outcome_notes?: string | null;
  action_items?: string | null;
  next_session_date?: string | null;
  mentor_rating?: number | null;
  mentee_rating?: number | null;
}
