/**
 * Employee Salary Service (2026-08-21)
 *
 * Substrate: 20260821191000_hr_staff_salaries.sql
 *            20260821201000_fn_hr_set_staff_salary.sql
 *            20260821211000_hr_staff_salaries_superseded_by_deferrable.sql
 *
 * WHAT EACH PERSON EARNS. Separate from StaffPayrollService, which records WHO
 * PAYS them: seeing the payer and seeing the amount are different decisions,
 * and hr.payroll.salary.* is granted separately from hr.payroll.institution.*
 * for exactly that reason.
 *
 * READS RETURN THE SALARY IN FORCE ONLY — `superseded_by IS NULL`. History is
 * never deleted (a generated payslip has to stay explicable against the figure
 * that produced it), so without that filter a person who has had two raises
 * would appear three times.
 *
 * A CALLER WITHOUT THE KEY GETS ZERO ROWS, NOT AN ERROR. hr_staff_salaries_select
 * also lets anyone read their OWN salary, so "one row came back" does not imply
 * "this user is HR" — the page still gates on the permission before rendering
 * the directory.
 *
 * Static class, SupabaseClient passed in — same convention as
 * StaffPayrollService and PayrollPeriodsService.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';

/** One salary in force, joined to the person and the organisation paying it. */
export interface StaffSalaryRow {
  id: string;
  staff_uuid: string;
  staff_code: string | null;
  person_name: string;
  is_active: boolean;
  payer_org_id: string;
  payer_org_name: string | null;
  salary_structure: string;
  monthly_gross: number;
  annual_gross: number;
  overtime_level: string;
  overtime_amount: number;
  eligible_for_pf: boolean;
  exempt_edli: boolean;
  eligible_for_insurance: boolean;
  eligible_for_gratuity: boolean;
  eligible_for_etf: boolean;
  /** Monthly EPF contribution in rupees. 0 whenever eligible_for_pf is false. */
  epf_amount: number;
  eligible_for_esi: boolean;
  esi_amount: number;
  /** Paid on top of the gross. Never part of the TDS base. */
  allowance_amount: number;
  allowance_label: string | null;
  /**
   * NULLABLE, and usually null: 369 of the 433 salaries in force carry no
   * effective date, because the bulk import that created them had a blank
   * Effective_Date on every row.
   *
   * This was typed `string` until 2026-09-02, which was simply false. With
   * strictNullChecks off the compiler never questioned it, and the history
   * sheet crashed on `iso.split('-')` for 85% of staff the first time anyone
   * opened it. Every consumer must handle null.
   */
  effective_from: string | null;
  notes: string | null;
  updated_at: string;
}

/**
 * The embeds name their foreign key explicitly. hr_staff_salaries carries a
 * third FK back to ITSELF (superseded_by), and while a self-reference does not
 * make a `staff` or `hr_organizations` embed ambiguous today, spelling the
 * constraint out costs nothing and survives a second FK being added later —
 * which is the failure that takes down every embed on a table at once.
 */
const SELECT_CURRENT = `
  id,
  staff_id,
  hr_organization_id,
  salary_structure,
  monthly_gross,
  annual_gross,
  overtime_level,
  overtime_amount,
  eligible_for_pf,
  exempt_edli,
  eligible_for_insurance,
  eligible_for_gratuity,
  eligible_for_etf,
  epf_amount,
  eligible_for_esi,
  esi_amount,
  allowance_amount,
  allowance_label,
  effective_from,
  notes,
  updated_at,
  staff:staff!hr_staff_salaries_staff_id_fkey (
    id, staff_id, first_name, last_name, is_active
  ),
  payer:hr_organizations!hr_staff_salaries_hr_organization_id_fkey ( id, name )
`;

interface RawSalaryRow {
  id: string;
  staff_id: string;
  hr_organization_id: string;
  salary_structure: string;
  monthly_gross: number | string;
  annual_gross: number | string;
  overtime_level: string;
  overtime_amount: number | string;
  eligible_for_pf: boolean;
  exempt_edli: boolean;
  eligible_for_insurance: boolean;
  eligible_for_gratuity: boolean;
  eligible_for_etf: boolean;
  epf_amount: number | string;
  eligible_for_esi: boolean;
  esi_amount: number | string;
  allowance_amount: number | string;
  allowance_label: string | null;
  effective_from: string | null;
  notes: string | null;
  updated_at: string;
  staff: {
    id: string;
    staff_id: string | null;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean | null;
  } | null;
  payer: { id: string; name: string | null } | null;
}

