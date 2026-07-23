// types/cdc/mentor-rollups.ts
// F5 per-mentor + per-mentee rollups (BUG-004198 follow-up, D2).
// Read-only aggregates over cdc_mentor_sessions, name-resolved + institution-scoped
// by /api/cdc/mentors/rollups.

export interface PeerMentorRollup {
  mentor_learner_id: string;
  name: string;
  register_number: string | null;
  mentee_count: number;
  pairing_count: number;
  active_pairing_count: number;
  session_count: number;
  total_minutes: number;
  last_session_at: string | null;
}

export interface IndustryMentorRollup {
  industry_mentor_id: string;
  mentor_name: string;
  company_name: string | null;
  mentee_count: number;
  pairing_count: number;
  active_pairing_count: number;
  session_count: number;
  total_minutes: number;
  last_session_at: string | null;
}

export interface MenteeRollup {
  mentee_learner_id: string;
  name: string;
  register_number: string | null;
  peer_mentor_count: number;
  industry_mentor_count: number;
  total_mentor_count: number;
  total_session_count: number;
  total_minutes: number;
  last_session_at: string | null;
}

export interface MentorRollupsResponse {
  peerMentors: PeerMentorRollup[];
  industryMentors: IndustryMentorRollup[];
  mentees: MenteeRollup[];
}
