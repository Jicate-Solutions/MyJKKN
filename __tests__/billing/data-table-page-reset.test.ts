import { describe, it, expect } from 'vitest';
import {
  shouldResetPageOnFilterKeyChange,
  shouldResetPageOnSearchChange,
} from '@/components/data-table/utils/page-reset';

// BUG-006061: the students table kept its page counter across a search
// change and asked PostgREST for an offset the shorter result set did not
// have (416 / PGRST103). These are the two decisions that now send it back
// to page 1 in the same update as the filter change.

describe('shouldResetPageOnSearchChange', () => {
  it('resets when the term changes and the user is past page 1', () => {
    // The reported scenario: on page 2, search "abirami" -> 1 row.
    expect(shouldResetPageOnSearchChange('', 'abirami', 2)).toBe(true);
  });

  it('does nothing when already on page 1', () => {
    expect(shouldResetPageOnSearchChange('', 'abirami', 1)).toBe(false);
  });

  it('does not yank the user off their page when the same term is re-committed', () => {
    // The debounced box fires on every settle, including "typed and deleted".
    expect(shouldResetPageOnSearchChange('abirami', 'abirami', 3)).toBe(false);
  });

  it('resets when the term is cleared, since the result set changes', () => {
    expect(shouldResetPageOnSearchChange('abirami', '', 2)).toBe(true);
  });
});

describe('shouldResetPageOnFilterKeyChange', () => {
  it('is inert for tables that never opt in', () => {
    // Every other table in the app passes nothing; undefined must never reset.
    expect(shouldResetPageOnFilterKeyChange(undefined, undefined, 5)).toBe(false);
  });

  it('resets when the external filter signature changes past page 1', () => {
    expect(shouldResetPageOnFilterKeyChange('["",""]', '["abirami",""]', 2)).toBe(true);
  });

  it('does nothing for an identical signature', () => {
    expect(shouldResetPageOnFilterKeyChange('["a"]', '["a"]', 2)).toBe(false);
  });

  it('does nothing on page 1 even when the signature changes', () => {
    expect(shouldResetPageOnFilterKeyChange('["a"]', '["b"]', 1)).toBe(false);
  });

  it('treats the first key arriving as a change only if the table is past page 1', () => {
    expect(shouldResetPageOnFilterKeyChange(undefined, '["a"]', 1)).toBe(false);
    expect(shouldResetPageOnFilterKeyChange(undefined, '["a"]', 2)).toBe(true);
  });
});
