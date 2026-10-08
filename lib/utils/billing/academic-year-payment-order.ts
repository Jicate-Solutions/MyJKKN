import { isBillLearnerVisible } from './learner-visibility';

/**
 * Online payment year order for the LEARNER-facing paths (My Bills, Parent
 * Portal): oldest academic year first. A bill cannot be paid online while any
 * bill of an OLDER academic year still has a balance — learners were paying
 * 2026-27 (and 2027-28) fees online with 2025-26 dues still open.
 *
 * - Years are ordered by the academic year's start year (academic_years
 *   .start_date); a bill with no academic year falls back to the Indian
 *   June–May year of its due date, the same year the my-bills page groups it
 *   under. A bill with neither never blocks and is never blocked.
 * - Every fee head counts: an unpaid 2025-26 hostel bill locks 2026-27 tuition.
 * - Bills of the same year never block each other.
 * - No combined order: older dues must be cleared (receipt posted) first, so a
 *   checkout holding an older bill AND a newer one is refused too.
 * - Staff online payments and counter receipts are NOT subject to this.
 *
 * The routes are the authoritative check (`findEarlierYearDuesBlock`); the pages
 * use `earlierDuesFor` only to explain the lock before checkout.
 */

/** Bill states that are never owed — mirrors the my-bills page. */
const VOID_BILL_STATUSES = new Set(['cancelled', 'superseded']);

/** Label for dues whose bill carries no academic year. */
const NO_YEAR_LABEL = 'Other';

export interface YearOrderBill {
  /** Academic-year label ('2026-2027'); NO_YEAR_LABEL when the bill has none. */
  year: string;
  /** Start year of the academic year (`academicYearKey`); null = unordered. */
  yearKey: number | null;
  balance: number;
  status?: string | null;
}

export interface EarlierYearDues {
  /** Oldest year first. */
  years: { year: string; balance: number; count: number }[];
  total: number;
}

/**
 * Ordering key for a bill's academic year: the start year of
 * academic_years.start_date, else the Indian June–May academic year inferred
 * from the due date, else null.
 */
