// lib/services/admission/admission-accreditation-report-service.ts
// ============================================================================
// Admission Accreditation Report Service (PR-A3, 2026-04-17)
//
// Renamed from NAACReportService. Generates accreditation reports from
// admission data — currently NAAC Metric 8.1.1 (Student enrolment vs
// sanctioned intake, Binary Accreditation 2024 framework)
// + emits fan-out evidence rows for applicable bodies:
//   NAAC 8.1.1 + NIRF TLR_SS (enrollment data serves both)
//
// Re-keyed 2026-07-09 (stale-metric audit PR-7): previously emitted the
// old-framework Criterion code '2.1.1', which is absent from the Binary
// catalog. Prod had zero ('NAAC','2.1.1') junction rows at re-key time,
// so no data migration was needed.
//
// Per Compliance Unification Program:
// specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md PR-A3
//
// Legacy export NAACReportService is kept as an alias for callers that
// haven't been updated yet — will be removed in a follow-up cleanup PR.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  EVIDENCE_CONFLICT_TARGET,
  EVIDENCE_CONFLICT_TARGET_LEGACY,
} from '@/lib/types/accreditation';

export interface NAACEnrollmentRow {
  institution_name: string;
  academic_year: string;
  /**
   * null = NOT RECORDED for this institution + academic year (no intake_history
   * row carrying a number). It is deliberately not 0: this table is exported as
   * an accreditation artefact, where a zero is a claim ("we were sanctioned no
   * seats") and a blank is an absence.
   */
  sanctioned_intake: number | null;
  /**
   * null when the enrolment source is not measuring anything for this report
   * (see NAACEnrolmentSourceStatus.usable). Same rule as sanctioned_intake: an
   * absent source must not be published as "0 students admitted".
   */
  students_admitted: number | null;
  /**
   * null when the fill rate cannot be stated — sanctioned intake unknown, a
   * sanctioned intake of 0 (a percentage of a zero denominator is undefined),
   * or an admitted count that is unknown rather than observed.
   */
  enrollment_percentage: number | null;
}

/**
 * Provenance for the sanctioned-intake column, so the UI can say WHY a row is
 * blank instead of silently printing a number the reader will quote.
 */
export interface NAACSeatSourceStatus {
  /** Table the sanctioned intake is read from. */
  table: 'intake_history';
  /** false when the read itself failed (the error used to be discarded). */
  ok: boolean;
  error: string | null;
  /** Report rows that carry a real sanctioned intake. */
  rowsWithIntake: number;
  totalRows: number;
}

/**
 * Provenance for the students-admitted column.
 *
 * `usable` is false when the column is not measuring anything — either no lead
 * sits at the enrolment funnel stage at all, or none of the leads read bucket
 * into an academic year label this report knows. In production BOTH are true:
 * `admission_leads` has zero rows at funnel_stage 'enrolled' (the live stage
 * vocabulary is new/contacted/…/confirmed/token_paid), and the year label this
 * service derives from a lead's date is 'YYYY-YY' ("2026-27") while every
 * `academic_years.academic_year_name` in production is 'YYYY-YYYY'
 * ("2026-2027"), so the bucket key can never match. See the PR notes: the
 * numerator is left exactly as it was — inventing an enrolment definition for
 * an accreditation metric is not a bug fix — but the column now declares that
 * it is empty instead of publishing zeros.
 */
export interface NAACEnrolmentSourceStatus {
  table: 'admission_leads';
  funnelStage: 'enrolled';
  ok: boolean;
  error: string | null;
  /** Leads read at that funnel stage. */
  leadsRead: number;
  /** Of those, how many bucketed into a year label present in this report. */
  leadsMatchedToYear: number;
  /** false => admitted counts and percentages are published as null, not 0. */
  usable: boolean;
}

export interface NAACReport {
  rows: NAACEnrollmentRow[];
  averages: {
    institution_name: string;
    /** null when no row for this institution had a stateable percentage. */
    avg_enrollment_percentage: number | null;
  }[];
  seatSource: NAACSeatSourceStatus;
  enrolmentSource: NAACEnrolmentSourceStatus;
}

const EMPTY_SEAT_SOURCE: NAACSeatSourceStatus = {
  table: 'intake_history',
  ok: true,
  error: null,
  rowsWithIntake: 0,
  totalRows: 0,
};

