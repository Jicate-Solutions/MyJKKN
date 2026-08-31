/**
 * The HR academic year.
 *
 * Deliberately NOT the same thing as `AcademicYear` in types/academics.ts:
 *
 *   - academic_years is scoped per institution, so '2026-2027' exists 11 times
 *     with 11 different ids. HR is keyed on hr_organization_id and needed a
 *     dimension it could compare across institutions, which is why the balance
 *     analytics RPC used to match on the year NAME.
 *   - academic_years runs Jun 1 -> Mar 31 (10 months), leaving April and May
 *     outside every year. hr_academic_years runs Jun 1 -> May 31 -- a full
 *     12 months, so no day of the calendar falls outside an HR year.
 *
 * One row per year for all of JKKN HR. Active rows can never overlap
 * (hr_academic_years_no_overlap), so a date resolves to exactly one year.
 */

export interface HRAcademicYear {
  id: string;
  /** e.g. '2026-2027'. Unique across the table. */
  year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHRAcademicYearDto {
  year_name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  notes?: string | null;
}

export type UpdateHRAcademicYearDto = Partial<CreateHRAcademicYearDto>;

export interface HRAcademicYearFilters {
  search?: string;
  isActive?: boolean;
}

/** A year plus the reference counts that decide whether it can be deleted. */
export interface HRAcademicYearWithUsage extends HRAcademicYear {
  balance_count: number;
  application_count: number;
}

/**
 * Derive the Jun 1 -> May 31 window from a year name, so the form can prefill
 * dates the moment a name like '2027-2028' is typed. Returns null for anything
 * that is not `YYYY-YYYY` with consecutive years.
 */
export function deriveHRYearDates(
  yearName: string
): { start_date: string; end_date: string } | null {
  const match = /^(\d{4})-(\d{4})$/.exec(yearName.trim());
  if (!match) return null;

  const from = Number(match[1]);
  const to = Number(match[2]);
  if (to !== from + 1) return null;

  return { start_date: `${from}-06-01`, end_date: `${to}-05-31` };
}
