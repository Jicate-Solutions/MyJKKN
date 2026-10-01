/**
 * THE MONTH RULE: which salary row pays a given month.
 *
 * Director ruling, 30 Sep 2026: "the payslip uses the pay IN FORCE FOR THAT
 * MONTH (by effective_from), not the latest row; the salary register follows
 * the SAME month rule." Both screens call pickSalaryInForce, through
 * loadSalaryRowsInForce in lib/services/hr/payroll/salary-register-service.ts,
 * so they cannot pay one person two amounts for one month.
 *
 * PURE. No Supabase, no I/O, no imports. Tested in
 * __tests__/hr/payslip-monthly-gross.test.ts.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * A raise does not edit a row. fn_hr_set_staff_salary writes a NEW row and
 * stamps the old one's superseded_by with the new row's id, on the day HR
 * records it, whatever its start date. So a person's rows form a chain, newest
 * last, and the newest row can start in the FUTURE: raises start on the 1st of
 * the month after the Director approves (ruling 29 Sep).
 *
 *   1. Walk the chain from the row nobody has replaced (superseded_by IS NULL)
 *      back through the rows it replaced.
 *   2. The first row whose effective_from is on or before the month's FIRST
 *      DAY pays the month (Director ruling, 1 Oct 2026: "a raise from 17
 *      October shows from the November payslip"; no split by days, no
 *      back-pay).
 *   3. Only if NO row is in force on the 1st (a new joiner whose first salary
 *      starts mid-month), the newest row started by the month's LAST day pays
 *      it; attendance then pays only the days worked. Without this a person
 *      joining on the 17th would get nothing for their first month.
 *   4. effective_from NULL means "in force since forever": some older rows were
 *      written before the column was filled.
 *
 * So a raise dated 1 October never pays September, even if September is paid
 * on 2 October, after the raise was recorded. A raise dated 15 September does
 * NOT pay September either: September is paid at the rate in force on
 * 1 September, and the raise shows from the October payslip.
 *
 * If NO row has started by the month's last day, nothing pays that month and
 * `startsAfter` says when pay starts, so the screens can say so instead of
 * "no salary recorded".
 */

/** The columns the month rule needs. Everything else rides along untouched. */
export interface SalaryChainRow {
  id?: string | null;
  staff_id: string;
  effective_from?: string | null;
  superseded_by?: string | null;
  created_at?: string | null;
}

/** 'YYYY-MM-DD' for the first day of a month. `month` is 1-12. */
export function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** 'YYYY-MM-DD' for the last day of a month. `month` is 1-12. */
export function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of the next month is the last day of this one. UTC so no timezone
  // can move the date.
  const d = new Date(Date.UTC(year, month, 0));
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** A date column as 'YYYY-MM-DD', or null. Tolerates a timestamp string. */
function dateOf(v: string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).slice(0, 10);
}

/** Newest first: the later start date, then the later write. NULL start = oldest. */
function newestFirst(a: SalaryChainRow, b: SalaryChainRow): number {
  const ea = dateOf(a.effective_from);
  const eb = dateOf(b.effective_from);
  if (ea !== eb) {
    if (ea === null) return 1;
    if (eb === null) return -1;
    return ea < eb ? 1 : -1;
  }
  const ca = a.created_at ?? '';
  const cb = b.created_at ?? '';
  if (ca !== cb) return ca < cb ? 1 : -1;
  return 0;
}

/**
 * One person's rows, newest first, in chain order.
 *
 * Rows the chain cannot reach (a broken pointer, or history filed without a
 * link) go last, newest first, so they can still pay a month nothing in the
 * chain covers, but never outrank a row the chain reaches.
 */
export function salaryChainNewestFirst<T extends SalaryChainRow>(rows: T[]): T[] {
  const ordered: T[] = [];
  const seen = new Set<T>();

  const replacedBy = new Map<string, T[]>();
  for (const r of rows) {
    if (r.superseded_by) {
      const list = replacedBy.get(r.superseded_by) ?? [];
      list.push(r);
      replacedBy.set(r.superseded_by, list);
    }
  }

  const visit = (r: T) => {
    if (seen.has(r)) return; // a pointer loop cannot hang the payroll
    seen.add(r);
    ordered.push(r);
    if (!r.id) return;
    const earlier = [...(replacedBy.get(r.id) ?? [])].sort(newestFirst);
    for (const e of earlier) visit(e);
  };

  const heads = rows.filter((r) => !r.superseded_by).sort(newestFirst);
  for (const h of heads) visit(h);

  const unreached = rows.filter((r) => !seen.has(r)).sort(newestFirst);
  for (const r of unreached) visit(r);

  return ordered;
}

/**
 * The row that pays the month from `firstDay` to `lastDay`, or null with the
 * date pay starts. See the header for the rule.
 */
export function pickSalaryInForce<T extends SalaryChainRow>(
  rows: T[],
  firstDay: string,
  lastDay: string,
): { row: T | null; startsAfter: string | null } {
  if (rows.length === 0) return { row: null, startsAfter: null };

  const chain = salaryChainNewestFirst(rows);
  // Rule 2: the pay in force on the 1st.
  for (const r of chain) {
    const from = dateOf(r.effective_from);
    if (from === null || from <= firstDay) return { row: r, startsAfter: null };
  }
  // Rule 3: nothing was in force on the 1st, so this is the person's first
  // month: their first salary pays it (attendance pays only the days worked).
  for (const r of chain) {
    const from = dateOf(r.effective_from);
    if (from !== null && from <= lastDay) return { row: r, startsAfter: null };
  }

  // Every row starts after the month: pay begins on the earliest of them.
  const starts = rows
    .map((r) => dateOf(r.effective_from))
    .filter((d): d is string => d !== null)
    .sort();
  return { row: null, startsAfter: starts[0] ?? null };
}
