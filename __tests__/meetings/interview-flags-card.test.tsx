// @vitest-environment jsdom

/**
 * The interview flags card on the meeting page (#5, #6, #10, #15).
 *
 * Every flag here is a warning to a host who is about to sit across from a
 * candidate. Two failures matter equally: a flag that should show and does not
 * (the host interviews someone already rejected without knowing), and a flag
 * that shows when it should not (a "no application" line on every interview
 * whose post could not be checked, which teaches hosts to ignore the card).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { InterviewFlags } from '@/lib/services/hr/interview-booking-service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/(routes)/meetings/[uid]/interview-no-show-actions', () => ({
  markInterviewNoShow: vi.fn(),
  undoInterviewNoShow: vi.fn(),
}));

import {
  InterviewFlagsCard,
  formatNoShowDate,
} from '@/app/(routes)/meetings/[uid]/_components/interview-flags-card';

function flags(over: Partial<InterviewFlags> = {}): InterviewFlags {
  return {
    interviewId: 'int-1',
    candidateId: 'cand-1',
    round: 1,
    status: 'scheduled',
    priorOutcome: null,
    priorNoShows: [],
    hasApplication: null,
    bookedViaLink: false,
    ...over,
  };
}

afterEach(cleanup);

describe('InterviewFlagsCard', () => {
  it('names the round (#5)', () => {
    render(<InterviewFlagsCard flags={flags({ round: 3 })} canEdit={false} meetingEnded={false} />);
    expect(screen.getByText('Interview · Round 3')).toBeTruthy();
  });

  it('shows nothing but the heading when there is nothing to flag', () => {
    const { container } = render(
      <InterviewFlagsCard flags={flags()} canEdit={false} meetingEnded={false} />,
    );
    expect(screen.queryByText(/already rejected/)).toBeNull();
    expect(screen.queryByText(/already joined/)).toBeNull();
    expect(screen.queryByText(/Did not turn up/)).toBeNull();
    expect(screen.queryByText(/No application/)).toBeNull();
    expect(screen.queryByText('Booked through the interview link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // #9 — never a recording notice.
    expect(container.textContent ?? '').not.toMatch(/record/i);
  });

  it('badges a booking made through the link', () => {
    render(<InterviewFlagsCard flags={flags({ bookedViaLink: true })} canEdit={false} meetingEnded={false} />);
    expect(screen.getByText('Booked through the interview link')).toBeTruthy();
  });

  it('warns about a candidate already rejected (#6)', () => {
    render(<InterviewFlagsCard flags={flags({ priorOutcome: 'rejected' })} canEdit={false} meetingEnded={false} />);
    expect(
      screen.getByText('This candidate was already rejected before this interview was booked.'),
    ).toBeTruthy();
  });

  it('warns about a candidate who already joined (#6)', () => {
    render(<InterviewFlagsCard flags={flags({ priorOutcome: 'joined' })} canEdit={false} meetingEnded={false} />);
    expect(
      screen.getByText('This candidate had already joined JKKN before this interview was booked.'),
    ).toBeTruthy();
  });

  it('dates a single earlier no-show in India time (#10)', () => {
    // 20:00 UTC on Tue 15 Sep is already Wed 16 Sep in Kolkata.
    render(
      <InterviewFlagsCard
        flags={flags({ priorNoShows: [{ interviewId: 'old-1', scheduledAt: '2026-09-15T20:00:00.000Z' }] })}
        canEdit={false}
        meetingEnded={false}
      />,
    );
    expect(screen.getByText('Did not turn up on Wed 16 Sep 2026')).toBeTruthy();
  });

  it('lists every earlier no-show, newest first as given (#10)', () => {
    render(
      <InterviewFlagsCard
        flags={flags({
          priorNoShows: [
            { interviewId: 'old-2', scheduledAt: '2026-09-16T05:00:00.000Z' },
            { interviewId: 'old-1', scheduledAt: '2026-08-04T05:00:00.000Z' },
          ],
        })}
        canEdit={false}
        meetingEnded={false}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Wed 16 Sep 2026', 'Tue 4 Aug 2026']);
  });

  it('flags a missing application only when the post was checked (#15)', () => {
    render(<InterviewFlagsCard flags={flags({ hasApplication: false })} canEdit={false} meetingEnded={false} />);
    expect(screen.getByText('No application on file for this post.')).toBeTruthy();
    cleanup();
    render(<InterviewFlagsCard flags={flags({ hasApplication: true })} canEdit={false} meetingEnded={false} />);
    expect(screen.queryByText(/No application/)).toBeNull();
  });

  it('offers "Mark as no-show" only to an editor, only once the meeting has ended', () => {
    render(<InterviewFlagsCard flags={flags()} canEdit={true} meetingEnded={false} />);
    expect(screen.queryByRole('button', { name: /Mark as no-show/ })).toBeNull();
    cleanup();
    render(<InterviewFlagsCard flags={flags()} canEdit={false} meetingEnded={true} />);
    expect(screen.queryByRole('button', { name: /Mark as no-show/ })).toBeNull();
    cleanup();
    render(<InterviewFlagsCard flags={flags()} canEdit={true} meetingEnded={true} />);
    expect(screen.getByRole('button', { name: /Mark as no-show/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Undo no-show/ })).toBeNull();
  });

  it('offers "Undo no-show" on an interview marked as a no-show', () => {
    render(<InterviewFlagsCard flags={flags({ status: 'no_show' })} canEdit={true} meetingEnded={true} />);
    expect(screen.getByRole('button', { name: /Undo no-show/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark as no-show/ })).toBeNull();
  });

  it('formats dates the same way whatever the server zone', () => {
    expect(formatNoShowDate('2026-09-16T05:00:00.000Z')).toBe('Wed 16 Sep 2026');
  });
});
