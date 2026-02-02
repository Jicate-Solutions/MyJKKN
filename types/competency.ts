// ============================================================================
// MyJKKN Competency Catalog Module - TypeScript Types
// Version: 1.0
// Created: 2026-02-01
// Purpose: Define taxonomy of skills and learning targets for outcome-based education
// ============================================================================

// ============================================================================
// ENUMS & UNION TYPES
// ============================================================================

/**
 * Type of competency - defines the category/nature of the skill
 */
export type CompetencyType =
  | 'technical'      // Hard skills, technical knowledge
  | 'behavioral'     // Soft skills, interpersonal abilities
  | 'domain'         // Industry/field-specific knowledge
  | 'soft_skill';    // Communication, teamwork, etc.

/**
 * Fink's Taxonomy Dimensions (0-100 scale)
 * Replaces Bloom's Taxonomy to align with AI-era significant learning framework
 *
 * @see /Users/omm/Vaults/Claude Setup/Capture/FST-Blooms-vs-Finks-Taxonomy.md
 *
 * Each dimension represents a critical aspect of transformational learning:
 * - foundational_knowledge: Facts, concepts, principles (AI can do this - lowest priority)
 * - application: Using knowledge in new contexts (AI-augmented - medium priority)
 * - integration: Connecting ideas across disciplines and lived experience (HIGH priority)
 * - human_dimension: Self-awareness, relationships, social context (CRITICAL - AI cannot do)
 * - caring: Values, interests, ethical judgment (CRITICAL - AI is amoral)
 * - learning_how_to_learn: Metacognition, self-directed learning (CRITICAL - adapting to AI evolution)
 */
export interface FinksDimensions {
  /**
   * Foundational Knowledge (0-100)
   * Facts, terms, formulas, concepts, principles, theories
   * AI Era: Lowest priority - AI has perfect recall
   */
  foundational_knowledge: number;

  /**
   * Application (0-100)
   * Critical/creative thinking, practical skills, managing projects
   * AI Era: Medium priority - AI applies knowledge, humans direct and curate
   */
  application: number;

  /**
   * Integration (0-100)
   * Connecting ideas, people, realms of life; seeing patterns across disciplines
   * AI Era: HIGH priority - requires human context and lived experience
   */
  integration: number;

  /**
   * Human Dimension (0-100)
   * Learning about oneself and others; understanding social contexts
   * AI Era: CRITICAL - AI lacks self-awareness and authentic relationships
   */
  human_dimension: number;

  /**
   * Caring (0-100)
   * Developing new feelings, interests, values; ethical judgment
   * AI Era: CRITICAL - AI has no intrinsic values or moral compass
   */
  caring: number;

  /**
   * Learning How to Learn (0-100)
   * Becoming self-directed learner; learning to ask/answer questions
   * AI Era: CRITICAL - meta-skill for adapting as AI capabilities evolve
   */
  learning_how_to_learn: number;
}

/**
 * @deprecated Use FinksDimensions instead. Bloom's Taxonomy describes AI capabilities.
 * Fink's Taxonomy describes human differentiation in the AI era.
 *
 * Kept for backward compatibility during migration.
 */
export type BloomTaxonomyLevel =
  | 'remember'    // Recall facts and basic concepts
  | 'understand'  // Explain ideas or concepts
  | 'apply'       // Use information in new situations
  | 'analyze'     // Draw connections among ideas
  | 'evaluate'    // Justify a stand or decision
  | 'create';     // Produce new or original work

/**
 * Proficiency levels for competency mastery
 */
export type ProficiencyLevel =
  | 'novice'        // Just starting, basic awareness
  | 'beginner'      // Basic knowledge, needs guidance
  | 'intermediate'  // Working knowledge, some independence
  | 'advanced'      // Deep knowledge, can teach others
  | 'expert';       // Mastery, can innovate

/**
 * Status for competency verification
 */
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

/**
 * Assessment method types
 */
export type AssessmentMethod =
  | 'exam'
  | 'project'
  | 'assignment'
  | 'presentation'
  | 'practical'
  | 'portfolio'
  | 'peer_review'
  | 'self_assessment'
  | 'industry_certification'
  | 'other';

