// @vitest-environment jsdom

/**
 * The learner's campus-drive card.
 *
 * Two behaviours carry real weight and are pinned here:
 *
 * 1. It must be INVISIBLE unless the learner actually has an open drive. This
 *    card sits on every learner's dashboard; a version that renders an empty
 *    shell, a spinner, or an error box would put permanent clutter in front of
 *    thousands of learners who have nothing to answer.
 * 2. The call to action must reflect whether they have already answered, because
 *    the card is the entry point to a decision the Career Development Centre
 *    acts on. Showing "tell them you're interested" to someone already signed up
 *    invites a double answer and makes the card untrustworthy.
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
    recruiter_name: 'Foxconn India',
    drive_date: '2026-10-01',
    job_role_title: 'Graduate Engineer',
    job_location: 'Chennai',
    expected_package_lpa: 4.5,
    willingness_window_close_at: null,
    willingness_status: null,
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
