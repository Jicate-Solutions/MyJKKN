// @vitest-environment jsdom
/**
 * AI Pulse live page — the Join control once a session is over.
 * =============================================================================
 *
 * `join_open` is false both BEFORE the doors open and AFTER the session ends.
 * The button only knew the first case, so on 4 Sep the 3 Sep session page told
 * BUG-006038 / BUG-006039 "Join opens Thu, 06:40 pm IST" — for a session that
 * was already over, and that they had attended through the meeting link alone.
 */

import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/services/ai-pulse/live-session-service', () => ({
  useRecordJoin: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import {
  JoinButton,
  hasSessionEnded,
} from '@/app/(routes)/ai-pulse/live/[cycle]/_components/join-button';

afterEach(cleanup);

// 3 Sep 2026 cycle: doors 18:40 IST, session 18:55–19:30 IST.
const OPENS_AT = '2026-09-03T13:10:00.000Z';
const ENDS_AT = '2026-09-03T19:30:00+05:30';

describe('JoinButton after the session has ended', () => {
  it('says the session has ended instead of when Join opens', () => {
    render(
      <JoinButton
        cycleId="c1"
        meetUrl="https://example.invalid/meet"
        alreadyJoined={false}
        joinOpen={false}
        joinOpensAt={OPENS_AT}
        sessionEnded
      />,
    );

    expect(screen.getByTestId('ai-pulse-join-button')).toHaveTextContent(
      'This session has ended',
    );
    expect(screen.getByTestId('ai-pulse-join-button')).toBeDisabled();
    expect(screen.queryByText(/Join opens/i)).toBeNull();
    expect(screen.getByTestId('ai-pulse-join-ended-note')).toHaveTextContent(
      'A join is recorded only when Join is pressed on this page during the session.',
    );
  });

  it('still shows when Join opens for a session that is yet to start', () => {
    render(
      <JoinButton
        cycleId="c1"
        meetUrl="https://example.invalid/meet"
        alreadyJoined={false}
        joinOpen={false}
        joinOpensAt={OPENS_AT}
        sessionEnded={false}
      />,
    );

    expect(screen.getByTestId('ai-pulse-join-button')).toHaveTextContent(/Join opens/);
    expect(screen.queryByText('This session has ended')).toBeNull();
  });

  it('keeps the re-open meeting link for a learner who did join', () => {
    render(
      <JoinButton
        cycleId="c1"
        meetUrl="https://example.invalid/meet"
        alreadyJoined
        joinOpen={false}
        joinOpensAt={OPENS_AT}
        sessionEnded
      />,
    );

    expect(screen.getByText('Joined this session')).toBeInTheDocument();
    expect(screen.getByTestId('ai-pulse-open-meeting')).toBeInTheDocument();
  });
});

describe('hasSessionEnded', () => {
  const end = new Date(ENDS_AT).getTime();

  it('is false before and at the end instant, true after it', () => {
    expect(hasSessionEnded(ENDS_AT, end - 60_000)).toBe(false);
    expect(hasSessionEnded(ENDS_AT, end)).toBe(false);
    expect(hasSessionEnded(ENDS_AT, end + 1)).toBe(true);
  });

  it('is false when the end time is missing or unparseable', () => {
    expect(hasSessionEnded(null, end + 1)).toBe(false);
    expect(hasSessionEnded('not a date', end + 1)).toBe(false);
  });
});
