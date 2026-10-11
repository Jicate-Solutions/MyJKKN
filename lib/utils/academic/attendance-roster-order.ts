// Added: 2026-10-10 (BUG-006276) - Display order for the attendance marking list.
// Tamil Nadu school registers list boys A-Z, then girls A-Z. This is display
// only: rows are returned as the SAME object references, and marks are keyed by
// learner id, so re-ordering can never move a mark onto another learner.

export type RosterOrder = 'default' | 'name' | 'roll' | 'boys_then_girls';

export const ROSTER_ORDER_OPTIONS: { value: RosterOrder; label: string }[] = [
  { value: 'default', label: 'Default order' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'roll', label: 'Roll number' },
  { value: 'boys_then_girls', label: 'Boys, then girls (A–Z)' }
];

export const ROSTER_ORDER_STORAGE_KEY = 'attendance.mark.rosterOrder';

export function isRosterOrder(value: unknown): value is RosterOrder {
  return ROSTER_ORDER_OPTIONS.some((o) => o.value === value);
}

interface OrderableLearner {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  student_name?: string | null;
  roll_number?: string | null;
}

/** The name as shown on the card, e.g. "S. Ponnaiyan" sorts under S. */
function visibleName(l: OrderableLearner): string {
  // An empty or blank student_name falls back to first + last name, the same
  // fields the page's search box matches on.
  return (
    l.student_name?.trim() ||
    `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim()
  );
}

const nameCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function compareNames(a: OrderableLearner, b: OrderableLearner): number {
  const an = visibleName(a);
  const bn = visibleName(b);
  // A learner with no name on file goes after every named learner.
  if (!an !== !bn) return an ? -1 : 1;
  return nameCollator.compare(an, bn);
}

function genderRank(gender: string | null | undefined): number {
  const g = (gender ?? '').trim().toLowerCase();
  if (g === 'male' || g === 'm' || g === 'boy') return 0;
  if (g === 'female' || g === 'f' || g === 'girl') return 1;
  return 2; // unknown, blank or other: last
}

/**
 * Returns a new array in the requested order. 'default' returns the rows as
 * loaded (today's order). Never mutates `rows`.
 */
export function orderRoster<T extends OrderableLearner>(
  rows: readonly T[],
  order: RosterOrder,
  genderById?: ReadonlyMap<string, string | null>
): T[] {
  const copy = rows.slice();
  if (order === 'default') return copy;

  if (order === 'name') return copy.sort(compareNames);

  if (order === 'roll') {
    return copy.sort((a, b) => {
      const ar = (a.roll_number ?? '').trim();
      const br = (b.roll_number ?? '').trim();
      if (!ar !== !br) return ar ? -1 : 1; // no roll number: last
      return nameCollator.compare(ar, br) || compareNames(a, b);
    });
  }

  return copy.sort(
    (a, b) =>
      genderRank(genderById?.get(a.id)) - genderRank(genderById?.get(b.id)) ||
      compareNames(a, b)
  );
}

// Added: 2026-10-11 (#4328 review) - The note under the order picker when
// "Boys, then girls" cannot be applied (lookup failed, timed out or returned
// nothing). Null when no note is needed.
export const GENDER_ORDER_UNAVAILABLE_NOTICE = 'Showing name order — gender not available.';

export function rosterOrderNotice(
  order: RosterOrder,
  genderStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
): string | null {
  return order === 'boys_then_girls' && genderStatus === 'unavailable'
    ? GENDER_ORDER_UNAVAILABLE_NOTICE
    : null;
}
