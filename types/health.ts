// types/health.ts
// TypeScript types for the Health Module
// Created: 2026-04-12

// ============================================================================
// Database Row Types
// ============================================================================

export interface HealthConsent {
  id: string;
  learner_id: string;
  consent_version: string;
  consented_at: string;
  withdrawn_at: string | null;
  ip_address: string | null;
}

export interface HealthProfile {
  id: string;
  learner_id: string;
  institution_id: string | null;
  blood_group: string | null;
  allergies: string[];
  medical_conditions: string[];
  medications: string[];
  vaccination_status: Record<string, boolean>;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  bmi_category: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthDailyLog {
  id: string;
  learner_id: string;
  log_date: string;
  step_count: number;
  water_glasses: number;
  water_goal: number;
  mood: number | null;
  sleep_quality: number | null;
  stress_level: number | null;
  mood_note: string | null;
  step_goal: number;
  created_at: string;
  updated_at: string;
}

export interface HealthStreak {
  id: string;
  learner_id: string;
  streak_type: 'mood' | 'steps' | 'water';
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  total_days_logged: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Composite / View Types
// ============================================================================

export interface HealthDashboardData {
  profile: HealthProfile | null;
  todayLog: HealthDailyLog | null;
  streaks: HealthStreak[];
  weeklySteps: { date: string; steps: number }[];
  weeklyMood: { date: string; mood: number | null }[];
  leaderboardRank: number | null;
  institutionName: string | null;
  hasConsented: boolean;
}

export interface LeaderboardEntry {
  learner_id: string;
  learner_name: string;
  institution_name: string;
  value: number;
  rank: number;
}

export type LeaderboardType = 'mood_streak' | 'water_consistency' | 'steps';
export type LeaderboardPeriod = 'week' | 'month' | 'all_time';

// ============================================================================
// Form / Input Types
// ============================================================================

export interface HealthProfileFormData {
  blood_group: string | null;
  allergies: string[];
  medical_conditions: string[];
  medications: string[];
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  vaccination_status: Record<string, boolean>;
}

export interface MoodCheckinData {
  mood: MoodScore;
  sleep_quality: number;
  stress_level: number;
  mood_note?: string;
}

export interface StepEntryData {
  step_count: number;
}

export interface WaterUpdateData {
  water_glasses: number;
}

// ============================================================================
// Constants
// ============================================================================

export type MoodScore = 1 | 2 | 3 | 4 | 5;

export const MOOD_LABELS: Record<MoodScore, string> = {
  1: 'Terrible',
  2: 'Bad',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

export const MOOD_EMOJIS: Record<MoodScore, string> = {
  1: '😫',
  2: '😢',
  3: '😐',
  4: '😊',
  5: '😄',
};

export const MOOD_COLORS: Record<MoodScore, string> = {
  1: 'text-red-600',
  2: 'text-orange-500',
  3: 'text-yellow-500',
  4: 'text-green-500',
  5: 'text-emerald-600',
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const EMERGENCY_RELATIONS = [
  'Parent',
  'Sibling',
  'Spouse',
  'Guardian',
  'Friend',
  'Other',
] as const;

export const VACCINATION_LIST = [
  'COVID-19',
  'Hepatitis B',
  'Tetanus',
  'Typhoid',
  'MMR',
  'Polio',
] as const;

export const BMI_CATEGORIES = {
  Underweight: { min: 0, max: 18.5, color: 'text-blue-600', bg: 'bg-blue-50' },
  Normal: { min: 18.5, max: 25, color: 'text-green-600', bg: 'bg-green-50' },
  Overweight: { min: 25, max: 30, color: 'text-orange-600', bg: 'bg-orange-50' },
  Obese: { min: 30, max: 100, color: 'text-red-600', bg: 'bg-red-50' },
} as const;

export const DEFAULT_STEP_GOAL = 5000;
export const DEFAULT_WATER_GOAL = 8;
export const CONSENT_VERSION = '1.0';