const EMPTY_ENROLMENT_SOURCE: NAACEnrolmentSourceStatus = {
  table: 'admission_leads',
  funnelStage: 'enrolled',
  ok: true,
  error: null,
  leadsRead: 0,
  leadsMatchedToYear: 0,
  usable: false,
};

const EMPTY_REPORT = (): NAACReport => ({
  rows: [],
  averages: [],
  seatSource: { ...EMPTY_SEAT_SOURCE },
  enrolmentSource: { ...EMPTY_ENROLMENT_SOURCE },
});

export class AdmissionAccreditationReportService {
  private static supabase = createClientSupabaseClient();

  /**
   * Generate NAAC Metric 8.1.1 report (Binary framework)
   * Student enrolment vs sanctioned intake — years sourced from academic_years table
   *
   * SANCTIONED INTAKE SOURCE (corrected 2026-09-09):
   * Read from public.intake_history (institution_id, academic_year_id,
   * sanctioned_intake), summed over that institution's programme rows for the
   * year. This is the source the platform's own metric catalog names for this
   * metric — migration 20260709030000 sets
   *   sh_accreditation_metrics.calculation_method =
   *     'intake_history: actual_intake / sanctioned_intake per program x year'
   * for ('NAAC','8.1.1') — and the same table backs the induction scorecard's
   * vacant-seat arithmetic (migration 20260628120000).
   *
   * It previously read public.institution_seat_config, which does not exist in
   * production in any schema, and destructured only `data`, so the resulting
   * error was discarded, the seat map stayed empty, and EVERY row was published
   * with a sanctioned intake of 0 and an enrolment of 0%. Both reads below now
   * bind their error. Rows with no recorded intake carry null, not 0 — this
   * table is exported as CSV and quoted in accreditation submissions, where a
   * zero is a claim and a blank is an absence.
   *
   * programs.sanctioned_intake was NOT used: it is current-state, carries no
   * academic year, and would restate today's intake for every historical year.
   */
  static async generateEnrollmentReport(
    institutionId?: string,
  ): Promise<NAACReport> {
    // Get institutions
    let instQuery = this.supabase.from('institutions').select('id, name');
    if (institutionId) {
      instQuery = instQuery.eq('id', institutionId);
    }

    const { data: institutions, error: instError } = await instQuery;
    if (instError || !institutions) {
      console.error('[admission/naac] Failed to fetch institutions:', instError);
      return EMPTY_REPORT();
    }

    const institutionIds = institutions.map((i) => i.id);

    // Fetch academic years from the academic_years table (dynamic, not hardcoded).
    // `id` is needed too: intake_history keys on academic_year_id, while the
    // report is grouped by the human year label.
    const { data: academicYearsData, error: yearsError } = await (this.supabase as any)
      .from('academic_years')
      .select('id, academic_year_name')
      .in('institution_id', institutionIds)
      .order('start_date', { ascending: true });

    if (yearsError) {
      console.error('[admission/naac] Failed to fetch academic years:', yearsError);
      return EMPTY_REPORT();
    }

    const academicYearRows = (academicYearsData || []) as {
      id: string;
      academic_year_name: string;
    }[];

    // academic_year_id -> year label. Several institutions can each own a row
    // with the same label; the report groups by label, so many ids may map to
    // the same name.
    const yearNameById = new Map<string, string>();
    for (const y of academicYearRows) {
      yearNameById.set(y.id, y.academic_year_name);
    }

    // Deduplicate year names (multiple institutions may share the same year label)
    const years: string[] = [
      ...new Set<string>(academicYearRows.map((y) => y.academic_year_name)),
    ];

    if (years.length === 0) {
      return EMPTY_REPORT();
    }

    // Sanctioned intake per programme per year. The error is BOUND, not
    // discarded — a failed read here must not be reported as an intake of 0.
    const { data: seatData, error: seatError } = await (this.supabase as any)
      .from('intake_history')
      .select('institution_id, academic_year_id, sanctioned_intake')
      .in('institution_id', institutionIds)
      .in('academic_year_id', Array.from(yearNameById.keys()));

    if (seatError) {
      console.error(
        '[admission/naac] Failed to read sanctioned intake from intake_history:',
        seatError,
      );
    }

    // Get enrolled counts from admission_leads
    // Since we can't easily filter by academic year from lead dates,
    // we'll get all enrolled leads and bucket by year
    const { data: enrolledData, error: enrolledError } = await (this.supabase as any)
      .from('admission_leads')
      .select('institution_id, updated_at')
      .in('institution_id', institutionIds)
      .eq('funnel_stage', 'enrolled');

    if (enrolledError) {
      console.error(
        '[admission/naac] Failed to read enrolled leads from admission_leads:',
        enrolledError,
      );
    }

    // Build seat map. A key is only present once at least one programme row
    // carried a NUMBER, so "no row" and "row with a null intake" both stay
    // absent rather than collapsing to a sanctioned intake of 0.
    const seatMap = new Map<string, number>();
    for (const seat of (seatError ? [] : seatData || []) as {
      institution_id: string;
      academic_year_id: string;
      sanctioned_intake: number | null;
    }[]) {
      if (typeof seat.sanctioned_intake !== 'number') continue;
      const yearName = yearNameById.get(seat.academic_year_id);
      if (!yearName) continue;
      const key = `${seat.institution_id}::${yearName}`;
      seatMap.set(key, (seatMap.get(key) || 0) + seat.sanctioned_intake);
    }

    // Build enrollment map. The year-label derivation below is UNCHANGED —
    // see NAACEnrolmentSourceStatus for why it cannot match production labels
    // and why that is reported rather than silently redefined here.
    const yearNames = new Set(years);
    const enrollMap = new Map<string, number>();
    const enrolledRows = (enrolledError ? [] : enrolledData || []) as {
      institution_id: string;
      updated_at: string;
    }[];
    let leadsMatchedToYear = 0;
    for (const lead of enrolledRows) {
      const date = new Date(lead.updated_at);
      const year = date.getMonth() >= 5 // June onwards = new academic year
        ? `${date.getFullYear()}-${(date.getFullYear() + 1).toString().slice(2)}`
        : `${date.getFullYear() - 1}-${date.getFullYear().toString().slice(2)}`;
      if (yearNames.has(year)) leadsMatchedToYear += 1;
      const key = `${lead.institution_id}::${year}`;
      enrollMap.set(key, (enrollMap.get(key) || 0) + 1);
    }

    // A column that matched nothing is not measuring zero admissions — it is
    // measuring nothing. Publish null and say so, rather than exporting a 0%
    // fill rate against a real sanctioned intake.
    const enrolmentSource: NAACEnrolmentSourceStatus = {
      table: 'admission_leads',
      funnelStage: 'enrolled',
      ok: !enrolledError,
      error: enrolledError ? enrolledError.message ?? String(enrolledError) : null,
      leadsRead: enrolledRows.length,
      leadsMatchedToYear,
      usable: !enrolledError && enrolledRows.length > 0 && leadsMatchedToYear > 0,
    };

    // Build report rows
    const rows: NAACEnrollmentRow[] = [];
    for (const inst of institutions) {
      for (const year of years) {
        const key = `${inst.id}::${year}`;
        const seats = seatMap.has(key) ? (seatMap.get(key) as number) : null;
        const enrolled = enrolmentSource.usable ? enrollMap.get(key) || 0 : null;
        rows.push({
          institution_name: inst.name,
          academic_year: year,
          sanctioned_intake: seats,
          students_admitted: enrolled,
          enrollment_percentage: seats !== null && seats > 0 && enrolled !== null
            ? Math.round((enrolled / seats) * 10000) / 100
            : null,
        });
      }
    }

    // Calculate averages per institution, over the rows that have a stateable
    // percentage only. Averaging an unknown year in as 0 would drag every
    // college's published fill rate towards zero.
    const avgMap = new Map<string, { name: string; sum: number; count: number }>();
    for (const row of rows) {
      const existing = avgMap.get(row.institution_name) || {
        name: row.institution_name,
        sum: 0,
        count: 0,
      };
      if (row.enrollment_percentage !== null) {
        existing.sum += row.enrollment_percentage;
        existing.count += 1;
      }
      avgMap.set(row.institution_name, existing);
    }

    const averages = Array.from(avgMap.values()).map((v) => ({
      institution_name: v.name,
      avg_enrollment_percentage:
        v.count > 0 ? Math.round((v.sum / v.count) * 100) / 100 : null,
    }));

    const seatSource: NAACSeatSourceStatus = {
      table: 'intake_history',
      ok: !seatError,
      error: seatError ? seatError.message ?? String(seatError) : null,
      rowsWithIntake: rows.filter((r) => r.sanctioned_intake !== null).length,
      totalRows: rows.length,
    };

    return { rows, averages, seatSource, enrolmentSource };
  }

