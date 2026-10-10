// What the tournament Edit dialog shows about a division's results lock
// (#4304: sport, category and format are fixed once results have EVER been
// recorded). The database trigger is the real lock; this only explains it up
// front, so it must never show the fields as freely editable when it cannot
// tell.

/**
 * Match statuses that mean a result is recorded. Same set the database guard
 * (trg_tournament_division_results_lock) and fn_tournament_set_fixture_mode use.
 */
export const RECORDED_RESULT_STATUSES = ['completed', 'walkover', 'disqualified'];

interface MatchLike {
  division_id: string;
  status: string;
}
interface HeatLike {
  division_id: string;
  athletes?: { position?: number | null; mark_value?: number | null; result_status?: string | null }[] | null;
}

/**
 * True while the dialog cannot tell whether a division is locked: any of the
 * three reads is still loading OR has failed (#4304 r4 LOW 4 — a failed read
 * used to leave the fields editable).
 */
export function divisionResultsUnknown(reads: { isLoading: boolean; isError: boolean }[]): boolean {
  return reads.some((r) => r.isLoading || r.isError);
}

/**
 * A division is locked when it has a recorded result now, or has EVER had one
 * (a mark in tournament_division_result_marks, #4304 r4 LOW 3): a result that
 * was rolled back or deleted still leaves the lock in place.
 */
export function divisionHasResults(
  divisionId: string,
  matches: MatchLike[] | undefined,
  heats: HeatLike[] | undefined,
  markedDivisionIds: string[] | undefined,
): boolean {
  if ((markedDivisionIds ?? []).includes(divisionId)) return true;
  if ((matches ?? []).some((m) => m.division_id === divisionId && RECORDED_RESULT_STATUSES.includes(m.status))) {
    return true;
  }
  // Same test as the trigger: a place, a mark, or DNS/DNF/DQ.
  return (heats ?? []).some(
    (h) =>
      h.division_id === divisionId &&
      (h.athletes ?? []).some((a) => a.position != null || a.mark_value != null || a.result_status !== 'ok'),
  );
}
