import { BaseService } from '@/lib/services/base-service';
import type {
  BillingReportFilters,
  StudentYearBreakdown,
} from '@/types/billing-schedule';

/**
 * Year-wise student counts and amounts for the /billing/reports dashboard.
 *
 * The dashboard RPC returns only grand totals, so this is the one extra query
 * the "Students by Year of Study" cards need. Kept client-side on purpose: no
 * migration to apply, so it works locally the moment the page loads.
 *
 * Honours the institution, academic year and date filters already on the page.
 */

/** Backstop on total work — 40 pages of 1000 rows. */
const MAX_PAGES = 40;

export class StudentYearBreakdownService extends BaseService {
  /** Year of study per semester id, from semester_order (semester_name is free
   *  text — 'III', 'Sem 3' and 'Third' all occur, so it cannot be bucketed).
   *  Year N covers orders 2N-1 and 2N. Freshers carries order 0 and is the
   *  default semester for new admissions, so it counts as 1st year. */
  private static async yearBySemester(institutionId?: string) {
    let q = this.supabase.from('semesters').select('id, semester_order, semester_name');
    if (institutionId) q = q.eq('institution_id', institutionId);

    const { data, error } = await q;
    if (error) throw error;

    const map = new Map<string, number | null>();
    for (const s of data || []) {
      const order = Number(s.semester_order);
      const isFreshers =
        order === 0 || (s.semester_name || '').trim().toLowerCase() === 'freshers';
      map.set(
        s.id,
        isFreshers ? 1 : Number.isFinite(order) && order > 0 ? Math.ceil(order / 2) : null
      );
    }
    return map;
  }

  static async getBreakdown(
    filters: BillingReportFilters = {}
  ): Promise<StudentYearBreakdown[]> {
    const bills = (withCount: boolean) => {
      let q = this.supabase
        .from('billing_student_bills')
        .select(
          'student_id, final_amount, balance_amount, status, student:learners_profiles(semester_id)',
          withCount ? { count: 'exact' } : undefined
        );
      if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
      if (filters.academic_year_id) q = q.eq('academic_year_id', filters.academic_year_id);
      if (filters.date_from) q = q.gte('created_at', filters.date_from);
      if (filters.date_to) q = q.lte('created_at', `${filters.date_to}T23:59:59.999Z`);
      return q;
    };

    const [years, rows] = await Promise.all([
      this.yearBySemester(filters.institution_id),
      // Paged: an unbounded select stops at the server's max-rows (1000) with
      // no error, so a plain select WOULD silently under-report.
      //
      // Sequential, and only the first page asks for a count. RLS on
      // billing_student_bills runs through user_has_permission(), so every
      // count: 'exact' is a full scan under that policy — firing one per page
      // concurrently put ~11 of them on the server at once on page load.
      (async () => {
        const size = 1000;
        const out: any[] = [];

        for (let page = 0; page < MAX_PAGES; page++) {
          const q = page === 0 ? bills(true) : bills(false);
          const { data, error } = await q.range(page * size, page * size + size - 1);
          if (error) throw error;

          const batch = data || [];
          out.push(...batch);
          // A short page is the last page — no count needed to know that.
          if (batch.length < size) return out;
        }

        console.warn(
          `[StudentYearBreakdown] stopped at ${MAX_PAGES * size} bills; narrow the filters for exact figures.`
        );
        return out;
      })(),
    ]);

    const buckets = new Map<number | null, StudentYearBreakdown & { seen: Set<string> }>();

    for (const row of rows) {
      // A to-one embed is an object, but some PostgREST versions return a
      // single-element array — accept both.
      const student = Array.isArray(row.student) ? row.student[0] : row.student;
      const year = student?.semester_id ? years.get(student.semester_id) ?? null : null;

      let b = buckets.get(year);
      if (!b) {
        b = {
          year,
          student_count: 0,
          amount_billed: 0,
          amount_collected: 0,
          outstanding: 0,
          seen: new Set(),
        };
        buckets.set(year, b);
      }

      if (row.student_id) b.seen.add(row.student_id);

      const billed = Number(row.final_amount) || 0;
      const balance = Number(row.balance_amount) || 0;
      b.amount_billed += billed;
      // No paid_amount on bills — what has been paid is billed less the balance.
      b.amount_collected += Math.max(0, billed - balance);
      if (['unpaid', 'partially_paid', 'overdue'].includes(row.status)) {
        b.outstanding += balance;
      }
    }

    return Array.from(buckets.values())
      .map(({ seen, ...b }) => ({ ...b, student_count: seen.size }))
      // Real years ascending, "Year Not Set" last.
      .sort((a, b) =>
        a.year === null ? 1 : b.year === null ? -1 : a.year - b.year
      );
  }
}
