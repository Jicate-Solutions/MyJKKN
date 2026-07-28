// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRegistrationRow } from '@/lib/services/events/shared/event-registrations-service';

// Importing EVENT_LOGISTICS_TABS pulls in every sibling board, and several of
// their services build a Supabase browser client in a STATIC INITIALIZER — which
// throws without NEXT_PUBLIC_* env vars. Stubbing the client factory keeps this
// test about the registry, not about env configuration.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
}));

// The shared DataTable gates its rows on usePermissions(), which needs the auth
// provider tree. Granting super-admin keeps these assertions about the board's
// own behaviour; the board's real permission surface (Export) is driven by the
// canManage prop, which is asserted directly below.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canAccess: () => true,
    isSuperAdmin: true,
    isAdmissionGlobalUser: false,
    isCounselorUser: false,
    isLoading: false,
  }),
}));

const state: { rows: EventRegistrationRow[]; isLoading: boolean; isError: boolean } = {
  rows: [],
  isLoading: false,
  isError: false,
};

vi.mock('@/hooks/events/shared/use-event-registrations', () => ({
  useEventRegistrations: () => ({
    data: state.rows,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: vi.fn(),
  }),
}));

// Organizer mutations moved here from the tournament detail page; stub them so
// the assertions are about which buttons appear, not about network behaviour.
vi.mock('@/hooks/events/use-tournament-registrations', () => ({
  useMarkEntryPaid: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useWithdrawEntry: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useGeneratePaymentLink: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

// The board reads divisions (for the entry-fee strip) via useTournament, a real
// useQuery that would otherwise need a QueryClientProvider. useUpdateDivision is
// stubbed for the same reason — DivisionFeeBadge calls it on mount.
vi.mock('@/hooks/events/use-tournaments', () => ({
  useTournament: () => ({
    data: {
      id: 'ev-1',
      divisions: [
        {
          id: 'div-1',
          sport: 'Volleyball',
          age_band: 'Age 19 to 24',
          gender: 'open',
          config: { entry_fee: 1 },
        },
      ],
    },
    isLoading: false,
  }),
  useUpdateDivision: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

import { RegistrationsBoard } from '@/components/events/shared/registrations-board';
import { EVENT_LOGISTICS_TABS } from '@/components/events/shared/event-logistics';

const ROW: EventRegistrationRow = {
  id: 'reg-1',
  participant_name: 'Testing',
  participant_phone: '9000000000',
  participant_email: 'a@b.com',
  participant_type: 'internal',
  institution_name: 'Pharmacy college',
  status: 'registered',
  payment_status: 'paid',
  payment_amount: 1,
  payment_method: 'razorpay',
  source: 'tournament_self',
  checked_in: false,
  created_at: '2026-07-28T05:39:03.503Z',
  division_label: 'Volleyball · Age 19 to 22',
  entry_name: 'Eagles',
  entry_type: 'team',
  entry_id: 'entry-1',
  entry_status: 'registered',
  custom_answers: [
    { label: 'Team Captain Name?', value: 'Testing' },
    { label: 'Age Category - Is it 18-24?', value: '18-24' },
  ],
};

beforeEach(() => {
  state.rows = [ROW];
  state.isLoading = false;
  state.isError = false;
});
afterEach(() => cleanup());

describe('RegistrationsBoard', () => {
  it('renders a row for each registration', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('Pharmacy college')).toBeInTheDocument();
  });

  it('shows the division for a tournament', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByText('Volleyball · Age 19 to 22')).toBeInTheDocument();
  });

  it('omits the division column for non-tournament events', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="marathon" canManage />);
    expect(screen.queryByText('Volleyball · Age 19 to 22')).not.toBeInTheDocument();
  });

  it('shows custom answers under their labels in the detail dialog', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    fireEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(screen.getByText('Team Captain Name?')).toBeInTheDocument();
    expect(screen.getByText('Age Category - Is it 18-24?')).toBeInTheDocument();
    expect(screen.getByText('18-24')).toBeInTheDocument();
  });

  it('hides Export from users who cannot manage the event', () => {
    render(
      <RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage={false} />
    );
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

  it('shows Export to managers', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('shows an empty state rather than an error when nobody has registered', () => {
    state.rows = [];
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByText(/no registrations yet/i)).toBeInTheDocument();
  });

  it('counts totals from the rows it already has', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});

// These three actions moved here from the tournament detail page's division
// cards. If they regress, an organizer has no way to withdraw a team or record
// an offline payment anywhere in the UI.
describe('RegistrationsBoard organizer actions', () => {
  it('offers Withdraw on a tournament entry', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByTitle('Withdraw entry')).toBeInTheDocument();
  });

  it('hides Withdraw from users who cannot manage the event', () => {
    render(
      <RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage={false} />
    );
    expect(screen.queryByTitle('Withdraw entry')).not.toBeInTheDocument();
  });

  it('hides entry actions on non-tournament events, which have no entry rows', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="marathon" canManage />);
    expect(screen.queryByTitle('Withdraw entry')).not.toBeInTheDocument();
  });

  it('hides Withdraw once an entry is already withdrawn', () => {
    state.rows = [{ ...ROW, entry_status: 'withdrawn' }];
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.queryByTitle('Withdraw entry')).not.toBeInTheDocument();
  });

  it('shows payment actions only while the entry is unpaid', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    // ROW is paid — no payment actions.
    expect(screen.queryByTitle('Mark paid (offline)')).not.toBeInTheDocument();

    cleanup();
    state.rows = [{ ...ROW, payment_status: 'pending' }];
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByTitle('Mark paid (offline)')).toBeInTheDocument();
    expect(screen.getByTitle('Generate online payment link')).toBeInTheDocument();
  });

  it('offers no entry actions when the registration has no tournament entry', () => {
    state.rows = [{ ...ROW, entry_id: null, payment_status: 'pending' }];
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.queryByTitle('Withdraw entry')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mark paid (offline)')).not.toBeInTheDocument();
  });
});

// Entry fee moved here from the division cards. It is per-division, so the strip
// must key off the divisions list, not the event.
describe('RegistrationsBoard entry fees', () => {
  it('shows an editable fee per division on a tournament', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage />);
    expect(screen.getByText('Entry fees')).toBeInTheDocument();
    expect(screen.getByText('Volleyball · Age 19 to 24')).toBeInTheDocument();
    expect(screen.getByTitle("Set this division's entry fee")).toBeInTheDocument();
  });

  it('renders the fee read-only for users who cannot manage the event', () => {
    render(
      <RegistrationsBoard eventId="ev-1" eventType="sports_tournament" canManage={false} />
    );
    expect(screen.getByText('Entry fees')).toBeInTheDocument();
    expect(screen.queryByTitle("Set this division's entry fee")).not.toBeInTheDocument();
  });

  it('omits the fee strip entirely for non-tournament events', () => {
    render(<RegistrationsBoard eventId="ev-1" eventType="marathon" canManage />);
    expect(screen.queryByText('Entry fees')).not.toBeInTheDocument();
  });
});

describe('EVENT_LOGISTICS_TABS registry', () => {
  it('registers a registrations tab', () => {
    const tab = EVENT_LOGISTICS_TABS.find((t) => t.key === 'registrations');
    expect(tab).toBeDefined();
    expect(tab?.label).toBe('Registrations');
    expect(tab?.eventTypes).toBe('all');
  });

  it('puts registrations first, ahead of sponsors', () => {
    expect(EVENT_LOGISTICS_TABS[0]?.key).toBe('registrations');
  });
});
