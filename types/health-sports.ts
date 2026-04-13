// types/health-sports.ts
// Types for Sports & Fitness section of Health Module
// Based on JKKN Institutions Comprehensive Sports Policy
// Created: 2026-04-13

// ============================================================================
// Sports Profile
// ============================================================================

export interface SportEntry {
  sport: string;
  position: string;
  level: SportLevel;
  team: string;
}

export interface HealthSportsProfile {
  id: string;
  learner_id: string;
  sports: SportEntry[];
  primary_sport: string | null;
  playing_since: string | null;
  coach_name: string | null;
  coach_phone: string | null;
  sports_quota: boolean;
  scholarship_type: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Fitness Tests (Khelo India + JKKN pattern)
// ============================================================================

export interface HealthFitnessTest {
  id: string;
  learner_id: string;
  assessed_by: string | null;
  test_date: string;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  resting_heart_rate: number | null;
  beep_test_level: number | null;
  vo2_max_estimated: number | null;
  push_ups_count: number | null;
  sit_ups_count: number | null;
  grip_strength_kg: number | null;
  sit_and_reach_cm: number | null;
  sprint_50m_seconds: number | null;
  shuttle_run_seconds: number | null;
  distance_run_meters: number | null;
  fitness_score: number | null;
  fitness_category: FitnessCategory | null;
  notes: string | null;
  created_at: string;
}

export type FitnessCategory = 'poor' | 'below_average' | 'average' | 'good' | 'excellent';

export const FITNESS_CATEGORY_CONFIG: Record<FitnessCategory, { label: string; color: string; bg: string }> = {
  poor: { label: 'Poor', color: 'text-red-700', bg: 'bg-red-50' },
  below_average: { label: 'Below Average', color: 'text-orange-700', bg: 'bg-orange-50' },
  average: { label: 'Average', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  good: { label: 'Good', color: 'text-green-700', bg: 'bg-green-50' },
  excellent: { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-50' },
};

// ============================================================================
// Training Log
// ============================================================================

export interface HealthTrainingLog {
  id: string;
  learner_id: string;
  training_date: string;
  sport: string;
  training_type: TrainingType;
  duration_minutes: number;
  intensity: TrainingIntensity | null;
  coach_feedback: string | null;
  self_rating: number | null;
  notes: string | null;
  created_at: string;
}

export type TrainingType = 'practice' | 'match' | 'gym' | 'cardio' | 'yoga' | 'warmup' | 'recovery' | 'other';
export type TrainingIntensity = 'low' | 'moderate' | 'high' | 'max';

export const TRAINING_TYPES: { value: TrainingType; label: string; emoji: string }[] = [
  { value: 'practice', label: 'Practice', emoji: '🏃' },
  { value: 'match', label: 'Match', emoji: '🏆' },
  { value: 'gym', label: 'Gym / Strength', emoji: '💪' },
  { value: 'cardio', label: 'Cardio', emoji: '❤️' },
  { value: 'yoga', label: 'Yoga / Flexibility', emoji: '🧘' },
  { value: 'warmup', label: 'Warm-up', emoji: '🔥' },
  { value: 'recovery', label: 'Recovery', emoji: '🧊' },
  { value: 'other', label: 'Other', emoji: '📝' },
];

// ============================================================================
// Sports Credits (45 hours = 1 credit, max 3/semester)
// ============================================================================

export interface HealthSportsCredit {
  id: string;
  learner_id: string;
  semester: string;
  academic_year: string;
  practice_hours: number;
  practice_attendance_pct: number;
  practice_credits: number;
  tournament_days: number;
  tournament_credits: number;
  winning_level: string | null;
  winning_position: string | null;
  winning_credits: number;
  leadership_role: string | null;
  leadership_credits: number;
  sportsmanship_rating: string | null;
  sportsmanship_credits: number;
  total_credits: number; // generated, max 3
  participation_score: number;
  performance_score: number;
  achievement_score: number;
  sportsmanship_leadership_score: number;
  total_evaluation_score: number; // generated, out of 100
  evaluated_by: string | null;
  evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

// Credit calculation per JKKN policy
export const CREDIT_RULES = {
  HOURS_PER_CREDIT: 45,
  MAX_CREDITS_PER_SEMESTER: 3,
  TOURNAMENT_HOURS_PER_DAY: 4,
  PRACTICE_THRESHOLDS: [
    { min_pct: 95, credits_per_45h: 1.0 },
    { min_pct: 85, credits_per_45h: 0.75 },
    { min_pct: 75, credits_per_45h: 0.5 },
  ],
  WINNING_CREDITS: {
    national_winner: 1.0, national_participation: 0.75,
    state_winner: 0.75, state_participation: 0.5,
    district_winner: 0.5, district_participation: 0.25,
    local_winner: 0.25,
  },
  LEADERSHIP_CREDITS: {
    captain: 0.75, event_organizer: 0.5, assistant_organizer: 0.25, mentor: 0.5,
  },
  SPORTSMANSHIP_CREDITS: { outstanding: 0.5, good: 0.25 },
} as const;

// ============================================================================
// Scholarships (from JKKN fee concession tables)
// ============================================================================

export interface HealthSportsScholarship {
  id: string;
  learner_id: string;
  academic_year: string;
  student_type: 'fresher' | 'existing';
  college_type: 'engineering_arts' | 'medical_paramedical';
  sport_category: 'team' | 'individual';
  sport_name: string;
  competition_level: string;
  position: string;
  scholarship_amount: number;
  hostel_concession_pct: number;
  bus_fee_waiver: boolean;
  sports_uniform_provided: boolean;
  verified_by_pe_director: boolean;
  verified_by_admission: boolean;
  verified_by_director: boolean;
  status: ScholarshipStatus;
  certificates: { name: string; url: string; level: string; year: string }[];
  created_at: string;
  updated_at: string;
}

export type ScholarshipStatus = 'pending' | 'verified' | 'approved' | 'active' | 'suspended' | 'revoked';

// ============================================================================
// Tournament Permissions (5-step approval)
// ============================================================================

export interface HealthTournamentPermission {
  id: string;
  learner_id: string;
  tournament_name: string;
  tournament_level: SportLevel;
  sport: string;
  start_date: string;
  end_date: string;
  travel_required: boolean;
  travel_details: string | null;
  team_members: { learner_id: string; name: string }[];
  justification: string | null;
  step1_sports_coordinator_status: ApprovalStatus;
  step2_hod_status: ApprovalStatus;
  step3_principal_status: ApprovalStatus;
  step4_pe_director_status: ApprovalStatus;
  overall_status: 'pending' | 'approved' | 'rejected' | 'completed';
  credit_hours_earned: number;
  created_at: string;
  updated_at: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// ============================================================================
// Injuries
// ============================================================================

export interface HealthSportsInjury {
  id: string;
  learner_id: string;
  injury_date: string;
  sport: string | null;
  injury_type: string;
  body_part: string;
  severity: 'minor' | 'moderate' | 'severe';
  description: string | null;
  treatment: string | null;
  recovery_status: 'recovering' | 'recovered' | 'chronic';
  recovery_days: number | null;
  cleared_to_play: boolean;
  cleared_by: string | null;
  cleared_date: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Achievements
// ============================================================================

export interface HealthSportsAchievement {
  id: string;
  learner_id: string;
  achievement_date: string;
  sport: string;
  event_name: string;
  event_level: SportLevel;
  achievement_type: AchievementType;
  description: string | null;
  certificate_url: string | null;
  verified: boolean;
  created_at: string;
}

export type SportLevel = 'intra_college' | 'inter_college' | 'district' | 'state' | 'national' | 'international';
export type AchievementType = 'gold' | 'silver' | 'bronze' | 'participation' | 'record' | 'best_player' | 'captain' | 'other';

// ============================================================================
// Constants
// ============================================================================

export const JKKN_SPORTS = [
  'Volleyball', 'Basketball', 'Kho-Kho', 'Kabaddi', 'Handball', 'Badminton',
  'Cricket', 'Football', 'Table Tennis', 'Tennis', 'Hockey',
  'Wrestling', 'Powerlifting', 'Weightlifting', 'Athletics',
  'Swimming', 'Chess', 'Carrom', 'Yoga',
] as const;

export const TEAM_SPORTS = ['Volleyball', 'Basketball', 'Kho-Kho', 'Kabaddi', 'Handball', 'Badminton', 'Cricket', 'Football', 'Hockey'] as const;
export const INDIVIDUAL_SPORTS = ['Wrestling', 'Powerlifting', 'Weightlifting', 'Athletics', 'Swimming', 'Chess', 'Table Tennis', 'Tennis', 'Yoga'] as const;

export const SPORT_LEVELS: { value: SportLevel; label: string }[] = [
  { value: 'intra_college', label: 'Intra-College' },
  { value: 'inter_college', label: 'Inter-College' },
  { value: 'district', label: 'District' },
  { value: 'state', label: 'State' },
  { value: 'national', label: 'National' },
  { value: 'international', label: 'International' },
];

export const BODY_PARTS = ['Ankle', 'Knee', 'Shoulder', 'Wrist', 'Head', 'Back', 'Hip', 'Elbow', 'Finger', 'Hamstring', 'Other'] as const;
export const INJURY_TYPES = ['Sprain', 'Fracture', 'Strain', 'Concussion', 'Cut', 'Dislocation', 'Tendinitis', 'Other'] as const;
