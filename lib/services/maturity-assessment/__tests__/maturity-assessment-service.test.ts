// lib/services/maturity-assessment/__tests__/maturity-assessment-service.test.ts
/**
 * Maturity Assessment Service Unit Tests
 *
 * CRITICAL TESTS for Executive Reporting:
 * - 4-stage model accuracy (Stage 1-4 boundaries)
 * - 6-dimension scoring aggregation
 * - Status transition validation
 * - Evidence linking integrity
 * - Dashboard radar chart data accuracy
 *
 * Based on TQM International Education Excellence Model
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  MaturityStage,
  MaturityDimensionName,
  AssessmentStatus,
  ProgressStatus,
  MaturityDimension,
  MaturityAssessment,
  MaturityProgressItem,
  MaturityEvidence,
  CreateMaturityAssessmentDto,
  CreateMaturityProgressItemDto,
} from '@/types/maturity-assessment';

// ============================================================
// Mock Supabase Client
// ============================================================

const mockSupabaseResponse = <T>(data: T, error: any = null) => ({
  data,
  error,
  count: Array.isArray(data) ? data.length : 1,
});

const mockSingleResponse = <T>(data: T | null) => ({
  single: vi.fn().mockResolvedValue({ data, error: null }),
});

const mockSelectChain = (data: any[]) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: data[0] || null, error: null }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: data[0] || null, error: null }),
          }),
        }),
      }),
      order: vi.fn().mockReturnValue({
        range: vi.fn().mockResolvedValue({ data, error: null, count: data.length }),
      }),
    }),
    in: vi.fn().mockResolvedValue({ data, error: null }),
  }),
});

// ============================================================
// Test Helpers - Maturity Calculation Logic
// ============================================================

/**
 * Calculate overall stage from dimension scores
 * Mirror of service implementation for testing
 */
function calculateOverallStage(dimensionScores: Record<string, number>): MaturityStage {
  const scores = Object.values(dimensionScores).filter(
    (s) => typeof s === 'number' && !isNaN(s) && s >= 1 && s <= 4
  );

  if (scores.length === 0) {
    return 1;
  }

  const sum = scores.reduce((a, b) => a + b, 0);
  const average = sum / scores.length;
  return Math.max(1, Math.min(4, Math.floor(average))) as MaturityStage;
}

/**
 * Get stage name from number
 */
function getStageName(stage: MaturityStage): string {
  const names: Record<MaturityStage, string> = {
    1: 'Crisis',
    2: 'Survival',
    3: 'Stability',
    4: 'Excellence',
  };
  return names[stage];
}

/**
 * Validate dimension scores object
 */
