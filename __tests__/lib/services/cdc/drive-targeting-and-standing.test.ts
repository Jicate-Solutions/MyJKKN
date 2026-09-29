import { describe, expect, it } from 'vitest';
import {
  normalizeInstitutionSemesters,
  isLearnerTargeted,
  distinctSemesterOrders,
  hasSemesterTargeting,
} from '@/lib/services/cdc/drive-targeting';
import { summarizeAcademicStanding, formatArrearsForExport } from '@/lib/services/cdc/academic-standing';
import { computeEligibility } from '@/lib/services/cdc/willingness-service';
import { emptyResultView } from '@/lib/services/coe/learner-result-view';
import type { StudentResultView, ResultViewCourse } from '@/types/my-marks';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

describe('normalizeInstitutionSemesters', () => {
  it('drops institutions not on the drive, dedupes, sorts and bounds semester orders', () => {
    const out = normalizeInstitutionSemesters(
      [
        { institution_id: A, semester_orders: ['6', 5, 5, 0, 99, 'x'] },
        { institution_id: C, semester_orders: [1] }, // not on the drive
        { institution_id: A, semester_orders: [1] }, // duplicate institution ignored
        { institution_id: B }, // no semesters = whole institution
      ],
      [A, B]
    );
    // program_ids joined the targeting entry with program targeting (2026-09-16).
    expect(out).toEqual([
      { institution_id: A, semester_orders: [5, 6], program_ids: [] },
      { institution_id: B, semester_orders: [], program_ids: [] },
    ]);
  });

  it('keeps program targeting per institution: UUIDs only, deduped', () => {
    const P = '44444444-4444-4444-4444-444444444444';
    const out = normalizeInstitutionSemesters(
      [{ institution_id: A, semester_orders: [5], program_ids: [P, P, 'not-a-uuid', 7] }],
      [A]
    );
    expect(out).toEqual([{ institution_id: A, semester_orders: [5], program_ids: [P] }]);
  });

  it('returns [] for garbage input', () => {
    expect(normalizeInstitutionSemesters(null, [A])).toEqual([]);
    expect(normalizeInstitutionSemesters('nope', [A])).toEqual([]);
  });
});

describe('isLearnerTargeted', () => {
  const drive = {
    institutions: [A, B],
    institution_semesters: [
      { institution_id: A, semester_orders: [5, 6] },
      { institution_id: B, semester_orders: [] },
    ],
  };

  it('matches institution + semester', () => {
    expect(isLearnerTargeted(drive, { institution_id: A, semester_order: 5 })).toBe(true);
    expect(isLearnerTargeted(drive, { institution_id: A, semester_order: 6 })).toBe(true);
  });
  it('rejects a semester outside the list', () => {
    expect(isLearnerTargeted(drive, { institution_id: A, semester_order: 3 })).toBe(false);
    expect(isLearnerTargeted(drive, { institution_id: A, semester_order: null })).toBe(false);
  });
  it('an empty semester list means the whole institution', () => {
    expect(isLearnerTargeted(drive, { institution_id: B, semester_order: 1 })).toBe(true);
    expect(isLearnerTargeted(drive, { institution_id: B, semester_order: null })).toBe(true);
  });
  it('rejects institutions not on the drive', () => {
    expect(isLearnerTargeted(drive, { institution_id: C, semester_order: 5 })).toBe(false);
    expect(isLearnerTargeted(drive, { institution_id: null, semester_order: 5 })).toBe(false);
  });
  it('summaries', () => {
    expect(distinctSemesterOrders(drive)).toEqual([5, 6]);
    expect(hasSemesterTargeting(drive)).toBe(true);
    expect(hasSemesterTargeting({ institution_semesters: [{ institution_id: A, semester_orders: [] }] })).toBe(false);
  });
});

