/**
 * Sort-column whitelist for the student-bill list query.
 *
 * `StudentBillFilters.sortBy` is a bare string that arrives from the data
 * table's column id — and, because the table persists its own state, from
 * storage as well as the URL. Those ids are UI-side names ('student_name',
 * 'institution_name', 'academic_year', …) and are NOT columns on
 * billing_student_bills, so handing one straight to PostgREST's `order=`
 * came back as HTTP 400 / SQLSTATE 42703 —
 * `column billing_student_bills.student_name does not exist`
 * (BUG-005360, BUG-003999: clicking the "Student" header broke the list).
 *
 * Everything a sort may produce is resolved here:
 *   • a real column on the bill row          → ordered as-is
 *   • a column on a to-one embedded resource → PostgREST's `alias(column)`
 *     order syntax, which sorts the PARENT rows (not the embed)
 *   • anything else                          → the default sort, never an
 *     invalid column
 */

/**
 * Every column that actually exists on public.billing_student_bills.
 * Mirrors the select lists in StudentBillService.getStudentBills; verified
 * against production (2026-09-12) by ordering on all 22 at once.
 */
export const BILL_SORT_COLUMNS = [
  'id',
  'student_id',
  'institution_id',
  'item_category_id',
  'bill_description',
  'due_date',
  'quantity',
  'unit_amount',
  'total_amount',
  'tax_amount',
  'final_amount',
  'status',
  'payment_date',
  'balance_amount',
  'remarks',
  'is_recurring',
  'recurrence_pattern',
  'number_of_recurrences',
  'created_by',
  'created_at',
  'updated_at',
  'academic_year_id'
] as const;

export type BillSortColumn = (typeof BILL_SORT_COLUMNS)[number];

/** The list's existing default sort — also the fallback for anything unknown. */
export const DEFAULT_BILL_SORT: BillSortColumn = 'created_at';

const BILL_SORT_COLUMN_SET: ReadonlySet<string> = new Set(BILL_SORT_COLUMNS);

/**
 * Sort keys that name a column on an EMBEDDED resource instead of the bill.
 *
 * The values use PostgREST's "order by related table" syntax,
 * `order=alias(column).asc`, where the alias is the one the select string
 * gives the embed (student/institution/item_category/academic_year). All four
 * embeds are many-to-one, so ordering the parent by them is well defined, and
 * each path was verified against production (2026-09-12) on BOTH select
 * variants — the `learners_profiles!inner` one and the plain (left-joined)
 * one. The dotted form ('student.first_name') is NOT valid there: PostgREST
 * rejects it with PGRST100 "failed to parse order".
 *
 * Learner-name sorts get a (first_name, last_name) pair because the cell
 * renders "first last".
 */
/**
 * The select string's alias for the learners_profiles embed. It is a query
 * identifier fixed by StudentBillService's select, not user-facing copy.
 */
export const LEARNER_EMBED_ALIAS = 'student';

/** `alias(column)` order path on the learner embed. */
export const learnerSortPath = (column: string) =>
  `${LEARNER_EMBED_ALIAS}(${column})`;

const LEARNER_FIRST_LAST = [learnerSortPath('first_name'), learnerSortPath('last_name')];
const LEARNER_LAST_FIRST = [learnerSortPath('last_name'), learnerSortPath('first_name')];

const EMBEDDED_SORT_PATHS = new Map<string, readonly string[]>([
  // Learner name — the data table's column id, plus the variants the old
  // mapper accepted, so no caller regresses.
  ['student_name', LEARNER_FIRST_LAST],
  [LEARNER_EMBED_ALIAS, LEARNER_FIRST_LAST],
  [`${LEARNER_EMBED_ALIAS}.name`, LEARNER_FIRST_LAST],
  ['first_name', LEARNER_FIRST_LAST],
  [`${LEARNER_EMBED_ALIAS}.first_name`, LEARNER_FIRST_LAST],
  ['last_name', LEARNER_LAST_FIRST],
  [`${LEARNER_EMBED_ALIAS}.last_name`, LEARNER_LAST_FIRST],
  // Other sortable table columns that live on an embed, not on the bill.
  ['lifecycle_status', [learnerSortPath('lifecycle_status')]],
  ['institution_name', ['institution(name)']],
  ['institution.name', ['institution(name)']],
  ['item_category_category_name', ['item_category(category_name)']],
  ['item_category.category_name', ['item_category(category_name)']],
  ['academic_year', ['academic_year(academic_year_name)']]
]);

/**
 * Resolve a requested sort into the order path(s) to hand `.order()`.
 *
 * Never returns anything that is not a real bill column or a verified
 * embedded-resource path, so the query can no longer fail with 42703.
 * Multiple paths are applied in order (PostgREST accepts a comma-separated
 * order list, which supabase-js builds from repeated .order() calls).
 */
export function resolveBillSortPaths(sortBy?: string | null): string[] {
  const key = (sortBy ?? '').trim();
  if (!key) return [DEFAULT_BILL_SORT];

  const embedded = EMBEDDED_SORT_PATHS.get(key);
  if (embedded) return [...embedded];

  if (BILL_SORT_COLUMN_SET.has(key)) return [key];

  return [DEFAULT_BILL_SORT];
}