/** numeric(12,2) arrives from PostgREST as a STRING, so every amount is coerced. */
function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

function shape(r: RawSalaryRow): StaffSalaryRow {
  const name = [r.staff?.first_name, r.staff?.last_name].filter(Boolean).join(' ').trim();
  return {
    id: r.id,
    staff_uuid: r.staff_id,
    staff_code: r.staff?.staff_id ?? null,
    person_name: name || '(unnamed)',
    is_active: r.staff?.is_active !== false,
    payer_org_id: r.hr_organization_id,
    payer_org_name: r.payer?.name ?? null,
    salary_structure: r.salary_structure,
    monthly_gross: toNumber(r.monthly_gross),
    annual_gross: toNumber(r.annual_gross),
    overtime_level: r.overtime_level,
    overtime_amount: toNumber(r.overtime_amount),
    eligible_for_pf: r.eligible_for_pf,
    exempt_edli: r.exempt_edli,
    eligible_for_insurance: r.eligible_for_insurance,
    eligible_for_gratuity: r.eligible_for_gratuity,
    eligible_for_etf: r.eligible_for_etf,
    epf_amount: toNumber(r.epf_amount),
    eligible_for_esi: r.eligible_for_esi,
    esi_amount: toNumber(r.esi_amount),
    allowance_amount: toNumber(r.allowance_amount),
    allowance_label: r.allowance_label ?? null,
    effective_from: r.effective_from,
    notes: r.notes,
    updated_at: r.updated_at,
  };
}

/**
 * One person on the roster, with their salary if one has been recorded.
 *
 * `salary_id === null` is the interesting state, not an edge case: it means
 * nobody has set this person's pay yet, which is the queue the screen exists to
 * work through.
 */
export interface StaffSalaryDirectoryRow {
  staff_uuid: string;
  staff_code: string | null;
  person_name: string;
  role_title: string | null;
  is_active: boolean;
  works_at_id: string;
  works_at_name: string;
  payer_org_id: string | null;
  payer_org_name: string | null;
  salary_id: string | null;
  salary_structure: string | null;
  monthly_gross: number | null;
  annual_gross: number | null;
  overtime_level: string | null;
  overtime_amount: number | null;
  eligible_for_pf: boolean;
  exempt_edli: boolean;
  eligible_for_insurance: boolean;
  eligible_for_gratuity: boolean;
  eligible_for_etf: boolean;
  /**
   * Null when this person has no salary row at all — the same distinction the
   * other money fields carry here. Zero means "recorded, and it is nothing".
   */
  epf_amount: number | null;
  eligible_for_esi: boolean;
  esi_amount: number | null;
  allowance_amount: number | null;
  allowance_label: string | null;
  effective_from: string | null;
  notes: string | null;
}

