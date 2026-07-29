// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const eventState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-general-events', () => ({
  useGeneralEvent: () => ({ data: eventState.data, isLoading: eventState.isLoading }),
}));

const accessState = { canManage: true, isLoading: false };
vi.mock('@/hooks/events/use-event-access', () => ({
  useEventAccess: () => ({ ...accessState, canView: true, isIncharge: false }),
}));

// EventLogistics pulls in a dozen boards whose services build Supabase clients.
vi.mock('@/components/events/shared/event-logistics', () => ({
  EventLogistics: () => <div data-testid="logistics" />,
}));
vi.mock('@/components/events/shared/registration-form-card', () => ({
  RegistrationFormCard: () => <div data-testid="form-card" />,
}));

import GeneralEventDetailPage from '@/app/(routes)/events/[id]/page';

const LECTURE = {
  id: 'ev-1',
  name: 'JKKN School of Influencer',
  event_type: 'lecture',
  status: 'planning',
  event_date: '2026-07-29',
  venue: 'Auditorium',
  config: {},
};

beforeEach(() => {
  replace.mockClear();
  eventState.data = LECTURE;
  eventState.isLoading = false;
  accessState.canManage = true;
  accessState.isLoading = false;
});
afterEach(() => cleanup());

describe('GeneralEventDetailPage', () => {
  it('renders the event name and its logistics for a manager', () => {
    render(<GeneralEventDetailPage />);
    expect(screen.getByText('JKKN School of Influencer')).toBeInTheDocument();
    expect(screen.getByTestId('logistics')).toBeInTheDocument();
  });

  it('offers a copy-link button to a manager', () => {
    render(<GeneralEventDetailPage />);
    expect(screen.getByRole('button', { name: /copy registration link/i })).toBeInTheDocument();
  });

  it('hides the share link and logistics from a non-manager', () => {
    accessState.canManage = false;
    render(<GeneralEventDetailPage />);
    expect(screen.queryByRole('button', { name: /copy registration link/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('logistics')).not.toBeInTheDocument();
  });

  it('redirects a tournament to its own console', () => {
    eventState.data = { ...LECTURE, event_type: 'sports_tournament' };
    render(<GeneralEventDetailPage />);
    expect(replace).toHaveBeenCalledWith('/events/tournament/ev-1');
  });

  it('shows a skeleton while loading, never a blank page', () => {
    eventState.data = null;
    eventState.isLoading = true;
    const { container } = render(<GeneralEventDetailPage />);
    // <Skeleton> applies animate-pulse itself — asserting on it proves a
    // skeleton rendered rather than a blank page.
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('reports a missing event instead of crashing', () => {
    eventState.data = null;
    eventState.isLoading = false;
    render(<GeneralEventDetailPage />);
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