/**
 * Evidence type for competency demonstration
 */
export type EvidenceType =
  | 'certificate'
  | 'project'
  | 'assessment_score'
  | 'portfolio'
  | 'endorsement'
  | 'external_certification'
  | 'other';

// ============================================================================
// CORE TYPES - COMPETENCY CATALOG
// ============================================================================

/**
 * Proficiency level definition with criteria
 */
export interface ProficiencyLevelDefinition {
  level: ProficiencyLevel;
  description: string;
  criteria: string[];
  typical_duration_hours?: number;
}

/**
 * Evidence requirement for demonstrating competency
 */
export interface EvidenceRequirement {
  level: ProficiencyLevel;
  required_evidence_types: EvidenceType[];
  minimum_count: number;
  description: string;
}

/**
 * Master competency catalog entry
 * Defines a single skill/competency that can be tracked
 */
export interface Competency {
  id: string;
  institution_id: string;
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  description: string | null;
  proficiency_levels: ProficiencyLevelDefinition[];
  evidence_requirements: EvidenceRequirement[] | null;
  industry_tags: string[];

  /**
   * Fink's Taxonomy dimensions for this competency (0-100 scale)
   * Defines the transformational learning profile of this competency
   */
  finks_dimensions: FinksDimensions;

  /**
   * @deprecated Use finks_dimensions instead. Kept for backward compatibility.
   */
  bloom_taxonomy_level?: BloomTaxonomyLevel | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  program_mappings?: CompetencyProgramMapping[];
  course_mappings?: CompetencyCourseMapping[];
}

/**
 * Competency mapping to program requirements
 */
export interface CompetencyProgramMapping {
  id: string;
  competency_id: string;
  program_id: string;
  required_level: ProficiencyLevel;
  weight_percentage: number | null;
  semester_expected: string | null; // semester UUID
  is_mandatory: boolean;
  created_at: string;

  // Optional populated relationships
  competency?: Competency;
  program?: {
    id: string;
    program_name: string;
    degree_id: string;
  };
  semester?: {
    id: string;
    semester_name: string;
  };
}

/**
 * Competency mapping to courses
 */
export interface CompetencyCourseMapping {
  id: string;
  course_id: string;
  competency_id: string;
  contribution_level: ProficiencyLevel | null;
  learning_hours: number | null;
  assessment_method: AssessmentMethod | null;
  created_at: string;

  // Optional populated relationships
  competency?: Competency;
  course?: {
    id: string;
    course_code: string;
    course_name: string;
  };
}

// ============================================================================
// LEARNER COMPETENCY TRACKING
// ============================================================================

/**
 * Evidence item for competency demonstration
 */
export interface CompetencyEvidence {
  type: EvidenceType;
  url: string | null;
  description: string;
  date: string;
  verified: boolean;
}

/**
 * Assessment record for competency
 */
export interface CompetencyAssessment {
  date: string;
  score: number;
  assessor_id: string;
  assessor_name?: string;
  method: AssessmentMethod;
  notes?: string;
}

/**
 * Learner's competency record
 * Tracks individual learner progress on specific competencies
 */
export interface LearnerCompetency {
  id: string;
  learner_id: string;
  competency_id: string;
  current_level: ProficiencyLevel;
  evidence: CompetencyEvidence[] | null;
  assessments: CompetencyAssessment[] | null;
  verified_by: string | null;
  verified_at: string | null;
  progress_percentage: number; // 0-100, computed progress towards target level
  last_activity_at: string;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  competency?: Competency;
  learner?: {
    id: string;
    full_name: string;
    roll_number: string;
  };
  verifier?: {
    id: string;
    full_name: string;
  };
}

/**
 * Aggregated capabilities stored in learner profile
 */
export interface LearnerCapabilities {
  competencies: {
    competency_id: string;
    competency_name?: string;
    current_level: ProficiencyLevel;
    evidence: string[];
    verified_at: string | null;
    verified_by: string | null;
  }[];
  last_updated: string;
}

// ============================================================================
// DTO TYPES (Data Transfer Objects)
// ============================================================================

/**
 * Create new competency
 */
