import { describe, it, expect } from 'vitest';
import {
  groupSelectionState,
  toggleGroup,
  pruneToVisible,
  applyStatusToSelection,
  countSelected,
} from '@/lib/campus-living/attendance-selection';

const set = (...ids: string[]) => new Set(ids);

describe('groupSelectionState', () => {
  it('reports "none" when no member of the group is selected', () => {
    expect(groupSelectionState(['a', 'b', 'c'], set('x', 'y'))).toBe('none');
  });

  it('reports "some" when only part of the group is selected', () => {
    expect(groupSelectionState(['a', 'b', 'c'], set('a'))).toBe('some');
    expect(groupSelectionState(['a', 'b', 'c'], set('a', 'b'))).toBe('some');
  });

  it('reports "all" only when every member is selected', () => {
    expect(groupSelectionState(['a', 'b', 'c'], set('a', 'b', 'c'))).toBe('all');
  });

  it('ignores selected ids outside the group when deciding "all"', () => {
    // A room heading must show a full tick when that room is fully selected,
    // even though residents in other rooms are also selected.
    expect(groupSelectionState(['a', 'b'], set('a', 'b', 'z'))).toBe('all');
  });

  it('treats an empty group as "none" so its checkbox is never stuck ticked', () => {
    expect(groupSelectionState([], set('a'))).toBe('none');
  });
});

describe('toggleGroup', () => {
  it('selects the whole group when none of it is selected', () => {
    expect(toggleGroup(['a', 'b'], set())).toEqual(set('a', 'b'));
  });

  it('selects the rest of the group when it is partially selected', () => {
    // Clicking an indeterminate group checkbox completes the group; it does
    // not clear it. Clearing a partial selection would silently discard work.
    expect(toggleGroup(['a', 'b', 'c'], set('a'))).toEqual(set('a', 'b', 'c'));
  });

  it('deselects the whole group when it is already fully selected', () => {
    expect(toggleGroup(['a', 'b'], set('a', 'b'))).toEqual(set());
  });

  it('leaves selections outside the group untouched in both directions', () => {
    expect(toggleGroup(['a'], set('z'))).toEqual(set('z', 'a'));
    expect(toggleGroup(['a'], set('a', 'z'))).toEqual(set('z'));
  });

  it('does not mutate the set it was given', () => {
    const before = set('a');
    toggleGroup(['b'], before);
    expect(before).toEqual(set('a'));
  });
});

describe('pruneToVisible', () => {
  it('drops ids that are no longer visible', () => {
    expect(pruneToVisible(set('a', 'b', 'c'), ['a', 'c'])).toEqual(set('a', 'c'));
  });

  it('returns the SAME set instance when nothing needs pruning', () => {
    // Load-bearing: the page prunes inside an effect and writes the result back
    // to state. Returning a fresh Set every time would re-trigger the effect
    // forever. Identity equality is what stops the loop.
    const selected = set('a', 'b');
    expect(pruneToVisible(selected, ['a', 'b', 'c'])).toBe(selected);
  });

  it('returns the same instance for an already-empty selection', () => {
    const empty = set();
    expect(pruneToVisible(empty, ['a'])).toBe(empty);
  });

  it('empties the selection when nothing is visible', () => {
    expect(pruneToVisible(set('a'), [])).toEqual(set());
  });

  it('accepts a Set of visible ids as well as an array', () => {
    expect(pruneToVisible(set('a', 'b'), set('b'))).toEqual(set('b'));
  });
});

describe('applyStatusToSelection', () => {
  it('writes the status for every selected id', () => {
    expect(applyStatusToSelection({}, set('a', 'b'), 'present')).toEqual({
      a: 'present',
      b: 'present',
    });
  });

  it('overwrites an existing status for selected ids', () => {
    expect(applyStatusToSelection({ a: 'absent' }, set('a'), 'present')).toEqual({
      a: 'present',
    });
  });

  it('leaves marks for unselected residents untouched', () => {
    // Bulk Present on one room must not disturb a resident already marked
    // 'medical' in another room.
    expect(applyStatusToSelection({ z: 'medical' }, set('a'), 'present')).toEqual({
      z: 'medical',
      a: 'present',
    });
  });

  it('does not mutate the attendance map it was given', () => {
    const before = { z: 'medical' };
    applyStatusToSelection(before, set('a'), 'present');
    expect(before).toEqual({ z: 'medical' });
  });

  it('is a no-op for an empty selection', () => {
    const before = { z: 'medical' };
    expect(applyStatusToSelection(before, set(), 'present')).toEqual(before);
  });
});

describe('countSelected', () => {
  it('counts only ids that are both selected and visible', () => {
    // The bar's "N selected" must never claim more than the marker can see.
    expect(countSelected(set('a', 'b', 'ghost'), ['a', 'b', 'c'])).toBe(2);
  });

  it('is zero when the selection and the visible set do not overlap', () => {
    expect(countSelected(set('ghost'), ['a'])).toBe(0);
  });
});
