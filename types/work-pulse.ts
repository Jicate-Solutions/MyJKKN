// types/work-pulse.ts
// Work Pulse module types — entities, DTOs, filters

// ─── Category Constants ─────────────────────────────────────────────

export const WP_CATEGORIES = [
  'Data Entry & Copying',
  'Report Generation',
  'Attendance & Tracking',
  'Communication & Follow-up',
  'Scheduling & Coordination',
  'Document Processing',
  'Fee & Payment Processing',
  'Student Records Management',
  'Exam & Assessment',
  'Inventory & Resources',
  'General Administration',
] as const;

export type WpCategory = (typeof WP_CATEGORIES)[number];

// ─── Enum Types ─────────────────────────────────────────────────────

export type WpPatternSource = 'observer' | 'pulse' | 'both' | 'user_request';
export type WpSolutionType = 'new_module' | 'standalone_agent' | 'process_change' | 'training';
export type WpPatternTier = 'S' | 'A' | 'B' | 'C';
export type WpPatternStatus = 'discovered' | 'classified' | 'queued' | 'building' | 'deployed' | 'measuring';

// ─── Entity Types ───────────────────────────────────────────────────

export interface WpPulseEntry {
  id: string;
  user_id: string;
  institution_id: string;
  department_id: string | null;
  role: string;
  week_of: string;
  talent_waste_category: string;
  talent_waste_description: string;
  talent_waste_description_en: string | null;
  repetition_category: string;
  repetition_description: string;
  repetition_description_en: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  profiles?: { id: string; full_name: string; email: string; avatar_url: string | null };
}

export interface WpPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  source: WpPatternSource;
  people_affected: number;
  roles_affected: string[];
  departments_affected: string[];
  hours_wasted_weekly: number;
  feasibility_score: number | null;
  solution_type: WpSolutionType | null;
  impact_score: number;
  tier: WpPatternTier;
  status: WpPatternStatus;
  jicate_product_candidate: boolean;
  first_detected_at: string;
  last_analysis_at: string | null;
  analysis_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WpMicroInterview {
  id: string;
  pattern_id: string;
  user_id: string;
  question_text: string;
  options: string[];
  selected_option: string | null;
  free_text: string | null;
  sent_at: string;
  responded_at: string | null;
  created_at: string;
  // Relations
  pattern?: WpPattern;
}

export interface WpAgentImpact {
  id: string;
  pattern_id: string;
  agent_name: string;
  solution_type: WpSolutionType;
  deployed_at: string;
  pre_hours_weekly: number;
  post_hours_weekly: number;
  hours_saved_weekly: number;
  people_using: number;
  is_jicate_product: boolean;
  last_measured_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  pattern?: WpPattern;
}

// ─── DTOs ───────────────────────────────────────────────────────────

export interface SubmitWeeklyPulseDto {
  talent_waste_category: string;
  talent_waste_description: string;
  repetition_category: string;
  repetition_description: string;
}

export interface RespondInterviewDto {
  selected_option: string;
  free_text?: string;
}

// ─── Filter Types ───────────────────────────────────────────────────

export interface PulseEntryFilters {
  page?: number;
  limit?: number;
}

export interface AdminPulseFilters {
  page?: number;
  limit?: number;
  search?: string;
  institution_id?: string;
  department_id?: string;
  role?: string;
  talent_waste_category?: string;
  repetition_category?: string;
  week_of?: string;
  date_from?: string;
  date_to?: string;
}

export interface AdminPulseEntry extends WpPulseEntry {
  profiles?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
  };
  institutions?: { id: string; name: string };
  departments?: { id: string; department_name: string };
}

export interface PatternFilters {
  tier?: WpPatternTier;
  status?: WpPatternStatus;
  solution_type?: WpSolutionType;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Stats / Aggregation Types ──────────────────────────────────────

export interface PulseStats {
  total_pulses: number;
  patterns_spotted: number;
  agents_originated: number;
  this_month: number;
}

export interface AgentBoardStats {
  total_opportunities: number;
  s_tier_count: number;
  in_pipeline: number;
  training_wins: number;
}

export interface ImpactSummary {
  agents_deployed: number;
  hours_saved_weekly: number;
  training_wins: number;
  people_helped: number;
  workflows_absorbed: number;
}

export interface ComplianceDepartment {
  department_id: string;
  department_name: string;
  total_staff: number;
  submitted_count: number;
  submission_rate: number;
}

// ─── Badge Types ────────────────────────────────────────────────────

export type WpBadge = 'pattern_spotter' | 'agent_originator' | 'impact_pioneer';

export interface BadgeInfo {
  type: WpBadge;
  label: string;
  description: string;
  earned: boolean;
}

// ─── Instant Help ───────────────────────────────────────────────────

export interface InstantHelpResult {
  matching_patterns: number;
  top_pattern: WpPattern | null;
  message: string;
}
