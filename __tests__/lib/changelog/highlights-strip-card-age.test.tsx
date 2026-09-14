// @vitest-environment jsdom
/**
 * What's New strip — A CARD SAYS HOW OLD IT IS.
 *
 * The payload has always carried `date`, and the component declared it on the
 * item type and rendered it nowhere. That was harmless while the strip was
 * bounded by the current week: everything on it was days old, and the heading
 * said "this week" and was true.
 *
 * It stopped being harmless when the strip started serving the most recent ten
 * write-ups from a month-wide backlog window. A card can now be weeks old, the
 * heading no longer says when, and a reader had nothing on the card to tell a
 * change that shipped yesterday from one that shipped in August — while the
 * sub-heading claimed these were "the most recent changes", which they are not:
 * they are the most recently WRITTEN-UP ones, and dozens of newer changes may
 * have no write-up at all.
 *
 * Both of those are assertions here rather than prose, because both are one
 * careless tidy-up away from coming back.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

import { HighlightsStrip } from '@/components/changelog/highlights-strip';

const MODULES = {
  billing: { label: 'Billing', perm: 'billing', href: '/billing' },
} as any;

/** Two write-ups five weeks apart — the shape the backlog window now produces. */
const PAYLOAD = {
  from: '2026-08-13',
  highlights: [
    {
      sha: 'aaa1',
      date: '2026-09-12',
      kind: 'new',
      module_key: 'billing',
      headline: 'Split an invoice without raising a new one.',
      affects: 'Anyone who works in Billing.',
      action: 'Open Billing → Invoices and use Split.',
      subject: 'feat(billing): invoice split',
      author: 'A',
      source: 'ai',
      reported: false,
    },
    {
      sha: 'bbb2',
      date: '2026-08-14',
      kind: 'fixed',
      module_key: 'billing',
      headline: 'Receipt totals add up again.',
      affects: 'Anyone who works in Billing.',
      action: 'Reopen any receipt.',
      subject: 'fix(billing): receipt total',
      author: 'B',
      source: 'ai',
      reported: false,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as any
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("What's New strip — the age of a card", () => {
  it('renders the day each change landed, on every card', async () => {
    render(<HighlightsStrip modules={MODULES} />);
    // Both dates, in the reader's own words rather than a raw ISO string. The
    // older one is the point: without it that card is indistinguishable from
    // the one above it, which shipped five weeks later.
    // Regex, not a literal: en-GB abbreviates September as "Sep" or "Sept"
    // depending on the ICU the runtime was built with, and pinning the literal
    // would make this fail on a Node upgrade for a reason that is not the bug.
    await waitFor(() => expect(screen.getByText(/^12 Sept?$/)).toBeInTheDocument());
    expect(screen.getByText(/^14 Aug$/)).toBeInTheDocument();
    // The machine-readable form too, so the card is not merely decorative.
    expect(screen.getByText(/^12 Sept?$/).getAttribute('datetime')).toBe('2026-09-12');
  });

  it('does not claim these are the most recent CHANGES', async () => {
    // They are the most recently written-up ones. Dozens of newer changes may
    // have no write-up at all, so "the 2 most recent changes" would be a small
    // lie in a place a reader has no way to check.
    render(<HighlightsStrip modules={MODULES} />);
    await waitFor(() => expect(screen.getByText('Worth knowing')).toBeInTheDocument());
    expect(screen.queryByText(/most recent changes/i)).toBeNull();
  });

  it('is still ABSENT, not empty, when there is nothing to show', async () => {
    // The compatibility requirement the whole component is built around: no
    // heading, no card, no "nothing yet" placeholder.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ from: '2026-08-13', highlights: [] }) })) as any
    );
    const { container } = render(<HighlightsStrip modules={MODULES} />);
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(screen.queryByText('Worth knowing')).toBeNull();
  });
});