describe('computeEligibility', () => {
  it('uses institution + semester targeting when present', () => {
    const drive = { institutions: [A], institution_semesters: [{ institution_id: A, semester_orders: [6] }] };
    expect(computeEligibility(drive, null, { program_id: null, institution_id: A, semester_order: 6 }).is_eligible).toBe(true);
    const r = computeEligibility(drive, null, { program_id: null, institution_id: A, semester_order: 2 });
    expect(r.is_eligible).toBe(false);
    expect(r.reason).toMatch(/semester/i);
    expect(computeEligibility(drive, null, { program_id: null, institution_id: B, semester_order: 6 }).reason).toMatch(/institution/i);
  });

  it('falls back to legacy program_ids when the drive has no targeting', () => {
    const drive = { institutions: [A], institution_semesters: [] };
    const eligibility = { program_ids: ['p1'] } as any;
    expect(computeEligibility(drive, eligibility, { program_id: 'p1', institution_id: A, semester_order: null }).is_eligible).toBe(true);
    expect(computeEligibility(drive, eligibility, { program_id: 'p2', institution_id: A, semester_order: null }).is_eligible).toBe(false);
    expect(computeEligibility(drive, null, { program_id: 'p1', institution_id: A, semester_order: null }).reason).toMatch(/not been configured/);
  });
});

function course(over: Partial<ResultViewCourse>): ResultViewCourse {
  return {
    course_code: 'X',
    course_name: null,
    course_order: null,
    credit: 3,
    internal_obtained: null,
    internal_max: null,
    external_obtained: null,
    external_max: null,
    total_obtained: null,
    total_max: null,
    percentage: null,
    letter_grade: null,
    grade_points: null,
    total_grade_points: null,
    is_pass: null,
    pass_status: null,
    result_status: null,
    is_published: true,
    is_regular: true,
    attempt_number: null,
    semester_code: null,
    semester_index: null,
    credit_included: null,
    examination_session_id: null,
    ...over,
  };
}

function view(sessions: ResultViewCourse[][]): StudentResultView {
  return {
    ...emptyResultView('R1'),
    sessions: sessions.map((courses, i) => ({
      examination_session_id: null,
      session_code: null,
      session_name: null,
      session_status: null,
      result_declaration_date: null,
      semester_code: String(i + 1),
      semester_label: `Semester ${i + 1}`,
      semester_index: i + 1,
      courses,
      summary: { sgpa: null, total_credits: 0, passed: 0, total: courses.length },
    })),
  };
}

describe('summarizeAcademicStanding', () => {
  it('computes a credit-weighted CGPA over passed papers and lists standing arrears', () => {
    const v = view([
      [
        course({ course_code: 'MA101', credit: 4, grade_points: 9, is_pass: true, semester_code: '1' }),
        course({ course_code: 'PH101', credit: 2, grade_points: 0, is_pass: false, result_status: 'RA', semester_code: '1' }),
      ],
      [
        course({ course_code: 'CS201', credit: 3, grade_points: 8, is_pass: true, semester_code: '2' }),
        // arrear re-attempt of PH101, still failed
        course({ course_code: 'PH101', credit: 2, grade_points: 0, is_pass: false, is_regular: false, attempt_number: 2, semester_code: '1' }),
      ],
    ]);
    const s = summarizeAcademicStanding(v);
    expect(s.cgpa).toBe(Math.round(((4 * 9 + 3 * 8) / 7) * 100) / 100);
    expect(s.arrears_count).toBe(1);
    expect(s.arrears[0]).toMatchObject({ course_code: 'PH101', attempts: 2, semester: '1' });
    expect(formatArrearsForExport(s.arrears)).toBe('PH101 (Sem 1)');
  });

  it('clears an arrear once a later attempt passes and ignores unpublished papers', () => {
    const v = view([
      [course({ course_code: 'PH101', credit: 2, grade_points: 0, is_pass: false })],
      [
        course({ course_code: 'PH101', credit: 2, grade_points: 6, is_pass: true, is_regular: false, attempt_number: 2 }),
        course({ course_code: 'CS999', is_published: false }),
      ],
    ]);
    const s = summarizeAcademicStanding(v);
    expect(s.arrears_count).toBe(0);
    expect(s.cgpa).toBe(6);
    expect(s.papers_published).toBe(2);
  });

  it('handles an empty / null view', () => {
    expect(summarizeAcademicStanding(null)).toMatchObject({ cgpa: null, arrears_count: 0, arrears: [] });
    expect(summarizeAcademicStanding(view([]))).toMatchObject({ cgpa: null, arrears_count: 0 });
  });
});