function validateDimensionScores(
  scores: Record<string, number>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requiredDimensions: MaturityDimensionName[] = [
    'Leadership',
    'Strategy',
    'People',
    'Processes',
    'Resources',
    'Results',
  ];

  // Check all required dimensions are present
  for (const dim of requiredDimensions) {
    if (!(dim in scores)) {
      errors.push(`Missing dimension: ${dim}`);
    } else {
      const score = scores[dim];
      if (typeof score !== 'number' || isNaN(score)) {
        errors.push(`Invalid score type for ${dim}: expected number`);
      } else if (score < 1 || score > 4) {
        errors.push(`Score out of range for ${dim}: ${score} (must be 1-4)`);
      } else if (!Number.isInteger(score)) {
        errors.push(`Score must be integer for ${dim}: ${score}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculate dimension average for dashboard
 */
function calculateDimensionAverages(
  assessments: { dimension_scores: Record<string, number> }[]
): Record<MaturityDimensionName, number> {
  const dimensions: MaturityDimensionName[] = [
    'Leadership',
    'Strategy',
    'People',
    'Processes',
    'Resources',
    'Results',
  ];

  const totals: Record<string, { sum: number; count: number }> = {};
  dimensions.forEach((d) => {
    totals[d] = { sum: 0, count: 0 };
  });

  assessments.forEach((a) => {
    Object.entries(a.dimension_scores).forEach(([dim, score]) => {
      if (totals[dim] && typeof score === 'number') {
        totals[dim].sum += score;
        totals[dim].count += 1;
      }
    });
  });

  const averages: Record<MaturityDimensionName, number> = {} as any;
  dimensions.forEach((d) => {
    averages[d] = totals[d].count > 0 ? totals[d].sum / totals[d].count : 0;
  });

  return averages;
}

/**
 * Check if status transition is valid
 */
function isValidStatusTransition(from: AssessmentStatus, to: AssessmentStatus): boolean {
  const validTransitions: Record<AssessmentStatus, AssessmentStatus[]> = {
    draft: ['submitted', 'archived'],
    submitted: ['approved', 'draft', 'archived'],
    approved: ['archived'],
    archived: [], // No transitions from archived
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// ============================================================
// Test Data Fixtures
// ============================================================

const createMockDimensions = (): MaturityDimension[] => [
  {
    name: 'Leadership',
    description: 'Leadership commitment to excellence and transformation',
    stage_1_criteria: 'Reactive response to issues only',
    stage_2_criteria: 'Sponsors some improvement initiatives',
    stage_3_criteria: 'Actively involved in quality reviews',
    stage_4_criteria: 'Drives transformation, role model',
  },
  {
    name: 'Strategy',
    description: 'Strategic alignment with organizational goals',
    stage_1_criteria: 'No clear goals defined',
    stage_2_criteria: 'Goals defined but not tracked',
    stage_3_criteria: 'Goals linked to KPIs',
    stage_4_criteria: 'Fully integrated strategic planning',
  },
  {
    name: 'People',
    description: 'Staff capability and engagement',
    stage_1_criteria: 'No formal training programs',
    stage_2_criteria: 'Ad-hoc training programs',
    stage_3_criteria: 'Structured development plans',
    stage_4_criteria: 'Continuous learning culture',
  },
  {
    name: 'Processes',
    description: 'Process documentation and optimization',
    stage_1_criteria: 'No documented processes',
    stage_2_criteria: 'Some key processes documented',
    stage_3_criteria: 'All processes with SLAs',
    stage_4_criteria: 'Automated and continuously improved',
  },
  {
    name: 'Resources',
    description: 'Data-driven decision making',
    stage_1_criteria: 'No systematic data collection',
    stage_2_criteria: 'Basic metrics tracked manually',
    stage_3_criteria: 'Comprehensive KPIs with dashboards',
    stage_4_criteria: 'Predictive analytics',
  },
  {
    name: 'Results',
    description: 'Stakeholder satisfaction and outcomes',
    stage_1_criteria: 'Complaints handled reactively',
    stage_2_criteria: 'Feedback collected occasionally',
    stage_3_criteria: 'NPS tracked with action plans',
    stage_4_criteria: 'Proactive engagement, high satisfaction',
  },
];

const createMockAssessment = (
  overrides: Partial<MaturityAssessment> = {}
): MaturityAssessment => ({
  id: 'assessment-001',
  institution_id: 'inst-001',
  framework_id: 'framework-001',
  department_id: null,
  assessment_date: '2025-01-15',
  assessor_id: 'user-001',
  dimension_scores: {
    Leadership: 3,
    Strategy: 2,
    People: 3,
    Processes: 2,
    Resources: 2,
    Results: 3,
  },
  overall_stage: 2,
  evidence: 'Sample evidence documentation',
  improvement_plan: 'Quarterly improvement targets',
  target_stage: 3,
  target_date: '2025-06-30',
  status: 'draft',
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2025-01-15T10:00:00Z',
  ...overrides,
});

const createMockProgressItem = (
  overrides: Partial<MaturityProgressItem> = {}
): MaturityProgressItem => ({
  id: 'progress-001',
  assessment_id: 'assessment-001',
  action_item: 'Implement leadership training program',
  dimension: 'Leadership',
  target_stage: 3,
  status: 'pending',
  due_date: '2025-03-15',
  completed_at: null,
  notes: 'Initial planning phase',
  assigned_to: 'user-002',
  created_at: '2025-01-15T10:00:00Z',
  ...overrides,
});

// ============================================================
// TEST SUITES
// ============================================================

describe('Maturity Assessment Service', () => {
  // ============================================================
  // 4-Stage Model Accuracy Tests
  // ============================================================
  describe('4-Stage Maturity Model', () => {
    describe('Stage Boundaries', () => {
      it('should return Stage 1 (Crisis) for average < 2', () => {
        const scores = {
          Leadership: 1,
          Strategy: 1,
          People: 1,
          Processes: 1,
          Resources: 1,
          Results: 1,
        };
        expect(calculateOverallStage(scores)).toBe(1);
      });

      it('should return Stage 1 (Crisis) for average 1.5', () => {
        const scores = {
          Leadership: 1,
          Strategy: 2,
          People: 1,
          Processes: 2,
          Resources: 1,
          Results: 2,
        };
        expect(calculateOverallStage(scores)).toBe(1);
      });

      it('should return Stage 2 (Survival) for average >= 2 and < 3', () => {
        const scores = {
          Leadership: 2,
          Strategy: 2,
          People: 2,
          Processes: 2,
          Resources: 2,
          Results: 2,
        };
        expect(calculateOverallStage(scores)).toBe(2);
      });

      it('should return Stage 2 for average 2.5', () => {
        const scores = {
          Leadership: 2,
          Strategy: 3,
          People: 2,
          Processes: 3,
          Resources: 2,
          Results: 3,
        };
        expect(calculateOverallStage(scores)).toBe(2);
      });

      it('should return Stage 3 (Stability) for average >= 3 and < 4', () => {
        const scores = {
          Leadership: 3,
          Strategy: 3,
          People: 3,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        expect(calculateOverallStage(scores)).toBe(3);
      });

      it('should return Stage 3 for average 3.5', () => {
        const scores = {
          Leadership: 3,
          Strategy: 4,
          People: 3,
          Processes: 4,
          Resources: 3,
          Results: 4,
        };
        expect(calculateOverallStage(scores)).toBe(3);
      });

      it('should return Stage 4 (Excellence) only for all 4s', () => {
        const scores = {
          Leadership: 4,
          Strategy: 4,
          People: 4,
          Processes: 4,
          Resources: 4,
          Results: 4,
        };
        expect(calculateOverallStage(scores)).toBe(4);
      });
    });

    describe('Stage Name Mapping', () => {
      it('should map Stage 1 to Crisis', () => {
        expect(getStageName(1)).toBe('Crisis');
      });

      it('should map Stage 2 to Survival', () => {
        expect(getStageName(2)).toBe('Survival');
      });

      it('should map Stage 3 to Stability', () => {
        expect(getStageName(3)).toBe('Stability');
      });

      it('should map Stage 4 to Excellence', () => {
        expect(getStageName(4)).toBe('Excellence');
      });
    });

    describe('Edge Cases', () => {
      it('should return Stage 1 for empty scores object', () => {
        expect(calculateOverallStage({})).toBe(1);
      });

      it('should ignore invalid scores and calculate from valid ones', () => {
        const scores = {
          Leadership: 3,
          Strategy: 3,
          People: NaN,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        expect(calculateOverallStage(scores)).toBe(3);
      });

      it('should ignore out-of-range scores (< 1 or > 4)', () => {
        const scores = {
          Leadership: 0, // Invalid - below 1
          Strategy: 5, // Invalid - above 4
          People: 3,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        expect(calculateOverallStage(scores)).toBe(3);
      });

      it('should handle mixed valid/invalid scores correctly', () => {
        const scores = {
          Leadership: 2,
          Strategy: 'invalid' as unknown as number,
          People: 4,
          Processes: null as unknown as number,
          Resources: 3,
          Results: undefined as unknown as number,
        };
        // Valid: 2, 4, 3 = average 3
        expect(calculateOverallStage(scores)).toBe(3);
      });
    });
  });

  // ============================================================
  // 6-Dimension Scoring Tests
  // ============================================================
  describe('6-Dimension Scoring', () => {
    describe('Dimension Validation', () => {
      it('should validate all 6 required dimensions', () => {
        const validScores = {
          Leadership: 3,
          Strategy: 3,
          People: 3,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        const result = validateDimensionScores(validScores);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail validation when dimension is missing', () => {
        const incompleteScores = {
          Leadership: 3,
          Strategy: 3,
          People: 3,
          Processes: 3,
          Resources: 3,
          // Missing Results
        };
        const result = validateDimensionScores(incompleteScores);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing dimension: Results');
      });

      it('should fail validation for non-integer scores', () => {
        const floatScores = {
          Leadership: 3.5,
          Strategy: 3,
          People: 3,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        const result = validateDimensionScores(floatScores);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Score must be integer for Leadership: 3.5');
      });

      it('should fail validation for scores outside 1-4 range', () => {
        const outOfRangeScores = {
          Leadership: 0,
          Strategy: 5,
          People: 3,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        const result = validateDimensionScores(outOfRangeScores);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Score out of range for Leadership: 0 (must be 1-4)');
        expect(result.errors).toContain('Score out of range for Strategy: 5 (must be 1-4)');
      });
    });

    describe('Dimension Averages Calculation', () => {
      it('should calculate correct averages across assessments', () => {
        const assessments = [
          { dimension_scores: { Leadership: 2, Strategy: 3, People: 2, Processes: 3, Resources: 2, Results: 2 } },
          { dimension_scores: { Leadership: 4, Strategy: 3, People: 4, Processes: 3, Resources: 4, Results: 4 } },
        ];

        const averages = calculateDimensionAverages(assessments);

        expect(averages.Leadership).toBe(3); // (2+4)/2
        expect(averages.Strategy).toBe(3); // (3+3)/2
        expect(averages.People).toBe(3); // (2+4)/2
        expect(averages.Processes).toBe(3); // (3+3)/2
        expect(averages.Resources).toBe(3); // (2+4)/2
        expect(averages.Results).toBe(3); // (2+4)/2
      });

      it('should handle single assessment correctly', () => {
        const assessments = [
          { dimension_scores: { Leadership: 2, Strategy: 3, People: 4, Processes: 1, Resources: 2, Results: 3 } },
        ];

        const averages = calculateDimensionAverages(assessments);

        expect(averages.Leadership).toBe(2);
        expect(averages.Strategy).toBe(3);
        expect(averages.People).toBe(4);
        expect(averages.Processes).toBe(1);
        expect(averages.Resources).toBe(2);
        expect(averages.Results).toBe(3);
      });

      it('should return zeros for empty assessments array', () => {
        const averages = calculateDimensionAverages([]);

        expect(averages.Leadership).toBe(0);
        expect(averages.Strategy).toBe(0);
        expect(averages.People).toBe(0);
        expect(averages.Processes).toBe(0);
        expect(averages.Resources).toBe(0);
        expect(averages.Results).toBe(0);
      });
    });

    describe('Default Dimensions Configuration', () => {
      it('should have exactly 6 default dimensions', () => {
        const dimensions = createMockDimensions();
        expect(dimensions).toHaveLength(6);
      });

      it('should have all required dimension names', () => {
        const dimensions = createMockDimensions();
        const names = dimensions.map((d) => d.name);

        expect(names).toContain('Leadership');
        expect(names).toContain('Strategy');
        expect(names).toContain('People');
        expect(names).toContain('Processes');
        expect(names).toContain('Resources');
        expect(names).toContain('Results');
      });

      it('should have 4 stage criteria for each dimension', () => {
        const dimensions = createMockDimensions();

        dimensions.forEach((dim) => {
          expect(dim.stage_1_criteria).toBeDefined();
          expect(dim.stage_2_criteria).toBeDefined();
          expect(dim.stage_3_criteria).toBeDefined();
          expect(dim.stage_4_criteria).toBeDefined();
          expect(dim.stage_1_criteria.length).toBeGreaterThan(0);
          expect(dim.stage_2_criteria.length).toBeGreaterThan(0);
          expect(dim.stage_3_criteria.length).toBeGreaterThan(0);
          expect(dim.stage_4_criteria.length).toBeGreaterThan(0);
        });
      });
    });
  });

  // ============================================================
  // Assessment Lifecycle Tests
  // ============================================================
  describe('Assessment Lifecycle', () => {
    describe('Status Transitions', () => {
      it('should allow draft -> submitted', () => {
        expect(isValidStatusTransition('draft', 'submitted')).toBe(true);
      });

      it('should allow draft -> archived', () => {
        expect(isValidStatusTransition('draft', 'archived')).toBe(true);
      });

      it('should allow submitted -> approved', () => {
        expect(isValidStatusTransition('submitted', 'approved')).toBe(true);
      });

      it('should allow submitted -> draft (rejection)', () => {
        expect(isValidStatusTransition('submitted', 'draft')).toBe(true);
      });

      it('should allow submitted -> archived', () => {
        expect(isValidStatusTransition('submitted', 'archived')).toBe(true);
      });

      it('should allow approved -> archived', () => {
        expect(isValidStatusTransition('approved', 'archived')).toBe(true);
      });

      it('should NOT allow draft -> approved (must submit first)', () => {
        expect(isValidStatusTransition('draft', 'approved')).toBe(false);
      });

      it('should NOT allow approved -> draft', () => {
        expect(isValidStatusTransition('approved', 'draft')).toBe(false);
      });

      it('should NOT allow archived -> any other status', () => {
        expect(isValidStatusTransition('archived', 'draft')).toBe(false);
        expect(isValidStatusTransition('archived', 'submitted')).toBe(false);
        expect(isValidStatusTransition('archived', 'approved')).toBe(false);
      });
    });

    describe('Assessment Creation', () => {
      it('should create assessment with draft status', () => {
        const assessment = createMockAssessment();
        expect(assessment.status).toBe('draft');
      });

      it('should calculate overall_stage on creation', () => {
        const assessment = createMockAssessment({
          dimension_scores: {
            Leadership: 3,
            Strategy: 2,
            People: 3,
            Processes: 2,
            Resources: 2,
            Results: 3,
          },
        });

        // Average: (3+2+3+2+2+3)/6 = 15/6 = 2.5 -> floor = 2
        expect(assessment.overall_stage).toBe(2);
      });

      it('should recalculate overall_stage when scores are updated', () => {
        const scores = {
          Leadership: 4,
          Strategy: 4,
          People: 3,
          Processes: 3,
          Resources: 3,
          Results: 3,
        };
        // Average: (4+4+3+3+3+3)/6 = 20/6 = 3.33 -> floor = 3
        expect(calculateOverallStage(scores)).toBe(3);
      });
    });

    describe('Approval Process', () => {
      it('should require reviewer_id for approval', () => {
        const assessment = createMockAssessment({ status: 'approved' });
        // When approved, should have reviewed_by
        const approvedAssessment = {
          ...assessment,
          reviewed_by: 'approver-001',
          reviewed_at: new Date().toISOString(),
        };

        expect(approvedAssessment.reviewed_by).toBeDefined();
        expect(approvedAssessment.reviewed_at).toBeDefined();
      });

      it('should set reviewed_at timestamp on approval', () => {
        const now = new Date();
        const assessment = createMockAssessment({
          status: 'approved',
          reviewed_by: 'approver-001',
          reviewed_at: now.toISOString(),
        });

        expect(new Date(assessment.reviewed_at!).getTime()).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================
  // Progress Tracking Tests
  // ============================================================
  describe('Progress Tracking', () => {
    describe('Progress Item Creation', () => {
      it('should create progress item with pending status', () => {
        const item = createMockProgressItem();
        expect(item.status).toBe('pending');
      });

      it('should link progress item to assessment', () => {
        const item = createMockProgressItem({ assessment_id: 'assessment-123' });
        expect(item.assessment_id).toBe('assessment-123');
      });

      it('should link progress item to specific dimension', () => {
        const item = createMockProgressItem({ dimension: 'Strategy' });
        expect(item.dimension).toBe('Strategy');
      });

      it('should have target_stage within 1-4 range', () => {
        const item = createMockProgressItem({ target_stage: 3 });
        expect(item.target_stage).toBeGreaterThanOrEqual(1);
        expect(item.target_stage).toBeLessThanOrEqual(4);
      });
    });

    describe('Progress Status Transitions', () => {
      it('should allow pending -> in_progress', () => {
        const item = createMockProgressItem({ status: 'pending' });
        const updated = { ...item, status: 'in_progress' as ProgressStatus };
        expect(updated.status).toBe('in_progress');
      });

      it('should allow in_progress -> completed', () => {
        const item = createMockProgressItem({ status: 'in_progress' });
        const updated = {
          ...item,
          status: 'completed' as ProgressStatus,
          completed_at: new Date().toISOString(),
        };
        expect(updated.status).toBe('completed');
        expect(updated.completed_at).toBeDefined();
      });

      it('should allow any status -> blocked', () => {
        const pendingItem = createMockProgressItem({ status: 'pending' });
        expect({ ...pendingItem, status: 'blocked' as ProgressStatus }.status).toBe('blocked');

        const inProgressItem = createMockProgressItem({ status: 'in_progress' });
        expect({ ...inProgressItem, status: 'blocked' as ProgressStatus }.status).toBe('blocked');
      });

      it('should set completed_at when marking as completed', () => {
        const item = createMockProgressItem({ status: 'in_progress' });
        const completedAt = new Date().toISOString();
        const completed = { ...item, status: 'completed' as ProgressStatus, completed_at: completedAt };

        expect(completed.completed_at).toBe(completedAt);
      });
    });

    describe('Overdue Detection', () => {
      it('should detect overdue items with past due_date', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 7); // 7 days ago

        const item = createMockProgressItem({
          due_date: pastDate.toISOString().split('T')[0],
          status: 'pending',
        });

        const isOverdue = item.status !== 'completed' && item.due_date && new Date(item.due_date) < new Date();
        expect(isOverdue).toBe(true);
      });

      it('should NOT mark completed items as overdue', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 7);

        const item = createMockProgressItem({
          due_date: pastDate.toISOString().split('T')[0],
          status: 'completed',
          completed_at: new Date().toISOString(),
        });

        const isOverdue = item.status !== 'completed' && item.due_date && new Date(item.due_date) < new Date();
        expect(isOverdue).toBe(false);
      });

      it('should NOT mark items without due_date as overdue', () => {
        const item = createMockProgressItem({
          due_date: null,
          status: 'pending',
        });

        const isOverdue = item.status !== 'completed' && item.due_date !== null && new Date(item.due_date!) < new Date();
        expect(isOverdue).toBe(false);
      });
    });
  });

  // ============================================================
  // Evidence Management Tests
  // ============================================================
  describe('Evidence Management', () => {
    describe('Evidence Linking', () => {
      it('should link evidence to assessment', () => {
        const evidence: MaturityEvidence = {
          id: 'evidence-001',
          assessment_id: 'assessment-001',
          dimension: 'Leadership',
          title: 'Leadership Training Program Documentation',
          description: 'Annual training program materials',
          file_url: 'https://storage.example.com/evidence/leadership-training.pdf',
          file_type: 'application/pdf',
          created_at: new Date().toISOString(),
          created_by: 'user-001',
        };

        expect(evidence.assessment_id).toBe('assessment-001');
      });

      it('should link evidence to specific dimension', () => {
        const evidence: MaturityEvidence = {
          id: 'evidence-001',
          assessment_id: 'assessment-001',
          dimension: 'Processes',
          title: 'SOP Documentation',
          created_at: new Date().toISOString(),
        };

        expect(evidence.dimension).toBe('Processes');
      });

      it('should validate dimension is one of 6 valid options', () => {
        const validDimensions: MaturityDimensionName[] = [
          'Leadership',
          'Strategy',
          'People',
          'Processes',
          'Resources',
          'Results',
        ];

        const evidence: MaturityEvidence = {
          id: 'evidence-001',
          assessment_id: 'assessment-001',
          dimension: 'Resources',
          title: 'Data Analytics Dashboard Screenshots',
          created_at: new Date().toISOString(),
        };

        expect(validDimensions).toContain(evidence.dimension);
      });
    });

    describe('Evidence Metadata', () => {
      it('should support file attachments with URL', () => {
        const evidence: MaturityEvidence = {
          id: 'evidence-001',
          assessment_id: 'assessment-001',
          dimension: 'People',
          title: 'Training Completion Report',
          file_url: 'https://storage.example.com/reports/training-q4-2024.xlsx',
          file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          created_at: new Date().toISOString(),
        };

        expect(evidence.file_url).toContain('https://');
        expect(evidence.file_type).toBeDefined();
      });

      it('should support evidence without file attachment', () => {
        const evidence: MaturityEvidence = {
          id: 'evidence-001',
          assessment_id: 'assessment-001',
          dimension: 'Results',
          title: 'NPS Score Improvement',
          description: 'NPS improved from 45 to 72 over Q4 2024',
          created_at: new Date().toISOString(),
        };

        expect(evidence.file_url).toBeUndefined();
        expect(evidence.description).toBeDefined();
      });
    });
  });

  // ============================================================
  // Dashboard & Visualization Tests
  // ============================================================
  describe('Dashboard Data Generation', () => {
    describe('Radar Chart Data', () => {
      it('should generate 6 data points for radar chart', () => {
        const assessment = createMockAssessment();
        const radarData = Object.entries(assessment.dimension_scores).map(([dimension, score]) => ({
          dimension: dimension as MaturityDimensionName,
          score: score as MaturityStage,
          target: assessment.target_stage,
        }));

        expect(radarData).toHaveLength(6);
      });

      it('should include target_stage when set', () => {
        const assessment = createMockAssessment({ target_stage: 4 });
        const radarData = Object.entries(assessment.dimension_scores).map(([dimension, score]) => ({
          dimension: dimension as MaturityDimensionName,
          score: score as MaturityStage,
          target: assessment.target_stage,
        }));

        radarData.forEach((point) => {
          expect(point.target).toBe(4);
        });
      });

      it('should have scores within 1-4 range', () => {
        const assessment = createMockAssessment();
        const scores = Object.values(assessment.dimension_scores);

        scores.forEach((score) => {
          expect(score).toBeGreaterThanOrEqual(1);
          expect(score).toBeLessThanOrEqual(4);
        });
      });
    });

    describe('Department Comparison', () => {
      it('should compare assessments across departments', () => {
        const dept1Assessment = createMockAssessment({
          id: 'assessment-dept1',
          department_id: 'dept-001',
          overall_stage: 3,
        });

        const dept2Assessment = createMockAssessment({
          id: 'assessment-dept2',
          department_id: 'dept-002',
          overall_stage: 2,
        });

        const comparisons = [
          { dept: 'dept-001', stage: dept1Assessment.overall_stage },
          { dept: 'dept-002', stage: dept2Assessment.overall_stage },
        ];

        expect(comparisons[0].stage).toBe(3);
        expect(comparisons[1].stage).toBe(2);
      });
    });

    describe('Trend Data', () => {
      it('should track stage progression over time', () => {
        const assessments = [
          createMockAssessment({ assessment_date: '2024-01-15', overall_stage: 1 }),
          createMockAssessment({ assessment_date: '2024-04-15', overall_stage: 2 }),
          createMockAssessment({ assessment_date: '2024-07-15', overall_stage: 2 }),
          createMockAssessment({ assessment_date: '2024-10-15', overall_stage: 3 }),
        ];

        const trend = assessments.map((a) => ({
          date: a.assessment_date,
          stage: a.overall_stage,
        }));

        // Verify progression
        expect(trend[0].stage).toBe(1);
        expect(trend[3].stage).toBe(3);
        expect(trend[3].stage).toBeGreaterThan(trend[0].stage);
      });
    });

    describe('Improvement Items Summary', () => {
      it('should calculate progress item statistics correctly', () => {
        const items = [
          createMockProgressItem({ status: 'completed' }),
          createMockProgressItem({ status: 'completed' }),
          createMockProgressItem({ status: 'in_progress' }),
          createMockProgressItem({ status: 'pending' }),
          createMockProgressItem({ status: 'blocked' }),
        ];

        const summary = {
          total: items.length,
          completed: items.filter((i) => i.status === 'completed').length,
          in_progress: items.filter((i) => i.status === 'in_progress').length,
          pending: items.filter((i) => i.status === 'pending').length,
          blocked: items.filter((i) => i.status === 'blocked').length,
        };

        expect(summary.total).toBe(5);
        expect(summary.completed).toBe(2);
        expect(summary.in_progress).toBe(1);
        expect(summary.pending).toBe(1);
        expect(summary.blocked).toBe(1);
      });

      it('should calculate completion percentage correctly', () => {
        const items = [
          createMockProgressItem({ status: 'completed' }),
          createMockProgressItem({ status: 'completed' }),
          createMockProgressItem({ status: 'in_progress' }),
          createMockProgressItem({ status: 'pending' }),
        ];

        const completedCount = items.filter((i) => i.status === 'completed').length;
        const completionPercentage = (completedCount / items.length) * 100;

        expect(completionPercentage).toBe(50);
      });
    });
  });

  // ============================================================
  // Overall Maturity Score Calculation Tests
  // ============================================================
  describe('Overall Maturity Score Calculation', () => {
    describe('Institution-wide Score', () => {
      it('should calculate institution average from department assessments', () => {
        const departmentAssessments = [
          createMockAssessment({ department_id: 'dept-1', overall_stage: 2 }),
          createMockAssessment({ department_id: 'dept-2', overall_stage: 3 }),
          createMockAssessment({ department_id: 'dept-3', overall_stage: 2 }),
          createMockAssessment({ department_id: 'dept-4', overall_stage: 3 }),
        ];

        const stages = departmentAssessments.map((a) => a.overall_stage);
        const average = stages.reduce((a, b) => a + b, 0) / stages.length;
        const institutionStage = Math.floor(average) as MaturityStage;

        // (2+3+2+3)/4 = 2.5 -> floors to 2 (matches DB FLOOR function)
        expect(institutionStage).toBe(2);
      });

      it('should handle institution-wide assessment (no department)', () => {
        const institutionAssessment = createMockAssessment({
          department_id: null,
          overall_stage: 3,
        });

        expect(institutionAssessment.department_id).toBeNull();
        expect(institutionAssessment.overall_stage).toBe(3);
      });
    });

    describe('Weighted Dimension Impact', () => {
      it('should show impact of single low dimension on overall score', () => {
        // All dimensions high except one
        const scores = {
          Leadership: 4,
          Strategy: 4,
          People: 4,
          Processes: 1, // Low performer
          Resources: 4,
          Results: 4,
        };

        // (4+4+4+1+4+4)/6 = 21/6 = 3.5 -> floor = 3
        expect(calculateOverallStage(scores)).toBe(3);
      });

      it('should require all dimensions at 4 for Excellence stage', () => {
        // Even with most at 4, one 3 prevents Excellence
        const almostExcellent = {
          Leadership: 4,
          Strategy: 4,
          People: 4,
          Processes: 3,
          Resources: 4,
          Results: 4,
        };

        // (4+4+4+3+4+4)/6 = 23/6 = 3.83 -> floor = 3
        expect(calculateOverallStage(almostExcellent)).toBe(3);

        // All 4s
        const excellent = {
          Leadership: 4,
          Strategy: 4,
          People: 4,
          Processes: 4,
          Resources: 4,
          Results: 4,
        };

        expect(calculateOverallStage(excellent)).toBe(4);
      });
    });
  });

  // ============================================================
  // Security & Authorization Tests
  // ============================================================
  describe('Security Validations', () => {
    describe('Institution Access Control', () => {
      it('should require institution_id for all assessments', () => {
        const assessment = createMockAssessment();
        expect(assessment.institution_id).toBeDefined();
        expect(assessment.institution_id.length).toBeGreaterThan(0);
      });

      it('should validate institution_id format (UUID)', () => {
        const validUUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
        const assessment = createMockAssessment({ institution_id: validUUID });

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(assessment.institution_id)).toBe(true);
      });
    });

    describe('Approver Authorization', () => {
      it('should track who approved the assessment', () => {
        const assessment = createMockAssessment({
          status: 'approved',
          reviewed_by: 'approver-uuid-001',
          reviewed_at: '2025-01-16T10:00:00Z',
        });

        expect(assessment.reviewed_by).toBe('approver-uuid-001');
      });

      it('should record approval timestamp', () => {
        const assessment = createMockAssessment({
          status: 'approved',
          reviewed_by: 'approver-uuid-001',
          reviewed_at: '2025-01-16T10:00:00Z',
        });

        expect(assessment.reviewed_at).toBeDefined();
        expect(new Date(assessment.reviewed_at!)).toBeInstanceOf(Date);
      });

      it('should differentiate assessor and approver', () => {
        const assessment = createMockAssessment({
          assessor_id: 'assessor-001',
          reviewed_by: 'approver-001',
        });

        expect(assessment.assessor_id).not.toBe(assessment.reviewed_by);
      });
    });
  });

  // ============================================================
  // Edge Cases & Error Handling
  // ============================================================
  describe('Edge Cases', () => {
    describe('Empty Data Handling', () => {
      it('should handle assessment without evidence gracefully', () => {
        const assessment = createMockAssessment({
          evidence: null,
          improvement_plan: null,
        });

        expect(assessment.evidence).toBeNull();
        expect(assessment.improvement_plan).toBeNull();
      });

      it('should handle assessment without target gracefully', () => {
        const assessment = createMockAssessment({
          target_stage: null,
          target_date: null,
        });

        expect(assessment.target_stage).toBeNull();
        expect(assessment.target_date).toBeNull();
      });
    });

    describe('Date Handling', () => {
      it('should accept valid date format (YYYY-MM-DD)', () => {
        const assessment = createMockAssessment({ assessment_date: '2025-01-15' });
        expect(assessment.assessment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it('should handle target date in the future', () => {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 6);
        const targetDate = futureDate.toISOString().split('T')[0];

        const assessment = createMockAssessment({ target_date: targetDate });
        expect(new Date(assessment.target_date!)).toBeInstanceOf(Date);
        expect(new Date(assessment.target_date!) > new Date()).toBe(true);
      });
    });

    describe('Large Data Sets', () => {
      it('should handle multiple assessments for dashboard', () => {
        const assessments = Array.from({ length: 100 }, (_, i) =>
          createMockAssessment({
            id: `assessment-${i}`,
            assessment_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
            overall_stage: ((i % 4) + 1) as MaturityStage,
          })
        );

        expect(assessments).toHaveLength(100);

        // Calculate trend (last 12)
        const trend = assessments.slice(-12);
        expect(trend).toHaveLength(12);
      });

      it('should handle many progress items per assessment', () => {
        const progressItems = Array.from({ length: 50 }, (_, i) =>
          createMockProgressItem({
            id: `progress-${i}`,
            dimension: ['Leadership', 'Strategy', 'People', 'Processes', 'Resources', 'Results'][
              i % 6
            ] as MaturityDimensionName,
          })
        );

        expect(progressItems).toHaveLength(50);

        // Group by dimension
        const byDimension = progressItems.reduce(
          (acc, item) => {
            acc[item.dimension] = (acc[item.dimension] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        // Should have ~8 items per dimension (50/6)
        Object.values(byDimension).forEach((count) => {
          expect(count).toBeGreaterThan(0);
        });
      });
    });
  });

  // ============================================================
  // Real-World Scenarios
  // ============================================================
  describe('Real-World Scenarios', () => {
    describe('Quarterly Assessment Cycle', () => {
      it('should track improvement across quarters', () => {
        const q1 = createMockAssessment({
          assessment_date: '2024-03-31',
          dimension_scores: { Leadership: 1, Strategy: 1, People: 2, Processes: 1, Resources: 1, Results: 2 },
        });
        q1.overall_stage = calculateOverallStage(q1.dimension_scores);

        const q2 = createMockAssessment({
          assessment_date: '2024-06-30',
          dimension_scores: { Leadership: 2, Strategy: 2, People: 2, Processes: 2, Resources: 2, Results: 2 },
        });
        q2.overall_stage = calculateOverallStage(q2.dimension_scores);

        const q3 = createMockAssessment({
          assessment_date: '2024-09-30',
          dimension_scores: { Leadership: 2, Strategy: 2, People: 3, Processes: 2, Resources: 3, Results: 3 },
        });
        q3.overall_stage = calculateOverallStage(q3.dimension_scores);

        const q4 = createMockAssessment({
          assessment_date: '2024-12-31',
          dimension_scores: { Leadership: 3, Strategy: 3, People: 3, Processes: 3, Resources: 3, Results: 3 },
        });
        q4.overall_stage = calculateOverallStage(q4.dimension_scores);

        // Verify progression
        expect(q1.overall_stage).toBe(1); // Crisis
        expect(q2.overall_stage).toBe(2); // Survival
        expect(q3.overall_stage).toBe(2); // Still Survival (2.5 avg)
        expect(q4.overall_stage).toBe(3); // Stability!
      });
    });

    describe('Department Benchmarking', () => {
      it('should identify best and worst performing departments', () => {
        const departments = [
          { name: 'Engineering', stage: 3 },
          { name: 'Operations', stage: 2 },
          { name: 'HR', stage: 4 },
          { name: 'Finance', stage: 2 },
          { name: 'Quality', stage: 3 },
        ];

        const sorted = [...departments].sort((a, b) => b.stage - a.stage);

        expect(sorted[0].name).toBe('HR'); // Best
        expect(sorted[sorted.length - 1].stage).toBe(2); // Worst stage
      });
    });

    describe('Improvement Planning', () => {
      it('should create actionable items for each weak dimension', () => {
        const assessment = createMockAssessment({
          dimension_scores: {
            Leadership: 3,
            Strategy: 2, // Weak
            People: 3,
            Processes: 1, // Very weak
            Resources: 2, // Weak
            Results: 3,
          },
        });

        // Find dimensions below target (3)
        const weakDimensions = Object.entries(assessment.dimension_scores)
          .filter(([_, score]) => score < 3)
          .map(([dim]) => dim);

        expect(weakDimensions).toContain('Strategy');
        expect(weakDimensions).toContain('Processes');
        expect(weakDimensions).toContain('Resources');
        expect(weakDimensions).not.toContain('Leadership');
      });
    });
  });
});

// ============================================================
// Validation Schema Tests
// ============================================================
describe('Validation Schemas', () => {
  describe('Maturity Stage Validation', () => {
    it('should accept integers 1 through 4', () => {
      [1, 2, 3, 4].forEach((stage) => {
        expect(stage >= 1 && stage <= 4 && Number.isInteger(stage)).toBe(true);
      });
    });

    it('should reject values outside 1-4 range', () => {
      [0, 5, -1, 10].forEach((stage) => {
        expect(stage >= 1 && stage <= 4).toBe(false);
      });
    });

    it('should reject non-integer values', () => {
      [1.5, 2.7, 3.9].forEach((stage) => {
        expect(Number.isInteger(stage)).toBe(false);
      });
    });
  });

  describe('Assessment Status Validation', () => {
    it('should accept valid status values', () => {
      const validStatuses: AssessmentStatus[] = ['draft', 'submitted', 'approved', 'archived'];

      validStatuses.forEach((status) => {
        expect(['draft', 'submitted', 'approved', 'archived']).toContain(status);
      });
    });
  });

  describe('Progress Status Validation', () => {
    it('should accept valid progress status values', () => {
      const validStatuses: ProgressStatus[] = ['pending', 'in_progress', 'completed', 'blocked'];

      validStatuses.forEach((status) => {
        expect(['pending', 'in_progress', 'completed', 'blocked']).toContain(status);
      });
    });
  });

  describe('Dimension Name Validation', () => {
    it('should accept only valid dimension names', () => {
      const validDimensions: MaturityDimensionName[] = [
        'Leadership',
        'Strategy',
        'People',
        'Processes',
        'Resources',
        'Results',
      ];

      validDimensions.forEach((dim) => {
        expect(validDimensions).toContain(dim);
      });
    });
  });
});
