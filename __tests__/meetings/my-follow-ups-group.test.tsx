// @vitest-environment jsdom

/**
 * What a person SEES on one "My Follow-ups" meeting card.
 *
 * listForProfile nulls the meeting header for a viewer outside the booking's
 * invited set (see my-follow-ups.test.ts). This file pins the half that
 * reaches a human: such a viewer reads a neutral heading, with no date, no
 * status badge and no link, and the Mark-all-done dialog does not name the
 * meeting either — while the host still sees, and is asked about, the meeting
 * by name. The card is rendered for real; only the server actions are stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { FollowUpMeetingGroup } from '@/lib/services/meetings/meeting-action-item-service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/(routes)/meetings/action-items/actions', () => ({
  markMeetingFollowUpsDoneAction: vi.fn(async () => ({ success: true, updated: 0 })),
  setFollowUpStatusAction: vi.fn(async () => ({ success: true })),
}));

import {
  FollowUpGroup,
  NOT_INVITED_HEADING,
} from '@/app/(routes)/meetings/action-items/_components/follow-up-group';

afterEach(() => cleanup());

function item(id: string, band: 'yours' | 'others' | 'unassigned') {
  return {
    id,
    booking_id: 'b-1',
    action_text: `do ${id}`,
    owner_label: null,
    owner_profile_id: null,
    owner_name: null,
    due_date: null,
    status: 'open' as const,
    band,
  };
}

const HOST_GROUP: FollowUpMeetingGroup = {
  booking_id: 'b-1',
  viewer_invited: true,
  booking_uid: 'uid-1',
  attendee_name: 'Asha',
  start_time: '2026-09-20T05:00:00Z',
  booking_status: 'cancelled',
  meeting_title: 'Review',
  viewer_is_host: true,
  items: [item('a', 'yours'), item('b', 'others')],
};

const OUTSIDER_GROUP: FollowUpMeetingGroup = {
  booking_id: 'b-1',
  viewer_invited: false,
  booking_uid: null,
  attendee_name: null,
  start_time: null,
  booking_status: null,
  meeting_title: null,
  viewer_is_host: false,
  items: [item('a', 'yours')],
};

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /mark all done/i }));
  return screen.getByRole('alertdialog');
}

describe('FollowUpGroup — the meeting header', () => {
  it('the host sees the meeting by name, its date, the cancelled badge and a link', () => {
    render(<FollowUpGroup group={HOST_GROUP} />);
    expect(screen.getByText('Review with Asha')).toBeTruthy();
    expect(screen.getByText('Meeting cancelled')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/meetings/uid-1');
    expect(screen.queryByText(NOT_INVITED_HEADING)).toBeNull();
  });

  it('the Mark-all-done dialog for the host still names the meeting', () => {
    render(<FollowUpGroup group={HOST_GROUP} />);
    const dialog = openDialog();
    expect(dialog.textContent).toContain(
      'All 2 open follow-ups from Review with Asha will be marked done.',
    );
  });

  it('a viewer outside the invited set sees the neutral heading — no date, badge or link', () => {
    const { container } = render(<FollowUpGroup group={OUTSIDER_GROUP} />);
    expect(screen.getByText(NOT_INVITED_HEADING)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Meeting cancelled')).toBeNull();
    expect(screen.queryByText('Date not recorded')).toBeNull();
    expect(container.textContent).not.toContain('Meeting with');
    // Their own follow-up is still there to tick off.
    expect(screen.getByText('do a')).toBeTruthy();
  });

  it('the outsider’s Mark-all-done dialog does not name the meeting', () => {
    render(<FollowUpGroup group={OUTSIDER_GROUP} />);
    const dialog = openDialog();
    expect(dialog.textContent).toContain('Your open follow-ups from this meeting will be marked done.');
    expect(dialog.textContent).not.toMatch(/from Meeting/);
  });
});