  /**
   * Emit fan-out evidence rows for enrollment data (PR-A3).
   * Called on-demand when a NAAC/NIRF report is finalized to record that the
   * enrollment snapshot was generated. Emits to quality_evidence_mappings:
   *   - NAAC 8.1.1 (Student enrolment vs sanctioned intake, Binary framework)
   *   - NIRF TLR_SS (Teaching: Student Strength)
   * Same source_id semantics as PR-A5 (polymorphic — source_table is the
   * academic_years row or snapshot identifier).
   *
   * Idempotent via UNIQUE constraint quality_evidence_mappings_source_scope_key.
   * LIVE TODAY that key is five columns — (source_table, source_id, body_code,
   * metric_code, programme_id). Migration 20260809101400 adds institution_id,
   * and is not applied anywhere yet, which is why this still carries a
   * six-column fallback. Do not delete either target on the strength of this
   * comment; check the live constraint first.
   *
   * `conflictTarget` reports which key this call actually landed on — 'legacy'
   * for the five-column key, 'scoped' once 20260809101400 is applied. Returned
   * rather than logged because this service runs on the browser client.
   */
  static async emitEnrollmentEvidence(
    institutionId: string,
    academicYearId: string,
  ): Promise<{ evidenceRowsCreated: number; conflictTarget: 'scoped' | 'legacy' }> {
    const evidenceRows = [
      {
        source_table: 'academic_years',
        source_id: academicYearId,
        institution_id: institutionId,
        body_code: 'NAAC',
        metric_code: '8.1.1',
        is_auto: false,
        metadata: { source: 'admission-accreditation-report-service', metric_name: 'Student enrolment vs sanctioned intake' },
      },
      {
        source_table: 'academic_years',
        source_id: academicYearId,
        institution_id: institutionId,
        body_code: 'NIRF',
        metric_code: 'TLR_SS',
        is_auto: false,
        metadata: { source: 'admission-accreditation-report-service', metric_name: 'Teaching: Student Strength' },
      },
    ];

    // The conflict target must match quality_evidence_mappings_source_scope_key
    // EXACTLY or Postgres raises 42P10. institution_id joins that key in
    // migration 20260809101400, which is unapplied everywhere — so the LIVE
    // five-column key is tried first and six is the fallback. Leading with six
    // would put a guaranteed 42P10 plus a retry on every report generation, and
    // this service runs against the browser client, so that error would surface
    // as a 400 in the user's network tab and in error monitoring. Flip the order
    // (or delete the fallback) when 20260809101400 is applied.
    const upsert = (onConflict: string) =>
      (this.supabase as any)
        .from('quality_evidence_mappings')
        .upsert(evidenceRows, { onConflict, ignoreDuplicates: true })
        .select();

    // Which key was used is RETURNED, not console.warn'd. This service uses the
    // browser client, so a console warning fires in the end user's tab where no
    // operator or log aggregator will ever see it — the caller can surface or
    // record this instead.
    let conflictTarget: 'scoped' | 'legacy' = 'legacy';
    let { data, error } = await upsert(EVIDENCE_CONFLICT_TARGET_LEGACY);
    if (error?.code === '42P10') {
      conflictTarget = 'scoped';
      ({ data, error } = await upsert(EVIDENCE_CONFLICT_TARGET));
    }

    if (error) {
      console.error('[admission/accreditation] emitEnrollmentEvidence failed:', error);
      throw error;
    }

    return { evidenceRowsCreated: (data ?? []).length, conflictTarget };
  }
}

/**
 * @deprecated since PR-A3 (2026-04-17). Use AdmissionAccreditationReportService.
 * Will be removed in a follow-up cleanup PR.
 */
export const NAACReportService = AdmissionAccreditationReportService;
