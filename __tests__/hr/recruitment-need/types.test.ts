import { describe, it, expect } from 'vitest';

/**
 * HR Recruitment Need Types — Importability & Shape Validation
 *
 * Verifies that all exported types/interfaces from types/hr-recruitment-need.ts
 * are importable and that key union types cover expected values.
 * These tests catch refactoring regressions (renamed exports, missing members).
 */

import type {
  SignalStatus,
  OverallSignalStatus,
  SignalInputKey,
  GranularityLevel,
  EscalationStatus,
  WorkloadSource,
  HRSignalInputResult,
  HRRecruitmentSignalCache,
  HRRecruitmentSignalInput,
  HRRecruitmentSignalSuppression,
  HRRecruitmentSignalSuppressionInsert,
  HRRecruitmentEscalation,
  HRRecruitmentEscalationInsert,
  HRRecruitmentEscalationUpdate,
  HRRecruitmentUserVisit,
  HRRecruitmentSignalSnapshot,
  HRRecruitmentSignalSnapshotInsert,
  HRFacultyWorkload,
  HRRegulatoryBody,
  HRSpecialization,
  HRRegulatoryNorm,
  InstitutionProgramApproval,
  HRStaffInstitutionAllocation,
  HRPeerBenchmark,
  ComputeSignalParams,
  SignalFilters,
} from '../../../types/hr-recruitment-need';

// ─── SignalInputKey union covers all 7 keys ─────────────────────────────────────

describe('SignalInputKey', () => {
  it('covers all 7 expected input keys', () => {
    const allKeys: SignalInputKey[] = [
      'sanctioned_gap',
      'sfr',
      'specialization_gap',
      'workload',
      'projected_intake',
      'attrition_pipeline',
      'peer_benchmark',
    ];

    expect(allKeys).toHaveLength(7);

    // Each key is assignable (TypeScript compile-time check; runtime confirms no duplicates)
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(7);
  });
});

// ─── SignalStatus enum values ───────────────────────────────────────────────────

describe('SignalStatus', () => {
  it('covers green, amber, red, insufficient_data', () => {
    const statuses: SignalStatus[] = ['green', 'amber', 'red', 'insufficient_data'];
    expect(statuses).toHaveLength(4);
    expect(new Set(statuses).size).toBe(4);
  });
});

// ─── OverallSignalStatus enum values ────────────────────────────────────────────

describe('OverallSignalStatus', () => {
  it('covers green, amber, red, blocked, insufficient_data', () => {
    const statuses: OverallSignalStatus[] = [
      'green', 'amber', 'red', 'blocked', 'insufficient_data',
    ];
    expect(statuses).toHaveLength(5);
    expect(new Set(statuses).size).toBe(5);
  });
});

// ─── EscalationStatus enum values ───────────────────────────────────────────────

describe('EscalationStatus', () => {
  it('covers pending, acknowledged, resolved, dismissed', () => {
    const statuses: EscalationStatus[] = [
      'pending', 'acknowledged', 'resolved', 'dismissed',
    ];
    expect(statuses).toHaveLength(4);
    expect(new Set(statuses).size).toBe(4);
  });
});

// ─── GranularityLevel ───────────────────────────────────────────────────────────

describe('GranularityLevel', () => {
  it('covers program and department', () => {
    const levels: GranularityLevel[] = ['program', 'department'];
    expect(levels).toHaveLength(2);
  });
});

// ─── WorkloadSource ─────────────────────────────────────────────────────────────

describe('WorkloadSource', () => {
  it('covers manual, timetable_import, self_report', () => {
    const sources: WorkloadSource[] = ['manual', 'timetable_import', 'self_report'];
    expect(sources).toHaveLength(3);
  });
});

// ─── Interface shape validation (runtime property checks) ───────────────────────

