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
  sanctioned_intake: number;
  students_admitted: number;
  enrollment_percentage: number;
}

export interface NAACReport {
  rows: NAACEnrollmentRow[];
  averages: {
    institution_name: string;
    avg_enrollment_percentage: number;
  }[];
}

export class AdmissionAccreditationReportService {
  private static supabase = createClientSupabaseClient();

  /**
   * Generate NAAC Metric 8.1.1 report (Binary framework)
   * Student enrolment vs sanctioned intake — years sourced from academic_years table
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
      return { rows: [], averages: [] };
    }

    const institutionIds = institutions.map((i) => i.id);

    // Fetch academic years from the academic_years table (dynamic, not hardcoded)
    const { data: academicYearsData, error: yearsError } = await (this.supabase as any)
      .from('academic_years')
      .select('academic_year_name')
      .in('institution_id', institutionIds)
      .order('start_date', { ascending: true });

    if (yearsError) {
      console.error('[admission/naac] Failed to fetch academic years:', yearsError);
      return { rows: [], averages: [] };
    }

    // Deduplicate year names (multiple institutions may share the same year label)
    const years: string[] = [
      ...new Set<string>(
        (academicYearsData || []).map(
          (y: { academic_year_name: string }) => y.academic_year_name
        )
      ),
    ];

    if (years.length === 0) {
      return { rows: [], averages: [] };
    }

    // Get seat configs for discovered years
    const { data: seatData } = await (this.supabase as any)
      .from('institution_seat_config')
      .select('institution_id, academic_year, total_seats')
      .in('institution_id', institutionIds)
      .in('academic_year', years);

    // Get enrolled counts from admission_leads
    // Since we can't easily filter by academic year from lead dates,
    // we'll get all enrolled leads and bucket by year
    const { data: enrolledData } = await (this.supabase as any)
      .from('admission_leads')
      .select('institution_id, updated_at')
      .in('institution_id', institutionIds)
      .eq('funnel_stage', 'enrolled');

    // Build seat map
    const seatMap = new Map<string, number>();
    for (const seat of (seatData || []) as { institution_id: string; academic_year: string; total_seats: number }[]) {
      const key = `${seat.institution_id}::${seat.academic_year}`;
      seatMap.set(key, (seatMap.get(key) || 0) + seat.total_seats);
    }

    // Build enrollment map
    const enrollMap = new Map<string, number>();
    for (const lead of (enrolledData || []) as { institution_id: string; updated_at: string }[]) {
      const date = new Date(lead.updated_at);
      const year = date.getMonth() >= 5 // June onwards = new academic year
        ? `${date.getFullYear()}-${(date.getFullYear() + 1).toString().slice(2)}`
        : `${date.getFullYear() - 1}-${date.getFullYear().toString().slice(2)}`;
      const key = `${lead.institution_id}::${year}`;
      enrollMap.set(key, (enrollMap.get(key) || 0) + 1);
    }

    // Build report rows
    const rows: NAACEnrollmentRow[] = [];
    for (const inst of institutions) {
      for (const year of years) {
        const key = `${inst.id}::${year}`;
        const seats = seatMap.get(key) || 0;
        const enrolled = enrollMap.get(key) || 0;
        rows.push({
          institution_name: inst.name,
          academic_year: year,
          sanctioned_intake: seats,
          students_admitted: enrolled,
          enrollment_percentage: seats > 0
            ? Math.round((enrolled / seats) * 10000) / 100
            : 0,
        });
      }
    }

    // Calculate averages per institution
    const avgMap = new Map<string, { name: string; sum: number; count: number }>();
    for (const row of rows) {
      const existing = avgMap.get(row.institution_name) || {
        name: row.institution_name,
        sum: 0,
        count: 0,
      };
      existing.sum += row.enrollment_percentage;
      existing.count += 1;
      avgMap.set(row.institution_name, existing);
    }

    const averages = Array.from(avgMap.values()).map((v) => ({
      institution_name: v.name,
      avg_enrollment_percentage:
        v.count > 0 ? Math.round((v.sum / v.count) * 100) / 100 : 0,
    }));

    return { rows, averages };
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
