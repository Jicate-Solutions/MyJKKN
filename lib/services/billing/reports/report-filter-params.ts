// Pure mapping from the UI filter object to RPC parameters.
// Kept separate from the service so it can be unit-tested without a Supabase double.
import type {
  BillingReportFilters,
  ReportSchemeKey,
  AccommodationCode,
} from '@/types/billing-schedule';

/**
 * Sentinel for "bills with no academic_year_id".
 *
 * This was 55% of billing_student_bills when the filter was designed. A
 * concurrent backfill (b1fcd3324) stamped 4,905 bills and a BEFORE INSERT
 * trigger (9195ce9ab) now stamps every new one, so as of 2026-07-25 it is
 * 66 of 10,763 (0.6%). The option stays — those 66 are otherwise unreachable
 * once a specific year is chosen — but it is now an edge case, not a
 * data-quality escape hatch. Do not re-cite the 55% figure.
 */
export const ACADEMIC_YEAR_UNSPECIFIED = 'unspecified';

export interface ReportRpcScope {
  p_institution_ids: string[] | null;
  p_academic_year_id: string | null;
  p_academic_year_unspecified: boolean;
  p_item_category_id: string | null;
  p_degree_id: string | null;
  p_department_id: string | null;
  p_program_id: string | null;
  p_semester_id: string | null;
  p_section_id: string | null;
  p_schemes: ReportSchemeKey[] | null;
  p_accommodation_codes: AccommodationCode[] | null;
  p_student_id: string | null;
  p_date_from: string | null;
  p_date_to: string | null;
}

const nz = (v?: string): string | null => (v && v.length > 0 ? v : null);

export function buildReportScope(f: BillingReportFilters): ReportRpcScope {
  const unspecified = f.academic_year_id === ACADEMIC_YEAR_UNSPECIFIED;
  return {
    p_institution_ids: f.institution_id ? [f.institution_id] : null,
    p_academic_year_id: unspecified ? null : nz(f.academic_year_id),
    p_academic_year_unspecified: unspecified,
    p_item_category_id: nz(f.item_category_id),
    p_degree_id: nz(f.degree_id),
    p_department_id: nz(f.department_id),
    p_program_id: nz(f.program_id),
    p_semester_id: nz(f.semester_id),
    p_section_id: nz(f.section_id),
    p_schemes: f.schemes && f.schemes.length > 0 ? f.schemes : null,
    p_accommodation_codes: f.accommodation_codes && f.accommodation_codes.length > 0
      ? f.accommodation_codes : null,
    p_student_id: nz(f.student_id),
    p_date_from: nz(f.date_from),
    p_date_to: nz(f.date_to),
  };
}

export const REPORT_PAGE_SIZE = 50;

export function buildReportPage(page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;
  return { p_limit: pageSize, p_offset: (safePage - 1) * pageSize };
}

/** Export path: fetch the whole filtered set, not the visible page. RPCs cap at 10,000. */
export const EXPORT_PAGE = { p_limit: null, p_offset: 0 } as const;