export class StaffSalaryService {
  /**
   * The whole roster, salaried or not.
   *
   * Goes through hr_staff_salary_directory() rather than reading the table:
   * PostgREST cannot express "staff with no matching salary" in one request, and
   * the RPC RAISES for a caller without hr.payroll.salary.view instead of
   * returning [] — so an empty list here genuinely means "no staff in scope",
   * never "you are not allowed to see this".
   */
  static async listDirectory(
    supabase: SupabaseClient
  ): Promise<StaffSalaryDirectoryRow[]> {
    const { data, error } = await (supabase as any).rpc('hr_staff_salary_directory');

    if (error) {
      throw new Error(`Failed to load the salary directory: ${getErrorMessage(error)}`);
    }

    // numeric(12,2) arrives as a string over PostgREST; null stays null so the
    // UI can tell "earns nothing recorded" from "earns zero".
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      monthly_gross: r.monthly_gross === null ? null : Number(r.monthly_gross),
      annual_gross: r.annual_gross === null ? null : Number(r.annual_gross),
      overtime_amount: r.overtime_amount === null ? null : Number(r.overtime_amount),
      epf_amount: r.epf_amount === null ? null : Number(r.epf_amount),
      esi_amount: r.esi_amount === null ? null : Number(r.esi_amount),
      allowance_amount: r.allowance_amount === null ? null : Number(r.allowance_amount),
    })) as StaffSalaryDirectoryRow[];
  }

  /**
   * Every salary currently in force.
   *
   * A LEFT join on staff, deliberately. `!inner` would be the natural reading of
   * "a salary always has a person", but it turns any row whose staff record was
   * soft-removed into a silent disappearance — and a salary with no visible
   * owner is precisely the row someone needs to find.
   */
  static async listCurrent(supabase: SupabaseClient): Promise<StaffSalaryRow[]> {
    const { data, error } = await (supabase as any)
      .from('hr_staff_salaries')
      .select(SELECT_CURRENT)
      .is('superseded_by', null)
      .order('effective_from', { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(`Failed to load employee salaries: ${getErrorMessage(error)}`);
    }

    return ((data ?? []) as RawSalaryRow[]).map(shape);
  }

  /**
   * Every salary this person has ever held, newest first — the supersede chain
   * read back. Used by the history sheet so a past payslip can be reconciled
   * against the figure that was in force when it ran.
   */
  static async listHistory(
    supabase: SupabaseClient,
    staffUuid: string
  ): Promise<StaffSalaryRow[]> {
    const { data, error } = await (supabase as any)
      .from('hr_staff_salaries')
      .select(SELECT_CURRENT)
      .eq('staff_id', staffUuid)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load salary history: ${getErrorMessage(error)}`);
    }

    return ((data ?? []) as RawSalaryRow[]).map(shape);
  }

  /**
   * Record a salary, superseding whatever was in force.
   *
   * Goes through the RPC rather than an insert + update pair: the partial unique
   * index on (staff_id) WHERE superseded_by IS NULL cannot be satisfied by two
   * separate PostgREST calls in either order. See the migration header.
   */
  static async setSalary(
    supabase: SupabaseClient,
    input: {
      staffId: string;
      hrOrganizationId: string;
      monthlyGross: number;
      effectiveFrom: string;
      salaryStructure?: string;
      overtimeLevel?: string;
      overtimeAmount?: number;
      eligibleForPf?: boolean;
      exemptEdli?: boolean;
      eligibleForInsurance?: boolean;
      eligibleForGratuity?: boolean;
      eligibleForEtf?: boolean;
      /** Ignored by the RPC unless eligibleForPf is true — it zeroes it there. */
      epfAmount?: number;
      eligibleForEsi?: boolean;
      esiAmount?: number;
      allowanceAmount?: number;
      /** Discarded by the RPC when the amount is zero - a label with no money behind it. */
      allowanceLabel?: string | null;
      notes?: string | null;
    }
  ): Promise<string> {
    const { data, error } = await (supabase as any).rpc('fn_hr_set_staff_salary', {
      p_staff_id: input.staffId,
      p_hr_organization_id: input.hrOrganizationId,
      p_monthly_gross: input.monthlyGross,
      p_effective_from: input.effectiveFrom,
      p_salary_structure: input.salaryStructure ?? 'Monthly',
      p_overtime_level: input.overtimeLevel ?? 'No overtime',
      p_overtime_amount: input.overtimeAmount ?? 0,
      p_eligible_for_pf: input.eligibleForPf ?? false,
      p_exempt_edli: input.exemptEdli ?? false,
      p_eligible_for_insurance: input.eligibleForInsurance ?? false,
      p_eligible_for_gratuity: input.eligibleForGratuity ?? false,
      p_eligible_for_etf: input.eligibleForEtf ?? false,
      p_notes: input.notes ?? null,
      p_epf_amount: input.epfAmount ?? 0,
      p_eligible_for_esi: input.eligibleForEsi ?? false,
      p_esi_amount: input.esiAmount ?? 0,
      p_allowance_amount: input.allowanceAmount ?? 0,
      p_allowance_label: input.allowanceLabel ?? null,
    });

    if (error) {
      throw new Error(`Failed to save the salary: ${getErrorMessage(error)}`);
    }

    return data as string;
  }
}
