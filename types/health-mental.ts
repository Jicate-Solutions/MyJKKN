// types/health-mental.ts
// Types for Phase 2: Mental Health (PHQ-9, GAD-7, Escalation, Peer Support)
// Created: 2026-04-12

// ============================================================================
// Assessment Types
// ============================================================================

export type AssessmentType = 'phq9' | 'gad7';
export type AssessmentStatus = 'completed' | 'declined' | 'in_progress';

export interface HealthAssessment {
  id: string;
  learner_id: string;
  assessment_type: AssessmentType;
  responses: AssessmentResponse[];
  total_score: number;
  severity: string;
  status: AssessmentStatus;
  declined_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AssessmentResponse {
  question_index: number;
  score: number; // 0-3
}

// ============================================================================
// PHQ-9 (Depression Screening)
// ============================================================================

export const PHQ9_QUESTIONS: string[] = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading or watching TV',
  'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless',
  'Thoughts that you would be better off dead, or of hurting yourself in some way',
];

export const PHQ9_OPTIONS = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
] as const;

export const PHQ9_SEVERITY: { min: number; max: number; label: string; color: string; bg: string; action: string }[] = [
  { min: 0, max: 4, label: 'Minimal', color: 'text-green-700', bg: 'bg-green-50', action: 'No action needed. Keep monitoring.' },
  { min: 5, max: 9, label: 'Mild', color: 'text-yellow-700', bg: 'bg-yellow-50', action: 'Consider watchful waiting. Repeat screening.' },
  { min: 10, max: 14, label: 'Moderate', color: 'text-orange-700', bg: 'bg-orange-50', action: 'Consider counseling or follow-up.' },
  { min: 15, max: 19, label: 'Moderately Severe', color: 'text-red-600', bg: 'bg-red-50', action: 'We recommend speaking with a counselor.' },
  { min: 20, max: 27, label: 'Severe', color: 'text-red-800', bg: 'bg-red-100', action: 'We strongly recommend speaking with a counselor immediately.' },
];

// ============================================================================
// GAD-7 (Anxiety Screening)
// ============================================================================

export const GAD7_QUESTIONS: string[] = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid as if something awful might happen',
];

export const GAD7_OPTIONS = PHQ9_OPTIONS; // Same 0-3 scale

export const GAD7_SEVERITY: { min: number; max: number; label: string; color: string; bg: string; action: string }[] = [
  { min: 0, max: 4, label: 'Minimal', color: 'text-green-700', bg: 'bg-green-50', action: 'No action needed.' },
  { min: 5, max: 9, label: 'Mild', color: 'text-yellow-700', bg: 'bg-yellow-50', action: 'Monitor and repeat screening.' },
  { min: 10, max: 14, label: 'Moderate', color: 'text-orange-700', bg: 'bg-orange-50', action: 'Consider counseling.' },
  { min: 15, max: 21, label: 'Severe', color: 'text-red-700', bg: 'bg-red-50', action: 'We recommend speaking with a counselor.' },
];

// ============================================================================
// Escalation Types
// ============================================================================

export type EscalationTrigger = 'phq9_high' | 'gad7_high' | 'mood_pattern' | 'manual';
export type EscalationStatus = 'open' | 'contacted' | 'in_session' | 'resolved' | 'false_positive';

export interface HealthEscalation {
  id: string;
  learner_id: string;
  assessment_id: string | null;
  trigger_type: EscalationTrigger;
  trigger_score: number | null;
  trigger_severity: string | null;
  counselor_id: string | null;
  status: EscalationStatus;
  counselor_notes: string | null;
  contacted_at: string | null;
  resolved_at: string | null;
  escalation_level: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  learner_name?: string;
  learner_phone?: string;
  learner_institution?: string;
}

export const ESCALATION_STATUS_CONFIG: Record<EscalationStatus, { label: string; color: string; icon: string }> = {
  open: { label: 'Open', color: 'text-red-600 bg-red-50 border-red-200', icon: '🔴' },
  contacted: { label: 'Contacted', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: '🟡' },
  in_session: { label: 'In Session', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: '🔵' },
  resolved: { label: 'Resolved', color: 'text-green-600 bg-green-50 border-green-200', icon: '🟢' },
  false_positive: { label: 'False Positive', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: '⚪' },
};

// ============================================================================
// Peer Support Types
// ============================================================================

export type PeerSupportCategory = 'general' | 'stress' | 'anxiety' | 'loneliness' | 'academic' | 'relationships';
export type ModerationStatus = 'pending' | 'approved' | 'flagged' | 'removed';

export interface PeerSupportPost {
  id: string;
  author_id: string;
  category: PeerSupportCategory;
  content: string;
  is_anonymous: boolean;
  moderation_status: ModerationStatus;
  reply_count: number;
  support_count: number;
  created_at: string;
}

export const PEER_SUPPORT_CATEGORIES: { value: PeerSupportCategory; label: string; emoji: string }[] = [
  { value: 'general', label: 'General', emoji: '💬' },
  { value: 'stress', label: 'Stress', emoji: '😤' },
  { value: 'anxiety', label: 'Anxiety', emoji: '😰' },
  { value: 'loneliness', label: 'Loneliness', emoji: '🫂' },
  { value: 'academic', label: 'Academic Pressure', emoji: '📚' },
  { value: 'relationships', label: 'Relationships', emoji: '💔' },
];

// ============================================================================
// Scoring Helpers
// ============================================================================

export function scorePHQ9(responses: AssessmentResponse[]): { score: number; severity: typeof PHQ9_SEVERITY[number] } {
  const score = responses.reduce((sum, r) => sum + r.score, 0);
  const severity = PHQ9_SEVERITY.find(s => score >= s.min && score <= s.max) || PHQ9_SEVERITY[0];
  return { score, severity };
}

export function scoreGAD7(responses: AssessmentResponse[]): { score: number; severity: typeof GAD7_SEVERITY[number] } {
  const score = responses.reduce((sum, r) => sum + r.score, 0);
  const severity = GAD7_SEVERITY.find(s => score >= s.min && score <= s.max) || GAD7_SEVERITY[0];
  return { score, severity };
}

export const ESCALATION_THRESHOLD_PHQ9 = 15;
export const ESCALATION_THRESHOLD_GAD7 = 15; // Using 15 (not 10) per spec — "moderately severe"
