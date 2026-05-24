/**
 * HR Compensation Analytics Service — C3.
 *
 * Pay-band analysis and equity audits from existing payroll tables:
 *   - hr_payslips (gross_salary per staff per period)
 *   - hr_payroll_periods (period lookup)
 *   - staff + hr_staff_details (role, department, institution)
 *
 * All queries use RLS — super_admin sees cross-institution, others see own.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompensationPayload,
  CompensationFilters,
  PayBandSummary,
  PayBandLabel,
  InstitutionCompensation,
  AnonymizedEarner,
} from '@/types/hr-compensation';

// =====================================================================================
// Helpers
// =====================================================================================

function classifyBand(gross: number): PayBandLabel {
  if (gross < 20000) return '0-20k';
  if (gross < 40000) return '20k-40k';
  if (gross < 60000) return '40k-60k';
  if (gross < 80000) return '60k-80k';
  return '80k+';
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// =====================================================================================
// Service
// =====================================================================================

export class CompensationService {
  /**
   * Main entry point — returns the full compensation analytics payload.
   */
  static async getCompensationAnalytics(
    supabase: SupabaseClient,
    filters: CompensationFilters = {}
  ): Promise<CompensationPayload> {
    // Find the latest payroll period to use as default
    const { periodYear, periodMonth } = await this.resolvePeriod(
      supabase,
      filters
    );

    // Get all payslips for the resolved period
    const payslips = await this.getPayslips(
      supabase,
      periodYear,
      periodMonth,
      filters.institution_id
    );

    if (payslips.length === 0) {
      return {
        total_payroll_cost: 0,
        avg_salary: 0,
        median_salary: 0,
        pay_equity_ratio: 0,
        staff_count: 0,
        pay_bands: [],
        institution_comparison: [],
        top_earners: [],
        bottom_earners: [],
        generated_at: new Date().toISOString(),
      };
    }

    const grossValues = payslips.map((p) => p.gross);
    const totalPayroll = grossValues.reduce((a, b) => a + b, 0);
    const avgSalary = Math.round(totalPayroll / grossValues.length);
    const medianSalary = median(grossValues);

    // Pay bands
    const payBands = this.computePayBands(payslips);

    // Pay equity ratio
    const bandAvgs = payBands
      .filter((b) => b.count > 0)
      .map((b) => b.avg_gross);
    const payEquityRatio =
      bandAvgs.length >= 2
        ? Math.round((Math.max(...bandAvgs) / Math.min(...bandAvgs)) * 100) /
          100
        : 1;

    // Institution comparison
    const institutionComparison = this.computeInstitutionComparison(payslips);

    // Top/bottom earners (anonymized)
    const sorted = [...payslips].sort((a, b) => b.gross - a.gross);
    const topEarners = sorted.slice(0, 10).map((p, i) => ({
      rank: i + 1,
      role: p.role,
      department: p.department,
      institution_name: p.institution_name,
      gross_salary: p.gross,
    }));
    const bottomEarners = sorted
      .slice(-10)
      .reverse()
      .map((p, i) => ({
        rank: i + 1,
        role: p.role,
        department: p.department,
        institution_name: p.institution_name,
        gross_salary: p.gross,
      }));

    return {
      total_payroll_cost: totalPayroll,
      avg_salary: avgSalary,
      median_salary: medianSalary,
      pay_equity_ratio: payEquityRatio,
      staff_count: payslips.length,
      pay_bands: payBands,
      institution_comparison: institutionComparison,
      top_earners: topEarners,
      bottom_earners: bottomEarners,
      generated_at: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Resolve period
  // ---------------------------------------------------------------------------

  private static async resolvePeriod(
    supabase: SupabaseClient,
    filters: CompensationFilters
  ): Promise<{ periodYear: number; periodMonth: number }> {
    if (filters.period_year && filters.period_month) {
      return {
        periodYear: filters.period_year,
        periodMonth: filters.period_month,
      };
    }

    // Find latest distributed/locked period
    const { data } = await supabase
      .from('hr_payroll_periods')
      .select('period_year, period_month')
      .in('status', ['distributed', 'locked'])
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        periodYear: data.period_year,
        periodMonth: data.period_month,
      };
    }

    // Fallback to current month
    const now = new Date();
    return { periodYear: now.getFullYear(), periodMonth: now.getMonth() + 1 };
  }

  // ---------------------------------------------------------------------------
  // Get payslips with staff details
  // ---------------------------------------------------------------------------

  private static async getPayslips(
    supabase: SupabaseClient,
    year: number,
    month: number,
    institutionId?: string
  ): Promise<
    {
      gross: number;
      role: string;
      department: string;
      institution_name: string;
      institution_id: string;
    }[]
  > {
    // First get period IDs for the year/month
    let periodQuery = supabase
      .from('hr_payroll_periods')
      .select('id')
      .eq('period_year', year)
      .eq('period_month', month);

    if (institutionId) {
      periodQuery = periodQuery.eq('institution_id', institutionId);
    }

    const { data: periods, error: periodErr } = await periodQuery;
    if (periodErr) throw periodErr;
    if (!periods || periods.length === 0) return [];

    const periodIds = periods.map((p) => p.id);

    // Get payslips for those periods
    const { data: slips, error: slipErr } = await supabase
      .from('hr_payslips')
      .select(
        `
        gross_salary,
        staff!inner(
          institution_id,
          institutions!inner(name),
          hr_staff_details(department, designation)
        )
      `
      )
      .in('payroll_period_id', periodIds);

    if (slipErr) throw slipErr;

    return (slips ?? []).map((s: any) => ({
      gross: (s.gross_salary as number) ?? 0,
      role: s.staff?.hr_staff_details?.[0]?.designation ?? 'Unknown',
      department: s.staff?.hr_staff_details?.[0]?.department ?? 'Unassigned',
      institution_name: s.staff?.institutions?.name ?? 'Unknown',
      institution_id: s.staff?.institution_id ?? '',
    }));
  }

  // ---------------------------------------------------------------------------
  // Pay bands
  // ---------------------------------------------------------------------------

  private static computePayBands(
    payslips: { gross: number }[]
  ): PayBandSummary[] {
    const bands = new Map<
      PayBandLabel,
      { count: number; sum: number; min: number; max: number }
    >();

    const allBands: PayBandLabel[] = [
      '0-20k',
      '20k-40k',
      '40k-60k',
      '60k-80k',
      '80k+',
    ];
    for (const b of allBands) {
      bands.set(b, { count: 0, sum: 0, min: Infinity, max: -Infinity });
    }

    for (const p of payslips) {
      const band = classifyBand(p.gross);
      const entry = bands.get(band)!;
      entry.count++;
      entry.sum += p.gross;
      entry.min = Math.min(entry.min, p.gross);
      entry.max = Math.max(entry.max, p.gross);
    }

    return allBands.map((band) => {
      const entry = bands.get(band)!;
      return {
        band,
        count: entry.count,
        avg_gross:
          entry.count > 0 ? Math.round(entry.sum / entry.count) : 0,
        min: entry.count > 0 ? entry.min : 0,
        max: entry.count > 0 ? entry.max : 0,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Institution comparison
  // ---------------------------------------------------------------------------

  private static computeInstitutionComparison(
    payslips: {
      gross: number;
      institution_id: string;
      institution_name: string;
    }[]
  ): InstitutionCompensation[] {
    const map = new Map<
      string,
      { name: string; grosses: number[] }
    >();

    for (const p of payslips) {
      if (!map.has(p.institution_id)) {
        map.set(p.institution_id, {
          name: p.institution_name,
          grosses: [],
        });
      }
      map.get(p.institution_id)!.grosses.push(p.gross);
    }

    return Array.from(map.entries())
      .map(([institution_id, v]) => {
        const total = v.grosses.reduce((a, b) => a + b, 0);
        return {
          institution_id,
          institution_name: v.name,
          staff_count: v.grosses.length,
          avg_gross: Math.round(total / v.grosses.length),
          median_gross: median(v.grosses),
          total_payroll: total,
        };
      })
      .sort((a, b) => b.avg_gross - a.avg_gross);
  }
}
