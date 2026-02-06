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
  typical_duration_hours?: number;
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
  // Joined fields (populated by service)
  program_mappings?: CompetencyProgramMapping[];
  course_mappings?: CourseCompetencyMapping[];
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
  is_active?: boolean;
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
  institution_id?: string;
  search?: string;
  competency_type?: CompetencyType | CompetencyType[];
  is_active?: boolean;
  industry_tag?: string;
  industry_tags?: string[];
  min_ai_resistance?: number;
  page?: number;
  limit?: number;
  sort_by?: 'competency_code' | 'competency_name' | 'created_at';
  sort_order?: 'asc' | 'desc';
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
  inactive_count: number;
  programs_mapped: number;
  courses_mapped: number;
  average_ai_resistance: number;
  avg_finks_dimensions: FinksDimensions;
  by_dominant_finks_dimension: Record<keyof FinksDimensions, number>;
}

export interface LearnerCompetencyProgress {
  learner_id: string;
  total_competencies: number;
  by_level: Record<ProficiencyLevel, number>;
  verified_count: number;
  industry_readiness_score: number;
}

// ============================================================================
// RESPONSE / UTILITY TYPES
// ============================================================================

/** Paginated list response */
export interface CompetencyListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** Competency picker option for forms */
export interface CompetencyPickerOption {
  id: string;
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  industry_tags: string[];
}

/** Bulk import competency row */
export interface BulkImportCompetencyRow {
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  description?: string;
  industry_tags?: string;
}

/** Bulk import result */
export interface BulkImportResult {
  total: number;
  success: number;
  failed: number;
  errors: {
    row: number;
    code: string;
    message: string;
  }[];
}

// Backward-compatible aliases
export type Competency = CompetencyCatalog;
export type CreateCompetencyDTO = CreateCompetencyInput;
export type UpdateCompetencyDTO = UpdateCompetencyInput;

// Mapping aliases (used by hooks)
export type CompetencyCourseMapping = CourseCompetencyMapping;
export type CreateCompetencyProgramMappingDTO = CreateProgramMappingInput;
export type CreateCompetencyCourseMappingDTO = CreateCourseMappingInput;

// Filter types for mappings
export interface CompetencyProgramMappingFilters {
  competency_id?: string;
  program_id?: string;
  required_level?: string;
  is_mandatory?: boolean;
  semester_expected?: number;
  page?: number;
  limit?: number;
}

export interface CompetencyCourseMappingFilters {
  competency_id?: string;
  course_id?: string;
  contribution_level?: ContributionLevel;
  page?: number;
  limit?: number;
}

// Update DTOs for mappings
export interface UpdateCompetencyProgramMappingDTO {
  id: string;
  required_level?: ProficiencyLevel;
  weight_percentage?: number;
  semester_expected?: string;
  is_mandatory?: boolean;
}

export interface UpdateCompetencyCourseMappingDTO {
  id: string;
  contribution_level?: ContributionLevel;
  learning_hours?: number;
  finks_assessment_methods?: FinksAssessmentMethods;
}

// Coverage/Contribution analytics
export interface ProgramCompetencyCoverage {
  program_id: string;
  program_name: string;
  required_competencies: number;
  mapped_to_courses: number;
  coverage_percentage: number;
  gaps: Array<{
    competency_id: string;
    competency_name: string;
    competency_type: CompetencyType;
    required_level: string;
    course_coverage: number;
  }>;
}

export interface CourseCompetencyContribution {
  course_id: string;
  course_name: string;
  total_competencies: number;
  competencies: {
    competency_id: string;
    competency_name: string;
    contribution_level: ContributionLevel;
    learning_hours: number;
    assessment_method?: string;
  }[];
  total_learning_hours: number;
}

// Learner competency hook types
export interface LearnerCompetencyFilters {
  learner_id?: string;
  competency_id?: string;
  current_level?: ProficiencyLevel;
  verified?: boolean;
  page?: number;
  limit?: number;
}

export interface UpsertLearnerCompetencyDTO {
  learner_id: string;
  competency_id: string;
  current_level: ProficiencyLevel;
  evidence?: LearnerEvidence[];
}

export interface AddCompetencyEvidenceDTO {
  learner_competency_id: string;
  evidence: LearnerEvidence;
}

export interface RecordCompetencyAssessmentDTO {
  learner_competency_id: string;
  assessment: LearnerAssessment;
}

export interface VerifyLearnerCompetencyDTO {
  learner_competency_id: string;
  verified_by: string;
}

export interface LearnerCompetencyDashboard {
  learner_id: string;
  total_competencies: number;
  by_level: Record<ProficiencyLevel, number>;
  verified_count: number;
  recent_assessments: LearnerAssessment[];
  industry_readiness_score: number;
}

export interface CompetencyGapAnalysis {
  competency_id: string;
  competency_name: string;
  required_level: ProficiencyLevel;
  current_level: ProficiencyLevel | null;
  gap: number;
  recommendations: string[];
}
