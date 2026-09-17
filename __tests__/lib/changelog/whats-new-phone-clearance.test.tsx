// @vitest-environment jsdom
/**
 * What's New — THE WORDS STAY CLEAR OF THE FLOATING COLUMN ON A PHONE.
 *
 * Three platform-wide controls stack `fixed right-4`, 48px wide, on every
 * authenticated page, so on a 393px screen the column owns x ∈ [329, 377] for
 * the bottom ~316px of the viewport — at every scroll offset, because a fixed
 * element crosses every row of a scrolling list. #3761 moved the "Open this
 * page" link out from under it; the TEXT did not move. Verified live on
 * production 2026-09-15: a wrapped entry title ran to x = 364 and the share
 * button sat on its last word (.screenshots/wn2-superadmin-phone-link.png), and
 * on the highlights strip the lightning button covered the end of the
 * sub-heading (.screenshots/wn2-superadmin-phone-top.png).
 *
 * The fix is 56px of right padding, below `lg`, on the two wrappers that hold
 * that text — which ends the cards at x = 321 and their words at x = 308. jsdom
 * does no layout, so this file cannot measure pixels; what it CAN hold is that
 * the padding is on the element that owns the text, and that it is on the
 * wrapper rather than the card. The second half matters: the card's `sm:p-4`
 * is a padding shorthand Tailwind emits after every `max-lg:` utility, so the
 * same class on the <li> would be silently overwritten between 640 and 1023px
 * and only look fixed on a phone. Either of those is one tidy-up away.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const permissionsMock = vi.hoisted(() => ({
  current: { permissions: {} as Record<string, boolean>, isSuperAdmin: true, isLoading: false },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissionsMock.current,
}));

import { WhatsNewView } from '@/components/changelog/whats-new-view';
import { HighlightsStrip } from '@/components/changelog/highlights-strip';

/** The utility that reserves the floating column's lane, below `lg`. */
const CLEARANCE = 'max-lg:pr-14';

const META = {
  generatedAt: '2026-09-15',
  ref: 'jicate/main',
  total: 1,
  first: '2026-09-14',
  latest: '2026-09-14',
  months: ['2026-09'],
  recentFrom: '2026-06-08',
  recentCount: 1,
  archiveCount: 0,
  contributors: [{ name: 'Ommsharravana', count: 1 }],
  modules: {
    foundation: { label: 'Foundation', perm: 'foundation', href: '/foundation' },
  },
};

/** The very row the screenshot caught: a title long enough to wrap at 393px. */
const RECENT = [
  {
    h: 'aaa1111',
    d: '2026-09-14',
    t: 'new',
    m: 'foundation',
    s: 'Wave 3 Lane G — the door a Senior Learner uses to ask for AI questions',
    a: 'Ommsharravana',
    p: 3341,
  },
];

const HIGHLIGHTS = {
  from: '2026-08-15',
  highlights: [
    {
      sha: 'aaa1111',
      date: '2026-09-14',
      kind: 'new',
      module_key: 'foundation',
      headline:
        'Foundation tests can now include images in questions, show up in your own language, and wrap up automatically.',
      affects: 'Learners taking a Foundation test and the coordinators who run them.',
      action: 'Open Foundation.',
      subject: 'feat(foundation): images, locale, auto-close',
      author: 'Ommsharravana',
      source: 'ai',
      reported: false,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.includes('/highlights') ? HIGHLIGHTS : url.includes('part=meta') ? META : RECENT
          ),
      } as Response)
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("What's New — text stays clear of the floating column on a phone", () => {
  it('reserves the lane on the wrapper that holds the entry cards, not on the card', async () => {
    render(<WhatsNewView />);
    const title = await screen.findByText(
      'Wave 3 Lane G — the door a Senior Learner uses to ask for AI questions'
    );

    const card = title.closest('li');
    expect(card).not.toBeNull();
    // Not on the card: `sm:p-4` would win the cascade there between sm and lg.
    expect(card).not.toHaveClass(CLEARANCE);

    // On an ancestor of every card — the day sections' wrapper.
    const lane = card!.closest(`[class~="${CLEARANCE}"]`);
    expect(lane).not.toBeNull();
    expect(lane!.contains(card!)).toBe(true);
  });

  it('reserves the same lane for the highlights strip, heading included', async () => {
    render(<HighlightsStrip modules={META.modules as any} />);
    // The strip is folded on load (Director, 2026-09-16), so open it: the card
    // whose headline the floating buttons covered has to be on screen before
    // this file can say anything about the lane it sits in.
    fireEvent.click(await screen.findByRole('button', { name: /Worth knowing/ }));
    await waitFor(() =>
      expect(screen.getByText('Foundation tests can now include images in questions, show up in your own language, and wrap up automatically.')).toBeInTheDocument()
    );

    // The landmark keeps its name through the fold. The heading text moved
    // inside the toggle button, so the id that names this region moved onto the
    // span holding the two words rather than onto the <h2> — an <h2> wrapping
    // the button would name the landmark with the sub-heading as well.
    const section = screen.getByRole('region', { name: 'Worth knowing' });
    expect(section).toHaveClass(CLEARANCE);
    // The sub-heading the lightning button covered sits inside the lane too —
    // and it is now on the folded header, which is the one thing every reader
    // sees on load, so the clearance matters more than it did before.
    expect(section.contains(screen.getByText(/explained in plain English/))).toBe(true);
  });
});
