// @vitest-environment jsdom

/**
 * The learner's campus-drive card.
 *
 * Three behaviours carry real weight and are pinned here:
 *
 * 1. It must be INVISIBLE unless the learner actually has an open drive. This
 *    card sits on every learner's dashboard; a version that renders an empty
 *    shell, a spinner, or an error box would put permanent clutter in front of
 *    thousands of learners who have nothing to answer.
 * 2. The call to action must reflect whether they have already answered, because
 *    the card is the entry point to a decision the Career Development Centre
 *    acts on. Showing "tell them you're interested" to someone already signed up
 *    invites a double answer and makes the card untrustworthy.
 * 3. A drive whose willingness window has SHUT must never be offered as though
 *    it were open.
 *
 *    The route cannot carry this alone, by its own design. It drops an
 *    UNANSWERED drive that is outside its dates, but a drive the learner has
 *    ALREADY ANSWERED stays visible for ever — deliberately, so they can always
 *    find their own response (`if (myStatus.has(d.id)) return true`). Those
 *    arrive here with is_open false. Without the handling below they render
 *    with "Change your answer", which sends the learner to a page that refuses
 *    them: the same trap that was live all of 15-16 Sep, when the route briefly
 *    dropped the filter altogether and this card listed every closed drive
 *    under "Campus drives open to you".
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MyCdcDrive } from '@/hooks/cdc/use-my-cdc-drives';

const useMyCdcDrives = vi.fn();
vi.mock('@/hooks/cdc/use-my-cdc-drives', () => ({
  useMyCdcDrives: () => useMyCdcDrives(),
}));

import { CampusDrivesStudentCard } from '@/components/dashboard/campus-drives-student-card';

function drive(over: Partial<MyCdcDrive> = {}): MyCdcDrive {
  return {
    id: 'd1',
    title: 'Campus drive',
    // The three the fixture never carried. They were optional to this file
    // while nothing typechecked it; the PR-scoped gate compiles a test file the
    // moment a PR touches it, which is how a fixture that never matched
    // MyCdcDrive stayed unnoticed.
    status: 'willingness_open',
    drive_type_name: null,
    willingness_window_open_at: null,
    recruiter_name: 'Foxconn India',
    drive_date: '2026-10-01',
    job_role_title: 'Graduate Engineer',
    job_location: 'Chennai',
    expected_package_lpa: 4.5,
    willingness_window_close_at: null,
    willingness_status: null,
    // Open unless a test says otherwise. Added 16 Sep with the closed-drive
    // behaviour below — a fixture that omitted it made every drive read as
    // closed, which is the opposite of what these tests are about. The feed
    // TAGS each drive rather than filtering, so the default has to be open.
    is_open: true,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  useMyCdcDrives.mockReset();
});

describe('CampusDrivesStudentCard — stays out of the way', () => {
  it('renders nothing while loading', () => {
    useMyCdcDrives.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = render(<CampusDrivesStudentCard />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the learner has no open drive', () => {
    useMyCdcDrives.mockReturnValue({ data: [], isLoading: false, error: null });
    const { container } = render(<CampusDrivesStudentCard />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the request failed', () => {
    // A learner must never be shown a broken card for a feature they did not
    // ask for; silence is the correct failure mode here.
    useMyCdcDrives.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    });
    const { container } = render(<CampusDrivesStudentCard />);
    expect(container.innerHTML).toBe('');
  });
});

describe('CampusDrivesStudentCard — a shut window is never an invitation', () => {
  it('marks an unanswered closed drive Closed, and offers no way in', () => {
    // Paired with an open one, because a learner whose ONLY drive is closed and
    // unanswered sees no card at all (pinned separately below). Pairing them
    // also proves the open one keeps its button through the same render.
    useMyCdcDrives.mockReturnValue({
      data: [drive({ id: 'shut', is_open: false }), drive({ id: 'open' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);

    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.getByText(/can no longer be answered/i)).toBeTruthy();
    // Exactly one link: the open drive's. The willingness page refuses once the
    // window shuts, so a link on the closed one would be an invitation to be
    // turned away.
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/cdc/drives/open/willingness');
  });

  it('keeps showing the answer on a closed drive, rather than overwriting it with Closed', () => {
    // Their answer is the more useful thing to see; the closure is said in
    // words underneath.
    useMyCdcDrives.mockReturnValue({
      data: [drive({ is_open: false, willingness_status: 'willing' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);

    expect(screen.getByText(/You're in/i)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/Change your answer/i)).toBeNull();
  });

  it('does not count a closed drive as something to answer', () => {
    useMyCdcDrives.mockReturnValue({
      data: [drive({ id: 'shut', is_open: false }), drive({ id: 'open' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    // One of the two can actually be answered.
    expect(screen.getByText('1 to answer')).toBeTruthy();
  });

  it('still shows a closed drive the learner answered, so their answer is visible', () => {
    useMyCdcDrives.mockReturnValue({
      data: [drive({ is_open: false, willingness_status: 'confirmed' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText(/with the Career Development Centre/i)).toBeTruthy();
  });

  it('hides the whole card when everything is closed and nothing was answered', () => {
    // The self-hiding discipline this card shipped with: a learner with nothing
    // to do and no answer of their own gets no card at all.
    useMyCdcDrives.mockReturnValue({
      data: [drive({ is_open: false })],
      isLoading: false,
      error: null,
    });
    const { container } = render(<CampusDrivesStudentCard />);
    expect(container.innerHTML).toBe('');
  });
});

describe('CampusDrivesStudentCard — what it says', () => {
  it('shows the recruiter, the role and an invitation when undecided', () => {
    useMyCdcDrives.mockReturnValue({ data: [drive()], isLoading: false, error: null });
    render(<CampusDrivesStudentCard />);

    expect(screen.getByText('Foxconn India')).toBeTruthy();
    expect(screen.getByText('Graduate Engineer')).toBeTruthy();
    expect(screen.getByText(/Tell them you're interested/i)).toBeTruthy();
    expect(screen.getByText('1 to answer')).toBeTruthy();
  });

  it('links to that drive’s willingness page', () => {
    useMyCdcDrives.mockReturnValue({
      data: [drive({ id: 'abc-123' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/cdc/drives/abc-123/willingness');
  });

  it('acknowledges an answer already given instead of re-inviting', () => {
    useMyCdcDrives.mockReturnValue({
      data: [drive({ willingness_status: 'willing' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);

    expect(screen.getByText(/You're in/i)).toBeTruthy();
    expect(screen.getByText(/Change your answer/i)).toBeTruthy();
    expect(screen.queryByText(/Tell them you're interested/i)).toBeNull();
    // Nothing left to answer, so the count badge is gone.
    expect(screen.queryByText(/to answer/i)).toBeNull();
  });

  it('shows a declined drive as declined, still changeable', () => {
    useMyCdcDrives.mockReturnValue({
      data: [drive({ willingness_status: 'withdrawn' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(screen.getByText(/Change your answer/i)).toBeTruthy();
  });

  it('counts only the drives still awaiting an answer', () => {
    useMyCdcDrives.mockReturnValue({
      data: [
        drive({ id: 'a', recruiter_name: 'A Ltd' }),
        drive({ id: 'b', recruiter_name: 'B Ltd' }),
        drive({ id: 'c', recruiter_name: 'C Ltd', willingness_status: 'confirmed' }),
      ],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    expect(screen.getByText('2 to answer')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('warns when the window is about to close, but only for an unanswered drive', () => {
    const soon = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
    useMyCdcDrives.mockReturnValue({
      data: [drive({ willingness_window_close_at: soon })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    expect(screen.getByText(/closes in 2 days|closes tomorrow/i)).toBeTruthy();
  });

  it('does not show a stale deadline once the window has passed', () => {
    const past = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    useMyCdcDrives.mockReturnValue({
      data: [drive({ willingness_window_close_at: past })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    expect(screen.queryByText(/closes/i)).toBeNull();
  });
});

describe('CampusDrivesStudentCard — a shut window is not an invitation', () => {
  it('does not render a drive whose willingness window has closed', () => {
    // /api/cdc/drives/mine returns it (so /cdc/drives can show the learner what
    // they missed) tagged is_open:false. Every row on this card carries a call
    // to action, and that CTA leads to a page that would refuse them.
    useMyCdcDrives.mockReturnValue({
      data: [drive({ id: 'shut', is_open: false })],
      isLoading: false,
      error: null,
    });
    const { container } = render(<CampusDrivesStudentCard />);
    expect(container.firstChild).toBeNull();
  });

  it('still renders the open ones alongside a shut one', () => {
    useMyCdcDrives.mockReturnValue({
      data: [drive({ id: 'shut', is_open: false }), drive({ id: 'live' })],
      isLoading: false,
      error: null,
    });
    render(<CampusDrivesStudentCard />);
    // One invitation, not two.
    expect(screen.getAllByRole('link').length).toBe(1);
  });
});