export interface CreateCompetencyDTO {
  institution_id: string;
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  description?: string;
  proficiency_levels: ProficiencyLevelDefinition[];
  evidence_requirements?: EvidenceRequirement[];
  industry_tags?: string[];

  /**
   * Fink's Taxonomy dimensions (0-100 scale)
   * Required for AI-era competency definition
   */
  finks_dimensions: FinksDimensions;

  /**
   * @deprecated Use finks_dimensions instead
   */
  bloom_taxonomy_level?: BloomTaxonomyLevel;

  is_active?: boolean;
}

/**
 * Update existing competency
 */
export interface UpdateCompetencyDTO {
  competency_code?: string;
  competency_name?: string;
  competency_type?: CompetencyType;
  description?: string;
  proficiency_levels?: ProficiencyLevelDefinition[];
  evidence_requirements?: EvidenceRequirement[];
  industry_tags?: string[];

  /**
   * Fink's Taxonomy dimensions (0-100 scale)
   */
  finks_dimensions?: FinksDimensions;

  /**
   * @deprecated Use finks_dimensions instead
   */
  bloom_taxonomy_level?: BloomTaxonomyLevel;

  is_active?: boolean;
}

/**
 * Create competency to program mapping
 */
export interface CreateCompetencyProgramMappingDTO {
  competency_id: string;
  program_id: string;
  required_level: ProficiencyLevel;
  weight_percentage?: number;
  semester_expected?: string;
  is_mandatory?: boolean;
}

/**
 * Update competency to program mapping
 */
export interface UpdateCompetencyProgramMappingDTO {
  required_level?: ProficiencyLevel;
  weight_percentage?: number;
  semester_expected?: string;
  is_mandatory?: boolean;
}

/**
 * Create competency to course mapping
 */
export interface CreateCompetencyCourseMappingDTO {
  course_id: string;
  competency_id: string;
  contribution_level?: ProficiencyLevel;
  learning_hours?: number;
  assessment_method?: AssessmentMethod;
}

/**
 * Update competency to course mapping
 */
export interface UpdateCompetencyCourseMappingDTO {
  contribution_level?: ProficiencyLevel;
  learning_hours?: number;
  assessment_method?: AssessmentMethod;
}

/**
 * Create or update learner competency record
 */
export interface UpsertLearnerCompetencyDTO {
  learner_id: string;
  competency_id: string;
  current_level: ProficiencyLevel;
  evidence?: CompetencyEvidence[];
}

/**
 * Add evidence to learner competency
 */
export interface AddCompetencyEvidenceDTO {
  learner_competency_id: string;
  evidence: CompetencyEvidence;
}

/**
 * Record competency assessment
 */
export interface RecordCompetencyAssessmentDTO {
  learner_competency_id: string;
  score: number;
  method: AssessmentMethod;
  notes?: string;
}

/**
 * Verify learner competency
 */
export interface VerifyLearnerCompetencyDTO {
  learner_competency_id: string;
  verified: boolean;
  notes?: string;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filters for competency catalog queries
 */
export interface CompetencyFilters {
  institution_id?: string;
  competency_type?: CompetencyType | CompetencyType[];

  /**
   * Filter by Fink's dimension strength
   * Format: { dimension: 'caring', min_score: 70 } to find competencies with high caring dimension
   */
  finks_dimension_filter?: {
    dimension: keyof FinksDimensions;
    min_score?: number;
    max_score?: number;
  };

  /**
   * @deprecated Use finks_dimension_filter instead
   */
  bloom_taxonomy_level?: BloomTaxonomyLevel | BloomTaxonomyLevel[];

  industry_tags?: string[];
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'competency_code' | 'competency_name' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Filters for program mapping queries
 */
export interface CompetencyProgramMappingFilters {
  program_id?: string;
  competency_id?: string;
  required_level?: ProficiencyLevel;
  is_mandatory?: boolean;
  semester_expected?: string;
  page?: number;
  limit?: number;
}

/**
 * Filters for course mapping queries
 */
export interface CompetencyCourseMappingFilters {
  course_id?: string;
  competency_id?: string;
  contribution_level?: ProficiencyLevel;
  assessment_method?: AssessmentMethod;
  page?: number;
  limit?: number;
}

/**
 * Filters for learner competency queries
 */
export interface LearnerCompetencyFilters {
  learner_id?: string;
  competency_id?: string;
  current_level?: ProficiencyLevel | ProficiencyLevel[];
  verified?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Paginated list response
 */
export interface CompetencyListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Competency statistics for an institution
 */
export interface CompetencyStats {
  total_competencies: number;
  by_type: Record<CompetencyType, number>;

