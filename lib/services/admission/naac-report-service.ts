// lib/services/admission/naac-report-service.ts
// NAAC Criteria 2.1.1 report generation from admission data

import { createClientSupabaseClient } from '@/lib/supabase/client';

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

export class NAACReportService {
  private static supabase = createClientSupabaseClient();

  /**
   * Generate NAAC Criteria 2.1.1 report
   * Average Enrollment Percentage — years sourced from academic_years table
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
}
