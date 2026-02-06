// ============================================================================
// Competency Module Types
// Part of Workshop Transformation - Phase 1.2
// Based on Fink's Taxonomy for outcome-focused learning
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export type CompetencyType = 'technical' | 'behavioral' | 'domain' | 'soft_skill' | 'metacognitive';
export type ProficiencyLevel = 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type ContributionLevel = 'minor' | 'moderate' | 'major' | 'primary';

// ============================================================================
// FINK'S TAXONOMY
// ============================================================================

export interface FinksDimensions {
  foundational_knowledge: number; // 0-10
  application: number;
  integration: number;
  human_dimension: number;
  caring: number;
  learning_to_learn: number;
}

export interface ProficiencyLevelDefinition {
  level: ProficiencyLevel;
  description: string;
  criteria: string[];
}

export interface EvidenceRequirement {
  level: ProficiencyLevel;
  required_evidence: string[];
  optional_evidence?: string[];
}

// ============================================================================
// CORE ENTITIES
// ============================================================================

/** Main competency catalog entry */
export interface CompetencyCatalog {
  id: string;
  institution_id: string;
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  description: string | null;
  proficiency_levels: ProficiencyLevelDefinition[];
  evidence_requirements: EvidenceRequirement[];
  industry_tags: string[];
  finks_dimensions: FinksDimensions;
  ai_resistance_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// MAPPINGS
// ============================================================================

/** Program-level competency mapping */
export interface CompetencyProgramMapping {
  id: string;
  competency_id: string;
  program_id: string;
  required_level: ProficiencyLevel;
  weight_percentage: number;
  semester_expected: string | null;
  is_mandatory: boolean;
  created_at: string;
  // Joined fields
  competency?: CompetencyCatalog;
  program?: { id: string; name: string; code: string };
}

/** Course-level competency mapping with Fink's assessment methods */
export interface FinksAssessmentMethods {
  foundational?: string; // e.g., 'quiz', 'exam'
  application?: string; // e.g., 'project', 'lab'
  integration?: string; // e.g., 'case_study'
  human_dimension?: string; // e.g., 'peer_feedback'
  caring?: string; // e.g., 'reflection_essay'
  learning_to_learn?: string; // e.g., 'learning_journal'
}

export interface CourseCompetencyMapping {
  id: string;
  course_id: string;
  competency_id: string;
  contribution_level: ContributionLevel;
  learning_hours: number;
  finks_assessment_methods: FinksAssessmentMethods;
  created_at: string;
  // Joined fields
  competency?: CompetencyCatalog;
  course?: { id: string; name: string; code: string };
}

// ============================================================================
// LEARNER TRACKING
// ============================================================================

export interface LearnerEvidence {
  type: string; // 'project', 'certificate', 'assessment', 'portfolio'
  url?: string;
  description: string;
  date: string;
}

export interface LearnerAssessment {
  date: string;
  score: number;
  assessor_id?: string;
  assessor_name?: string;
  method: string; // 'quiz', 'project', 'peer_review', 'self_assessment'
  notes?: string;
}

export interface LearnerCompetency {
  id: string;
  learner_id: string;
  competency_id: string;
  current_level: ProficiencyLevel;
  evidence: LearnerEvidence[];
  assessments: LearnerAssessment[];
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  competency?: CompetencyCatalog;
}

// ============================================================================
// DTOs - CREATE / UPDATE
// ============================================================================

export interface CreateCompetencyInput {
  institution_id: string;
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  description?: string;
  proficiency_levels?: ProficiencyLevelDefinition[];
  evidence_requirements?: EvidenceRequirement[];
  industry_tags?: string[];
  finks_dimensions: FinksDimensions;
  ai_resistance_score?: number;
}

export interface UpdateCompetencyInput {
  id: string;
  competency_code?: string;
  competency_name?: string;
  competency_type?: CompetencyType;
  description?: string;
  proficiency_levels?: ProficiencyLevelDefinition[];
  evidence_requirements?: EvidenceRequirement[];
  industry_tags?: string[];
  finks_dimensions?: FinksDimensions;
  ai_resistance_score?: number;
  is_active?: boolean;
}

export interface CompetencyFilters {
  institution_id: string;
  search?: string;
  competency_type?: CompetencyType;
  is_active?: boolean;
  industry_tag?: string;
  min_ai_resistance?: number;
}

export interface CreateProgramMappingInput {
  competency_id: string;
  program_id: string;
  required_level: ProficiencyLevel;
  weight_percentage?: number;
  semester_expected?: string;
  is_mandatory?: boolean;
}

export interface CreateCourseMappingInput {
  course_id: string;
  competency_id: string;
  contribution_level?: ContributionLevel;
  learning_hours?: number;
  finks_assessment_methods?: FinksAssessmentMethods;
}

export interface CreateLearnerCompetencyInput {
  learner_id: string;
  competency_id: string;
  current_level?: ProficiencyLevel;
  evidence?: LearnerEvidence[];
}

export interface UpdateLearnerCompetencyInput {
  id: string;
  current_level?: ProficiencyLevel;
  evidence?: LearnerEvidence[];
  assessments?: LearnerAssessment[];
  verified_by?: string;
  verified_at?: string;
}

// ============================================================================
// DASHBOARD / ANALYTICS
// ============================================================================

export interface CompetencyStats {
  total_competencies: number;
  by_type: Record<CompetencyType, number>;
  active_count: number;
  programs_mapped: number;
  courses_mapped: number;
  average_ai_resistance: number;
}

export interface LearnerCompetencyProgress {
  learner_id: string;
  total_competencies: number;
  by_level: Record<ProficiencyLevel, number>;
  verified_count: number;
  industry_readiness_score: number;
}
