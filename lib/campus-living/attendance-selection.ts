/**
 * Selection maths for the Mark Attendance page
 * (`app/(routes)/campus-living/attendance/mark`).
 *
 * Kept as pure functions, separate from the page, for two reasons: the page is
 * already large, and this repo tests logic rather than rendered components — so
 * putting the fiddly parts here is what makes them testable at all.
 *
 * Every id here is a `hostel_residents.id` (`MarkableResident.id`) — the SAME
 * key the page's `attendance` record uses. Do not switch to `learner_id`: the
 * page carries a documented bug from a previous attempt at that, and the
 * existing-attendance pre-fill deliberately maps `profile_id -> id` to line up
 * with this keying.
 */

export type GroupSelectionState = 'none' | 'some' | 'all';

/**
 * How much of a group (a Room, Floor or Block) is currently selected — drives
 * the tri-state group checkbox.
 *
 * Only membership of `groupIds` matters; selected residents elsewhere are
 * irrelevant, so a fully-selected room still reads 'all' while other rooms are
 * also selected. An empty group is 'none' rather than the vacuously-true 'all',
 * otherwise an empty group heading would render permanently ticked.
 */
export function groupSelectionState(
  groupIds: readonly string[],
  selected: ReadonlySet<string>
): GroupSelectionState {
  if (groupIds.length === 0) return 'none';
  let hits = 0;
  for (const id of groupIds) {
    if (selected.has(id)) hits += 1;
  }
  if (hits === 0) return 'none';
  return hits === groupIds.length ? 'all' : 'some';
}

/**
 * Toggle a whole group. A fully-selected group clears; anything else fills.
 *
 * Note the asymmetry: clicking a *partially* selected group completes it rather
 * than clearing it. Clearing would throw away ticks the marker had just placed
 * by hand, which is the more expensive mistake to recover from.
 *
 * Selections outside the group are always preserved.
 */
export function toggleGroup(
  groupIds: readonly string[],
  selected: ReadonlySet<string>
): Set<string> {
  const next = new Set(selected);
  if (groupSelectionState(groupIds, selected) === 'all') {
    for (const id of groupIds) next.delete(id);
  } else {
    for (const id of groupIds) next.add(id);
  }
  return next;
}

/**
 * Drop any selected id that is no longer on screen.
 *
 * The page runs this whenever the visible roster changes (block switch, floor or
 * category filter, search) and writes the result straight back to state. That
 * makes the identity of the return value load-bearing: when nothing needs
 * pruning this returns the *same* Set instance, so the state write is a no-op
 * and the effect does not re-fire. Returning a fresh Set unconditionally would
 * loop forever.
 */
export function pruneToVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[] | ReadonlySet<string>
): ReadonlySet<string> {
  if (selected.size === 0) return selected;
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  const next = new Set<string>();
  for (const id of selected) {
    if (visible.has(id)) next.add(id);
  }
  return next.size === selected.size ? selected : next;
}

/**
 * Apply one status to every selected resident, returning a new attendance map.
 *
 * Marks for residents outside the selection are carried over untouched — bulk
 * Present on one room must not disturb someone already marked Medical
 * elsewhere.
 *
 * `status` is `NoInfer<S>` on purpose — do not simplify it to `S`. Without it,
 * a call like `applyStatusToSelection(prev, ids, 'present')` lets the string
 * literal win inference, pinning S to `'present'` and then rejecting the
 * caller's own `Record<string, AttendanceStatus>` map. S must come from the
 * map; the status merely has to fit inside it.
 */
export function applyStatusToSelection<S extends string>(
  attendance: Readonly<Record<string, S>>,
  selected: ReadonlySet<string>,
  status: NoInfer<S>
): Record<string, S> {
  const next: Record<string, S> = { ...attendance };
  for (const id of selected) next[id] = status;
  return next;
}

/**
 * How many selected residents the marker can actually see.
 *
 * Displayed on the bulk bar. Counting the raw selection instead would let the
 * bar claim "12 selected" while only 3 are on screen.
 */
export function countSelected(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[]
): number {
  let n = 0;
  for (const id of visibleIds) {
    if (selected.has(id)) n += 1;
  }
  return n;
}