export function academicYearKey(
  yearStartDate: string | null | undefined,
  dueDate?: string | null
): number | null {
  const start = yearStartDate ? Number(yearStartDate.slice(0, 4)) : NaN;
  if (Number.isFinite(start)) return start;
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return null;
  return d.getMonth() + 1 >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

const listOf = (items: string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const yearsPhrase = (years: string[], fallback: string) => {
  const named = years.filter((y) => y !== NO_YEAR_LABEL);
  if (named.length === 0) return fallback;
  return `Academic Year${named.length > 1 ? 's' : ''} ${listOf(named)}`;
};

/** Outstanding balances on bills of academic years OLDER than `yearKey`. */
export function earlierDuesFor(bills: YearOrderBill[], yearKey: number | null): EarlierYearDues {
  if (yearKey == null) return { years: [], total: 0 };
  const byYear = new Map<string, { key: number; balance: number; count: number }>();
  for (const b of bills) {
    if (b.yearKey == null || b.yearKey >= yearKey) continue;
    if (!(b.balance > 0)) continue;
    if (VOID_BILL_STATUSES.has((b.status ?? '').toLowerCase())) continue;
    const entry = byYear.get(b.year) ?? { key: b.yearKey, balance: 0, count: 0 };
    entry.balance += b.balance;
    entry.count += 1;
    byYear.set(b.year, entry);
  }
  const years = [...byYear.entries()]
    .sort((a, b) => a[1].key - b[1].key)
    .map(([year, v]) => ({ year, balance: v.balance, count: v.count }));
  return { years, total: years.reduce((sum, y) => sum + y.balance, 0) };
}

/** Full sentence for the refused checkout (toast / 409 message). */
export function earlierDuesMessage(dues: EarlierYearDues, laterYears: string[]): string {
  const earlier = yearsPhrase(
    dues.years.map((y) => y.year),
    'earlier academic years'
  );
  const later = yearsPhrase([...new Set(laterYears)], 'a later academic year');
  return (
    `Please clear your pending fees for ${earlier} (${inr(dues.total)}) before paying ` +
    `${later} fees online. If you have just paid, wait for the receipt to appear and try again.`
  );
}

/** "Academic Year 2025-2026 (₹50,000)" — what is still owed, for page notices. */
export function earlierDuesSummary(dues: EarlierYearDues): string {
  const earlier = yearsPhrase(
    dues.years.map((y) => y.year),
    'Earlier academic years'
  );
  return `${earlier} (${inr(dues.total)})`;
}

/** One-line reason shown on a locked bill. */
export function earlierDuesShortReason(dues: EarlierYearDues): string {
  const earlier = yearsPhrase(
    dues.years.map((y) => y.year),
    'earlier academic year'
  );
  return `Clear ${earlier} dues (${inr(dues.total)}) first`;
}

export type EarlierYearDuesBlock =
  | { blocked: false }
  | { blocked: true; message: string; dues: EarlierYearDues };

/**
 * Server-side gate for a learner/parent online checkout. Blocks when the
 * learner still owes on a learner-visible bill of an academic year OLDER than
 * the newest year in the checkout (whether or not that older bill is selected).
 *
 * `db` is the caller's client: the learner session (RLS scopes the rows; the
 * student policy on academic_years exposes the years of their own bills) or the
 * parent route's service-role client (which is why `hiddenCategoryIds` is
 * applied here rather than trusted to RLS). Query errors throw — fail closed.
 */
export async function findEarlierYearDuesBlock(
  db: { from: (table: string) => any },
  {
    studentId,
    billIds,
    hiddenCategoryIds,
  }: { studentId: string; billIds: string[]; hiddenCategoryIds: Set<string> }
): Promise<EarlierYearDuesBlock> {
  const { data: rows, error } = await db
    .from('billing_student_bills')
    .select('id, balance_amount, status, item_category_id, academic_year_id, due_date')
    .eq('student_id', studentId);
  if (error) throw error;

  const bills = ((rows ?? []) as {
    id: string;
    balance_amount: number | string | null;
    status: string | null;
    item_category_id: string | null;
    academic_year_id: string | null;
    due_date: string | null;
  }[]).filter((b) => isBillLearnerVisible(b.item_category_id, hiddenCategoryIds));

  const yearIds = [...new Set(bills.map((b) => b.academic_year_id).filter(Boolean))] as string[];
  const years = new Map<string, { name: string | null; start: string | null }>();
  if (yearIds.length) {
    const { data: yearRows, error: yearsError } = await db
      .from('academic_years')
      .select('id, academic_year_name, start_date')
      .in('id', yearIds);
    if (yearsError) throw yearsError;
    for (const y of (yearRows ?? []) as {
      id: string;
      academic_year_name: string | null;
      start_date: string | null;
    }[]) {
      // Names carry trailing-space duplicates ("2025-2026 ") — trim.
      years.set(y.id, {
        name: y.academic_year_name ? String(y.academic_year_name).trim() : null,
        start: y.start_date,
      });
    }
  }

  const ordered = bills.map((b) => {
    const y = b.academic_year_id ? years.get(b.academic_year_id) : undefined;
    return {
      id: b.id,
      year: y?.name ?? NO_YEAR_LABEL,
      yearKey: academicYearKey(y?.start, b.due_date),
      balance: Number(b.balance_amount ?? 0),
      status: b.status,
    };
  });

  const selected = new Set(billIds);
  const selectedKeys = ordered
    .filter((b) => selected.has(b.id) && b.yearKey != null)
    .map((b) => b.yearKey as number);
  if (selectedKeys.length === 0) return { blocked: false };

  const dues = earlierDuesFor(ordered, Math.max(...selectedKeys));
  if (dues.years.length === 0) return { blocked: false };

  const laterYears = ordered
    .filter((b) => selected.has(b.id) && earlierDuesFor(ordered, b.yearKey).years.length > 0)
    .map((b) => b.year);
  return { blocked: true, dues, message: earlierDuesMessage(dues, laterYears) };
}
