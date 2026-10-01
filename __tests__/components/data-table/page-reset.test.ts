/**
 * Page-reset contract for the server-driven DataTable. [BUG-006061]
 *
 * Reported on /billing/schedule/students: searching "abirami" while the table
 * sat on page 2 rendered "FILLTER ERROR", with
 *   PGRST103 — "An offset of 10 was requested, but there are only 0 rows."
 *
 * The table asks the server for `.range((page - 1) * limit, page * limit - 1)`.
 * The search shortened the result set to a single row, but the page counter
 * survived the search change, so the query asked for offset 10 of a 1-row set
 * and PostgREST answered 416 instead of data.
 *
 * These are the two decisions that now stop that, extracted as pure functions
 * because the component itself cannot be rendered in this repo's test runner
 * (jsdom is unavailable here).
 */
import { describe, it, expect } from 'vitest';
import {
  shouldResetPageOnFilterKeyChange,
  shouldResetPageOnSearchChange
} from '@/components/data-table/utils/page-reset';

describe('shouldResetPageOnSearchChange (the toolbar search box)', () => {
  it('resets when a new term is committed from a later page', () => {
    // The exact reported scenario: on page 2, type "abirami".
    expect(shouldResetPageOnSearchChange('', 'abirami', 2)).toBe(true);
  });

  it('resets when the term is replaced, not just added', () => {
    expect(shouldResetPageOnSearchChange('abi', 'ramesh', 5)).toBe(true);
  });

  it('resets when the term is cleared from a later page', () => {
    // Clearing widens the set, but the "Reset" button also lands here and the
    // operator expects the top of the unfiltered list.
    expect(shouldResetPageOnSearchChange('abirami', '', 3)).toBe(true);
  });

  it('does nothing when the same term is re-committed', () => {
    // The debounce fires on every settle — typing a character and deleting it
    // again must not yank the operator off the page they are reading.
    expect(shouldResetPageOnSearchChange('abirami', 'abirami', 4)).toBe(false);
  });

  it('does nothing when already on the first page', () => {
    // Avoids a redundant state write (and, in URL-state mode, a URL rewrite).
    expect(shouldResetPageOnSearchChange('', 'abirami', 1)).toBe(false);
  });
});

describe('shouldResetPageOnFilterKeyChange (filters owned outside the table)', () => {
  it('resets when the external filter signature changes on a later page', () => {
    expect(shouldResetPageOnFilterKeyChange('["",""]', '["abirami",""]', 2)).toBe(
      true
    );
  });

  it('does nothing when the signature is unchanged', () => {
    // Re-renders are constant here (every keystroke elsewhere on the page).
    expect(
      shouldResetPageOnFilterKeyChange('["abirami",""]', '["abirami",""]', 7)
    ).toBe(false);
  });

  it('does nothing when already on the first page', () => {
    expect(shouldResetPageOnFilterKeyChange('["",""]', '["abirami",""]', 1)).toBe(
      false
    );
  });

  it('is inert for tables that never opt in', () => {
    // Every other table in the app passes no pageResetKey at all; the decision
    // must be "no" for them no matter what page they are on.
    expect(shouldResetPageOnFilterKeyChange(undefined, undefined, 9)).toBe(false);
  });
});
