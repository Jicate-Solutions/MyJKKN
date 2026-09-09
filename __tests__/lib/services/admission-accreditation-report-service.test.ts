// __tests__/lib/services/admission-accreditation-report-service.test.ts
// ============================================================================
// Regression cover for the NAAC 8.1.1 enrolment-vs-intake report.
//
// The defect being locked down: generateEnrollmentReport read sanctioned seats
// from public.institution_seat_config, a table that does not exist in
// production in any schema, and destructured only `data`. The error was
// discarded, the seat map stayed empty, and every institution-year row was
// published — on screen AND in the CSV export — with a sanctioned intake of 0
// and an enrolment of 0%.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock supabase browser client. Each table answers from `tableData`, and any
// table listed in `tableErrors` answers with an error instead.
// ---------------------------------------------------------------------------

let tableData: Record<string, any[]> = {};
let tableErrors: Record<string, any> = {};
let queriedTables: string[] = [];

function buildSupabaseMock() {
  return {
    from: (table: string) => {
      queriedTables.push(table);
      const chain: any = {
        select: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        then: (resolve: any) =>
          Promise.resolve(
            tableErrors[table]
              ? { data: null, error: tableErrors[table] }
              : { data: tableData[table] ?? [], error: null },
          ).then(resolve),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => buildSupabaseMock(),
}));

import { AdmissionAccreditationReportService } from '@/lib/services/admission/admission-accreditation-report-service';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';
const YEAR_2025 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_2026 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
// Second college's own row for the same label — the report groups by label.
const YEAR_2026_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function seedBaseline() {
  tableData = {
    institutions: [
      { id: INST_A, name: 'JKKN College of Engineering and Technology' },
      { id: INST_B, name: 'JKKN College of Pharmacy' },
    ],
    academic_years: [
      { id: YEAR_2025, academic_year_name: '2025-2026' },
      { id: YEAR_2026, academic_year_name: '2026-2027' },
      { id: YEAR_2026_B, academic_year_name: '2026-2027' },
    ],
    intake_history: [],
    admission_leads: [],
  };
  tableErrors = {};
  queriedTables = [];
}

beforeEach(() => {
  seedBaseline();
});

function rowFor(rows: any[], institution: string, year: string) {
  return rows.find(
    (r) => r.institution_name === institution && r.academic_year === year,
  );
}

describe('AdmissionAccreditationReportService.generateEnrollmentReport', () => {
  it('reads sanctioned intake from intake_history, not the non-existent institution_seat_config', async () => {
    await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(queriedTables).toContain('intake_history');
    expect(queriedTables).not.toContain('institution_seat_config');
  });

  it('sums sanctioned intake across programme rows and maps academic_year_id to the year label', async () => {
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 60 },
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 42 },
      { institution_id: INST_B, academic_year_id: YEAR_2026_B, sanctioned_intake: 190 },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(
      rowFor(report.rows, 'JKKN College of Engineering and Technology', '2026-2027')
        ?.sanctioned_intake,
    ).toBe(102);
    // The second college keys on its OWN academic_years row carrying the same label.
    expect(
      rowFor(report.rows, 'JKKN College of Pharmacy', '2026-2027')?.sanctioned_intake,
    ).toBe(190);

    expect(report.seatSource).toMatchObject({
      table: 'intake_history',
      ok: true,
      error: null,
      rowsWithIntake: 2,
      totalRows: 4, // 2 institutions x 2 distinct year labels
    });
  });

  it('reports an unrecorded institution-year as null, never as an intake of 0', async () => {
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 402 },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    const unknown = rowFor(
      report.rows,
      'JKKN College of Engineering and Technology',
      '2025-2026',
    );
    expect(unknown?.sanctioned_intake).toBeNull();
    expect(unknown?.enrollment_percentage).toBeNull();
    // Not merely falsy — a 0 here is a published accreditation claim.
    expect(unknown?.sanctioned_intake).not.toBe(0);
    expect(unknown?.enrollment_percentage).not.toBe(0);
  });

  it('does not publish zeros when the seat read fails — it flags the source instead', async () => {
    // Exactly the production shape before the fix: the seat table is unusable.
    tableErrors.intake_history = {
      message: 'relation "public.institution_seat_config" does not exist',
      code: '42P01',
    };

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(report.rows).toHaveLength(4);
    for (const row of report.rows) {
      expect(row.sanctioned_intake).toBeNull();
      expect(row.enrollment_percentage).toBeNull();
    }
    expect(report.seatSource.ok).toBe(false);
    expect(report.seatSource.error).toContain('does not exist');
    expect(report.seatSource.rowsWithIntake).toBe(0);
    for (const avg of report.averages) {
      expect(avg.avg_enrollment_percentage).toBeNull();
    }
  });

  it('treats a programme row with a null sanctioned_intake as unrecorded, not as 0', async () => {
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: null },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(
      rowFor(report.rows, 'JKKN College of Engineering and Technology', '2026-2027')
        ?.sanctioned_intake,
    ).toBeNull();
    expect(report.seatSource.rowsWithIntake).toBe(0);
  });

  it('computes the fill rate when the enrolment source does line up', async () => {
    // The service derives a 'YYYY-YY' bucket key from the lead date, so this
    // fixture uses a matching label. Production does NOT — see the next test.
    tableData.academic_years = [
      { id: YEAR_2026, academic_year_name: '2026-27' },
    ];
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 200 },
    ];
    tableData.admission_leads = [
      { institution_id: INST_A, updated_at: '2026-08-01T00:00:00Z' },
      { institution_id: INST_A, updated_at: '2026-09-01T00:00:00Z' },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(report.enrolmentSource.usable).toBe(true);
    const row = rowFor(
      report.rows,
      'JKKN College of Engineering and Technology',
      '2026-27',
    );
    expect(row?.sanctioned_intake).toBe(200);
    expect(row?.students_admitted).toBe(2);
    expect(row?.enrollment_percentage).toBe(1);
  });

  it('will not publish a 0% fill rate when no lead sits at the enrolment stage', async () => {
    // Production shape: intake is recorded, admission_leads has no row at
    // funnel_stage 'enrolled'. Before this change the row read "402 / 0 / 0%".
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 402 },
    ];
    tableData.admission_leads = [];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    const row = rowFor(
      report.rows,
      'JKKN College of Engineering and Technology',
      '2026-2027',
    );
    expect(row?.sanctioned_intake).toBe(402);
    expect(row?.students_admitted).toBeNull();
    expect(row?.enrollment_percentage).toBeNull();
    expect(report.enrolmentSource).toMatchObject({
      ok: true,
      leadsRead: 0,
      leadsMatchedToYear: 0,
      usable: false,
    });
  });

  it('flags the admitted column as unusable when the derived year label matches no academic year', async () => {
    // The live defect: the service derives '2026-27', every production
    // academic_year_name is 'YYYY-YYYY', so the bucket key can never match.
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 402 },
    ];
    tableData.admission_leads = [
      { institution_id: INST_A, updated_at: '2026-08-01T00:00:00Z' },
      { institution_id: INST_A, updated_at: '2026-09-01T00:00:00Z' },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(report.enrolmentSource).toMatchObject({
      leadsRead: 2,
      leadsMatchedToYear: 0,
      usable: false,
    });
    for (const row of report.rows) {
      expect(row.students_admitted).toBeNull();
      expect(row.enrollment_percentage).toBeNull();
    }
  });

  it('averages only the years it can state, so an unknown year does not drag the college to 0%', async () => {
    tableData.academic_years = [
      { id: YEAR_2025, academic_year_name: '2025-26' },
      { id: YEAR_2026, academic_year_name: '2026-27' },
    ];
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 100 },
      // 2025-26 deliberately unrecorded.
    ];
    tableData.admission_leads = [
      { institution_id: INST_A, updated_at: '2026-08-01T00:00:00Z' },
      { institution_id: INST_A, updated_at: '2026-08-02T00:00:00Z' },
      { institution_id: INST_A, updated_at: '2026-08-03T00:00:00Z' },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    const avg = report.averages.find(
      (a) => a.institution_name === 'JKKN College of Engineering and Technology',
    );
    // 3% for the one stateable year — NOT 1.5% from averaging in an unknown year as 0.
    expect(avg?.avg_enrollment_percentage).toBe(3);

    const pharmacy = report.averages.find(
      (a) => a.institution_name === 'JKKN College of Pharmacy',
    );
    expect(pharmacy?.avg_enrollment_percentage).toBeNull();
  });

  it('cannot state a percentage against a recorded sanctioned intake of 0', async () => {
    tableData.academic_years = [
      { id: YEAR_2026, academic_year_name: '2026-27' },
    ];
    tableData.intake_history = [
      { institution_id: INST_A, academic_year_id: YEAR_2026, sanctioned_intake: 0 },
    ];
    tableData.admission_leads = [
      { institution_id: INST_A, updated_at: '2026-08-01T00:00:00Z' },
    ];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    const row = rowFor(
      report.rows,
      'JKKN College of Engineering and Technology',
      '2026-27',
    );
    expect(row?.sanctioned_intake).toBe(0);
    expect(row?.students_admitted).toBe(1);
    expect(row?.enrollment_percentage).toBeNull();
  });

  it('returns an empty report with a seat-source stub when there are no academic years', async () => {
    tableData.academic_years = [];

    const report = await AdmissionAccreditationReportService.generateEnrollmentReport();

    expect(report.rows).toEqual([]);
    expect(report.averages).toEqual([]);
    expect(report.seatSource).toMatchObject({ ok: true, totalRows: 0, rowsWithIntake: 0 });
  });
});
