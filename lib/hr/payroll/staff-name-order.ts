/**
 * The order a salary register lists people in: ALPHABETICAL BY NAME, titles
 * ignored (2026-10-07). Replaces employee-code order, which HR does not read
 * the register by.
 *
 * "DR. ARUN M S" sorts under A and "MRS. DEVI P" under D — 79 of 492 register
 * names carry a DR. / MR. / MRS. / MISS. prefix, and sorting on it would file
 * every doctor together ahead of everyone else. The title still PRINTS; it is
 * only left out of the comparison.
 *
 * MIRRORED IN SQL by migration 20271007140000_hr_salary_register_serial_by_name,
 * which renumbered the registers that already existed. Both sides compare by
 * CODE POINT (here `<`/`>`, there COLLATE "C") so they cannot disagree the way
 * localeCompare and a database collation can. Change the title list or the key
 * in one place and the other must change with it.
 *
 * Pure: no imports, safe on the server and in tests.
 */

/**
 * A leading title, repeated ("PROF. DR. X"). It only counts when a full stop or
 * a space follows it, so a name that merely starts with those letters
 * ("MSARAVANAN") keeps them.
 */
const LEADING_TITLES = /^(?:(?:DR|MR|MRS|MS|MISS|PROF|SMT)(?:\.|\s)\s*)+/;

/** "DR. ARUN M.S" -> "ARUN M S". */
export function staffNameSortKey(name: string | null | undefined): string {
  // U+00A0 counted as whitespace explicitly — imported names carry it, and
  // Postgres `\s` does not match it either (the SQL mirror handles it the same).
  const upper = (name ?? '').toUpperCase().replace(/[\s ]+/g, ' ').trim();
  const stripped = upper.replace(LEADING_TITLES, '');
  // A name that is nothing BUT a title keeps it, rather than sorting as blank.
  return (stripped || upper).replace(/\./g, ' ').replace(/ +/g, ' ').trim();
}

export interface StaffNameOrderable {
  staff_name: string | null;
  employee_code: string | null;
  staff_id: string;
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Name key, then the full name (so "DR. ARUN" and "ARUN" do not tie), then
 * employee code (missing codes last), then staff id — a total order, so two
 * generations of the same month number everyone identically.
 */
export function compareStaffByName(a: StaffNameOrderable, b: StaffNameOrderable): number {
  return (
    byCodePoint(staffNameSortKey(a.staff_name), staffNameSortKey(b.staff_name)) ||
    byCodePoint((a.staff_name ?? '').toUpperCase(), (b.staff_name ?? '').toUpperCase()) ||
    (a.employee_code == null
      ? b.employee_code == null ? 0 : 1
      : b.employee_code == null ? -1 : byCodePoint(a.employee_code, b.employee_code)) ||
    byCodePoint(a.staff_id, b.staff_id)
  );
}
