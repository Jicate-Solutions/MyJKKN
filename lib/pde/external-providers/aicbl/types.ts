export interface AicblEnvelope {
  event_id: string;
  event_type: string;
  client_id: string;
  emitted_at: string;
  schema_version: string;
  payload: unknown;
  signature: string;
}

export interface CaseCompletedPayload {
  session_id: string;
  case_slug: string;
  case_title: string;
  student_name: string;
  student_roll_no: string;
  started_at: string;
  completed_at: string;
  total_questions: number;
  questions_answered: number;
}

export interface DomainScore {
  domain_key: string;
  domain_label: string;
  score: number;
  max_score: number;
}

export interface OsceScoredPayload {
  session_id: string;
  case_slug: string;
  student_name: string;
  student_roll_no: string;
  total_score: number;
  max_score: number;
  percentage: number;
  domain_scores: DomainScore[];
}

export interface AtRiskPayload {
  student_name: string;
  student_roll_no: string;
  consecutive_low_sessions: number;
  most_recent_session_id: string;
  weakest_domain: string;
}