describe('Type shape validation', () => {
  it('HRSignalInputResult has expected keys', () => {
    const obj: HRSignalInputResult = {
      input_key: 'sfr',
      status: 'green',
      value: 12,
      norm: 15,
      gap: -3,
      pct_of_norm: 80,
      raw_data: null,
    };

    expect(obj.input_key).toBe('sfr');
    expect(obj.status).toBe('green');
    expect(typeof obj.value).toBe('number');
  });

  it('HRRecruitmentSignalCache has expected keys', () => {
    const obj: HRRecruitmentSignalCache = {
      id: 'test-id',
      institution_id: 'inst-1',
      program_id: null,
      department_id: null,
      granularity_level: 'program',
      composite_score: 75,
      input_signals: {
        sanctioned_gap: { status: 'green', value: 0, norm: 10, gap: 0, pct_of_norm: 100 },
        sfr: { status: 'amber', value: 18, norm: 15, gap: 3, pct_of_norm: 120 },
        specialization_gap: { status: 'green', value: 0, norm: 5, gap: 0, pct_of_norm: 100 },
        workload: { status: 'red', value: 24, norm: 16, gap: 8, pct_of_norm: 150 },
        projected_intake: { status: 'green', value: 100, norm: 120, gap: -20, pct_of_norm: 83 },
        attrition_pipeline: { status: 'green', value: 2, norm: 5, gap: -3, pct_of_norm: 40 },
        peer_benchmark: { status: 'amber', value: 16, norm: 14, gap: 2, pct_of_norm: 114 },
      },
      overall_status: 'amber',
      blocked_inputs: null,
      computed_at: '2026-05-26T00:00:00Z',
      computed_by_function: 'fn_compute_recruitment_signal',
      financial_year: '2025-26',
      raw_data: null,
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    };

    expect(obj.overall_status).toBe('amber');
    expect(Object.keys(obj.input_signals)).toHaveLength(7);
  });

  it('ComputeSignalParams requires institution_id', () => {
    const params: ComputeSignalParams = { institution_id: 'inst-1' };
    expect(params.institution_id).toBe('inst-1');
    expect(params.program_id).toBeUndefined();
  });

  it('SignalFilters allows partial filtering', () => {
    const empty: SignalFilters = {};
    const full: SignalFilters = {
      institution_id: 'inst-1',
      program_id: 'prog-1',
      overall_status: 'red',
    };

    expect(Object.keys(empty)).toHaveLength(0);
    expect(full.overall_status).toBe('red');
  });

  it('HRRecruitmentSignalSuppressionInsert has required fields', () => {
    const insert: HRRecruitmentSignalSuppressionInsert = {
      institution_id: 'inst-1',
      reason: 'Under review',
      suppress_until: '2026-12-31',
    };
    expect(insert.institution_id).toBe('inst-1');
    expect(insert.program_id).toBeUndefined();
  });

  it('HRRecruitmentEscalationInsert has required fields', () => {
    const insert: HRRecruitmentEscalationInsert = {
      institution_id: 'inst-1',
      reason: 'Need immediate hiring',
    };
    expect(insert.institution_id).toBe('inst-1');
    expect(insert.documents).toBeUndefined();
  });

  it('HRRecruitmentEscalationUpdate allows partial fields', () => {
    const statusOnly: HRRecruitmentEscalationUpdate = { status: 'resolved' };
    const notesOnly: HRRecruitmentEscalationUpdate = { resolution_notes: 'Done' };

    expect(statusOnly.status).toBe('resolved');
    expect(notesOnly.resolution_notes).toBe('Done');
  });

  it('HRFacultyWorkload has semester as 1 or 2', () => {
    const w: HRFacultyWorkload = {
      id: 'w-1',
      staff_id: 'staff-1',
      institution_id: 'inst-1',
      academic_year: '2025-26',
      semester: 1,
      weekly_contact_hours: 16,
      weekly_admin_hours: null,
      weekly_research_hours: null,
      source: 'manual',
      entered_by: null,
      verified_at: null,
      verified_by: null,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    expect(w.semester).toBe(1);
    expect(w.source).toBe('manual');
  });
});
