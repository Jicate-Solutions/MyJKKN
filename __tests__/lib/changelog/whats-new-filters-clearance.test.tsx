// @vitest-environment jsdom
/**
 * What's New — THE SEARCH BOX AND THE AREA FILTER STAY OUT FROM UNDER THE
 * FLOATING COLUMN ON A PHONE.
 *
 * #3785 reserved this same lane for the WORDS — its own title is "the words
 * stay clear of the floating column" — and gave `max-lg:pr-14` to the entry
 * list's wrapper and to the highlights section. The filters row was not in the
 * band then: the highlights strip stood between it and the fold line. Fold that
 * strip shut (#3830), or simply have no approved highlight that week, which is
 * a normal production state, and the row drops into it.
 *
 * Measured on jicate/main at a real 375x812 viewport as a super admin, with the
 * strip absent:
 *
 *   bug reporter button   x 311-359, y 624-672  (fixed right-4 bottom-nav-safe-2)
 *   "Search changes…"     x  16-359, y 617-653  ->  48 x 29px underneath it
 *   "Filter by area"      x  16-359, y 665-701  ->  48 x  7px underneath it
 *
 * and `document.elementFromPoint` at the centre of each overlap returned the
 * BUTTON. That is the part that made it a defect rather than an eyesore: a tap
 * on the right end of the search box opened the bug reporter. 56px of right
 * padding below `lg` ends the row at x = 303, 8px clear of the column — the
 * clearance #3785 chose, for the same reason.
 *
 * jsdom does no layout, so this file cannot re-measure those pixels. What it
 * CAN hold is the two things a later tidy-up would break:
 *
 *   1. the lane is on the flex ROW, so it applies to the area filter as well
 *      as the search box — padding only the <Input> leaves the Select's own
 *      right end under the button, which is a fix that looks done and is not;
 *   2. the row still owns both controls, so splitting them into separate rows
 *      cannot silently drop one of them out of the lane.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const permissionsMock = vi.hoisted(() => ({
  current: { permissions: {} as Record<string, boolean>, isSuperAdmin: true, isLoading: false },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissionsMock.current,
}));

import { WhatsNewView } from '@/components/changelog/whats-new-view';

/** The utility that reserves the floating column's lane, below `lg`. */
const CLEARANCE = 'max-lg:pr-14';

const META = {
  generatedAt: '2026-09-16',
  ref: 'jicate/main',
  total: 1,
  first: '2026-09-15',
  latest: '2026-09-15',
  months: ['2026-09'],
  recentFrom: '2026-06-08',
  recentCount: 1,
  archiveCount: 0,
  contributors: [{ name: 'Ommsharravana', count: 1 }],
  modules: {
    foundation: { label: 'Foundation', perm: 'foundation', href: '/foundation' },
  },
};

const RECENT = [
  {
    h: 'aaa1111',
    d: '2026-09-15',
    t: 'new',
    m: 'foundation',
    s: 'A change, so the page renders its filters rather than its empty state',
    a: 'Ommsharravana',
    p: 3785,
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.includes('/highlights')
              ? { from: '2026-08-16', highlights: [] }
              : url.includes('part=meta')
                ? META
                : RECENT
          ),
      } as Response)
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("What's New — the filters stay clear of the floating column on a phone", () => {
  it('reserves the lane on the row that owns BOTH the search box and the area filter', async () => {
    render(<WhatsNewView />);

    const search = await screen.findByLabelText('Search changes');
    const areaFilter = screen.getByLabelText('Filter by area');

    const lane = search.closest(`[class~="${CLEARANCE}"]`);
    expect(lane).not.toBeNull();

    // The area filter is the row's second control. If the lane were on the
    // input's own wrapper instead, this is the assertion that would fail —
    // and it is exactly the overlap the measurement found on the Select.
    expect(lane!.contains(areaFilter)).toBe(true);
  });

  it('does not put the lane on the input itself, where the Select would miss it', async () => {
    render(<WhatsNewView />);

    const search = await screen.findByLabelText('Search changes');
    expect(search).not.toHaveClass(CLEARANCE);
  });
});
