// #4304 deep review r4, LOWs 3 and 4: what the tournament Edit dialog shows
// about a division's results lock.
import { describe, it, expect } from 'vitest';
import {
  divisionHasResults,
  divisionResultsUnknown,
} from '@/app/(routes)/events/tournament/_components/division-results-lock';

const DIV = 'div-1';

describe('divisionResultsUnknown (LOW 4)', () => {
  it('a failed matches or heats read keeps the fields disabled, like a pending one', () => {
    const ok = { isLoading: false, isError: false };
    expect(divisionResultsUnknown([ok, ok])).toBe(false);
    expect(divisionResultsUnknown([{ isLoading: true, isError: false }, ok])).toBe(true);
    expect(divisionResultsUnknown([ok, { isLoading: false, isError: true }])).toBe(true);
  });
});

describe('divisionHasResults (LOW 3)', () => {
  it('a division with a mark is locked even when no result exists now (rolled back or deleted)', () => {
    expect(divisionHasResults(DIV, [{ division_id: DIV, status: 'pending' }], [], [DIV])).toBe(true);
  });

  it('no mark, no result: not locked', () => {
    expect(divisionHasResults(DIV, [{ division_id: DIV, status: 'scheduled' }], [], ['other'])).toBe(false);
  });

  it('a recorded match or heat result still locks without a mark', () => {
    expect(divisionHasResults(DIV, [{ division_id: DIV, status: 'walkover' }], [], undefined)).toBe(true);
    expect(
      divisionHasResults(DIV, [], [{ division_id: DIV, athletes: [{ position: null, mark_value: null, result_status: 'dnf' }] }], [])
    ).toBe(true);
  });
});
