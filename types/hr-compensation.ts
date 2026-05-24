/**
 * HR Compensation Analytics — C3 types.
 *
 * Pay-band analysis and equity audits. Queries existing tables:
 * hr_payroll_periods, hr_payslips, staff, hr_staff_details.
 */

// =====================================================================================
// Pay bands
// =====================================================================================

export type PayBandLabel =
  | '0-20k'
  | '20k-40k'
  | '40k-60k'
  | '60k-80k'
  | '80k+';

export interface PayBandSummary {
  band: PayBandLabel;
  count: number;
  avg_gross: number;
  min: number;
  max: number;
}

// =====================================================================================
// Institution comparison
// =====================================================================================

export interface InstitutionCompensation {
  institution_id: string;
  institution_name: string;
  staff_count: number;
  avg_gross: number;
  median_gross: number;
  total_payroll: number;
}

// =====================================================================================
// Top earners (anonymized — role + department, no names per decision #6)
// =====================================================================================

export interface AnonymizedEarner {
  rank: number;
  role: string;
  department: string;
  institution_name: string;
  gross_salary: number;
}

// =====================================================================================
// Filters + payload
// =====================================================================================

export interface CompensationFilters {
  institution_id?: string;
  period_year?: number;
  period_month?: number;
}

export interface CompensationPayload {
  total_payroll_cost: number;
  avg_salary: number;
  median_salary: number;
  pay_equity_ratio: number; // max / min avg across pay bands (rough equity measure)
  staff_count: number;
  pay_bands: PayBandSummary[];
  institution_comparison: InstitutionCompensation[];
  top_earners: AnonymizedEarner[];
  bottom_earners: AnonymizedEarner[];
  generated_at: string;
}