  /**
   * Average Fink's dimensions scores across all competencies
   * Helps institutions understand their learning focus areas
   */
  avg_finks_dimensions: FinksDimensions;

  /**
   * Distribution of competencies by dominant Fink's dimension
   * Shows which dimension has the highest score for each competency
   */
  by_dominant_finks_dimension: Record<keyof FinksDimensions, number>;

  /**
   * @deprecated Use avg_finks_dimensions instead
   */
  by_taxonomy_level?: Record<BloomTaxonomyLevel, number>;

  mapped_to_programs: number;
  mapped_to_courses: number;
  active_count: number;
  inactive_count: number;
}

/**
 * Learner competency progress summary
 */
export interface LearnerCompetencyProgress {
  learner_id: string;
  total_competencies: number;
  mastered_count: number; // advanced or expert level
  in_progress_count: number;
  not_started_count: number;
  verified_count: number;
  overall_progress_percentage: number;
  by_level: Record<ProficiencyLevel, number>;
  by_type: Record<CompetencyType, number>;
}

/**
 * Program competency coverage analysis
 */
export interface ProgramCompetencyCoverage {
  program_id: string;
  program_name: string;
  required_competencies: number;
  mapped_to_courses: number;
  coverage_percentage: number;
  gaps: {
    competency_id: string;
    competency_name: string;
    required_level: ProficiencyLevel;
    course_coverage: number;
  }[];
}

/**
 * Course competency contribution summary
 */
export interface CourseCompetencyContribution {
  course_id: string;
  course_name: string;
  total_competencies: number;
  total_learning_hours: number;
  competencies: {
    competency_id: string;
    competency_name: string;
    contribution_level: ProficiencyLevel | null;
    learning_hours: number | null;
    assessment_method: AssessmentMethod | null;
  }[];
}

// ============================================================================
// ANALYTICS & DASHBOARD TYPES
// ============================================================================

/**
 * Competency dashboard data
 */
export interface CompetencyDashboardData {
  institution_id: string;
  stats: CompetencyStats;
  recent_competencies: Competency[];
  top_mapped_competencies: {
    competency_id: string;
    competency_name: string;
    program_count: number;
    course_count: number;
  }[];
  programs_without_competencies: {
    program_id: string;
    program_name: string;
  }[];
}

/**
 * Learner competency dashboard
 */
export interface LearnerCompetencyDashboard {
  learner_id: string;
  progress: LearnerCompetencyProgress;
  recent_achievements: {
    competency_id: string;
    competency_name: string;
    level_achieved: ProficiencyLevel;
    achieved_at: string;
  }[];
  recommended_next: {
    competency_id: string;
    competency_name: string;
    current_level: ProficiencyLevel | null;
    target_level: ProficiencyLevel;
    program_required: boolean;
  }[];
}

/**
 * Competency gap analysis for a learner
 */
export interface CompetencyGapAnalysis {
  learner_id: string;
  program_id: string;
  total_required: number;
  achieved: number;
  in_progress: number;
  gaps: {
    competency_id: string;
    competency_name: string;
    required_level: ProficiencyLevel;
    current_level: ProficiencyLevel | null;
    gap_levels: number; // how many levels behind
    is_mandatory: boolean;
    recommended_courses: {
      course_id: string;
      course_name: string;
    }[];
  }[];
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Competency picker option for forms
 */
export interface CompetencyPickerOption {
  id: string;
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  industry_tags: string[];
}

/**
 * Bulk import competency row
 */
export interface BulkImportCompetencyRow {
  competency_code: string;
  competency_name: string;
  competency_type: CompetencyType;
  description?: string;
  industry_tags?: string;
  bloom_taxonomy_level?: BloomTaxonomyLevel;
}

/**
 * Bulk import result
 */
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
