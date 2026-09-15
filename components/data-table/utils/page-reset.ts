/**
 * Page-reset decisions for the server-driven DataTable.
 *
 * Kept as pure functions so they can be unit-tested without a DOM (the table
 * itself cannot be rendered in this repo's test runner).
 *
 * Why this exists: the table asks the server for
 * `.range((page - 1) * limit, page * limit - 1)`. Narrowing the query usually
 * returns FEWER rows, so carrying the previous page number over to the new
 * query asks PostgREST for an offset past the end of the new result set, and it
 * answers HTTP 416 / PGRST103 ("An offset of 10 was requested, but there are
 * only 0 rows") instead of data. Anything that narrows the result set must
 * therefore put the table back on the first page IN THE SAME UPDATE, before the
 * fetch effect gets a chance to run with the stale offset.
 */

/**
 * True when committing `nextSearch` must send the table back to page 1.
 *
 * Re-committing the SAME term (the debounced search box fires on every settle,
 * including "typed a character and deleted it again") is not a result-set
 * change, so it must not yank a user off the page they are reading.
 */
export function shouldResetPageOnSearchChange(
  currentSearch: string,
  nextSearch: string,
  currentPage: number
): boolean {
  if (currentSearch === nextSearch) return false;
  return currentPage !== 1;
}

/**
 * True when a change to the table's external filter key must send it back to
 * page 1.
 *
 * `nextKey === undefined` means the table never opted in to external page
 * resets, so the answer is always "no" for it.
 */
export function shouldResetPageOnFilterKeyChange(
  previousKey: string | number | undefined,
  nextKey: string | number | undefined,
  currentPage: number
): boolean {
  if (nextKey === undefined) return false;
  if (previousKey === nextKey) return false;
  return currentPage !== 1;
}
