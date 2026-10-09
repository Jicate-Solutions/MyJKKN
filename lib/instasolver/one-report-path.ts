// lib/instasolver/one-report-path.ts
//
// ONE report path (Director, 5–6 Oct 2026): the two InstaSolvers merge into
// one, and every report goes through the chooser at /instasolver. The desk's
// old Report / Request pages redirect here with ?moved=1, and the chooser then
// shows a one-line note so a person following an old link is not left
// wondering why the page changed.
//
// Pure: no database, no React. Tested in __tests__/instasolver/one-report-path.test.ts.

export const REPORTING_MOVED_HREF = '/instasolver?moved=1';

export const REPORTING_MOVED_NOTE = 'Reporting has moved here. Pick what kind of problem it is.';

/** True when the chooser was reached from an old desk link. */
export function cameFromOldDeskLink(
  searchParams: Record<string, string | string[] | undefined> | undefined
): boolean {
  const moved = searchParams?.moved;
  return (Array.isArray(moved) ? moved[0] : moved) === '1';
}
