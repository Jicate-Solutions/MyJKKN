// @vitest-environment jsdom
//
// Director, 25 Sep 2026 (#21): the /meet/<handle>/<slug> booking link was shown
// nowhere copyable on Meetings → Manage. Each type now has a "Copy link" button;
// hidden types get it too, with a warning that the public page refuses them
// until made visible; no page / a switched-off or system-hidden page is said out loud.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/(routes)/meetings/manage/actions', () => ({
  addMyEventTypeLocation: vi.fn(),
  createMyEventType: vi.fn(),
  deleteMyEventType: vi.fn(),
  listMyScheduleChoices: vi.fn(async () => ({ success: true, data: { schedules: [], defaultScheduleId: null } })),
  moveOnlineMeetingsToOnlineHours: vi.fn(),
  removeMyEventTypeLocation: vi.fn(),
  updateMyEventType: vi.fn(),
}));

vi.mock('@/app/(routes)/meetings/manage/_components/venue-room-picker', () => ({
  VenueRoomPicker: () => null,
}));

import { EventTypesManager } from '@/app/(routes)/meetings/manage/_components/event-types-manager';
import type { ManageEventType } from '@/app/(routes)/meetings/manage/actions';

function type(over: Partial<ManageEventType>): ManageEventType {
  return {
    id: 't1',
    title: 'Interview',
    slug: 'interview',
    lengthInMinutes: 30,
    hidden: false,
    description: null,
    purposeGroup: null,
    locationMode: 'online',
    locationText: null,
    locationResourceId: null,
    locationResourceName: null,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 0,
    ...over,
  } as ManageEventType;
}

const writeText = vi.fn(async () => {});
beforeEach(() => {
  Object.values(toast).forEach((f) => f.mockReset());
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(cleanup);

const URL = `${window.location.origin}/meet/omm/interview`;

describe('Meetings → Manage: Copy link', () => {
  it('copies the full /meet/<handle>/<slug> address of that type', async () => {
    render(
      <EventTypesManager
        initialEventTypes={[type({})]}
        bookingPage={{ handle: 'omm', isPublic: true, autoHidden: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(toast.success).toHaveBeenCalledWith(`Link copied: ${URL}`);
  });

  it('a hidden type gets the button too, and warns the link will not open until it is visible', async () => {
    render(
      <EventTypesManager
        initialEventTypes={[type({ hidden: true })]}
        bookingPage={{ handle: 'omm', isPublic: true, autoHidden: false }}
      />,
    );
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning.mock.calls[0][0]).toContain('will not open for anyone until you make it visible');
  });

  it('a system-hidden page (Google disconnected) warns the link will not open', async () => {
    render(
      <EventTypesManager
        initialEventTypes={[type({})]}
        bookingPage={{ handle: 'omm', isPublic: true, autoHidden: true }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning.mock.calls[0][0]).toContain('reconnect Google');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a switched-off booking page still copies, with a warning that it will not open', async () => {
    render(
      <EventTypesManager
        initialEventTypes={[type({})]}
        bookingPage={{ handle: 'omm', isPublic: false, autoHidden: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning.mock.calls[0][0]).toContain('switched off');
  });

  it('no booking page yet → says so, copies nothing', async () => {
    render(<EventTypesManager initialEventTypes={[type({})]} bookingPage={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toContain("don't have a public booking page");
    expect(writeText).not.toHaveBeenCalled();
  });

  it('clipboard refused → the link is shown so it can be copied by hand', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(
      <EventTypesManager
        initialEventTypes={[type({})]}
        bookingPage={{ handle: 'omm', isPublic: true, autoHidden: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toContain(URL);
  });

  it('clipboard refused on a hidden type → the manual-copy message keeps the hidden warning', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(
      <EventTypesManager
        initialEventTypes={[type({ hidden: true })]}
        bookingPage={{ handle: 'omm', isPublic: true, autoHidden: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy the booking link for Interview' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toContain(URL);
    expect(toast.error.mock.calls[0][0]).toContain('will not open for anyone until you make it visible');
  });
});
