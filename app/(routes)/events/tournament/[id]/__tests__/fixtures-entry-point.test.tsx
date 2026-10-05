// @vitest-environment jsdom
// BUG-006252: the tournament detail page lost its Fixtures entry point in #2550,
// so an organiser had nowhere to record winners and runners-up. These tests pin
// a "Fixtures & results" card with one DivisionFixtures per division, managed
// for a manager and read-only for everyone else.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({ canManage: true }));
const fixturesProps = vi.hoisted(() => [] as any[]);

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: (p: any) => <a href={p.href}>{p.children}</a> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: (p: any) => <div>{p.children}</div>,
}));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));

vi.mock('@/hooks/events/use-tournaments', () => ({
  useTournament: () => ({
    isLoading: false,
    data: {
      id: 'ev-1',
      name: 'Intra Institution Games',
      status: 'draft',
      scope: 'institution',
      config: {},
      naac_criteria: [],
      divisions: [
        { id: 'd-1', sport: 'Cricket', age_band: 'U19', gender: 'boys', format: 'knockout' },
        { id: 'd-2', sport: 'Chess', age_band: 'Open', gender: 'open', format: 'round_robin' },
      ],
    },
  }),
  useUpdateTournament: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTournamentStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/events/use-tournament-registrations', () => ({
  useTournamentEntries: () => ({
    data: [
      { id: 'e1', division_id: 'd-1', status: 'confirmed', payment_status: 'paid' },
      { id: 'e2', division_id: 'd-1', status: 'confirmed', payment_status: 'paid' },
      { id: 'e3', division_id: 'd-1', status: 'withdrawn', payment_status: 'paid' },
      { id: 'e4', division_id: 'd-2', status: 'confirmed', payment_status: 'paid' },
    ],
  }),
}));
vi.mock('@/hooks/events/use-tournament-fixtures', () => ({
  useTournamentMatches: () => ({
    data: [{ id: 'm1', division_id: 'd-1', round_no: 1, status: 'pending' }],
  }),
}));
vi.mock('@/hooks/events/use-tournament-access', () => ({
  useTournamentAccess: () => ({
    isLoading: false,
    canView: true,
    canManage: state.canManage,
    canAssignIncharge: state.canManage,
    isIncharge: false,
    isTaskOnly: !state.canManage,
  }),
}));
vi.mock('@/hooks/events/shared/use-event-review-comment-access', () => ({
  useEventReviewCommentAccess: () => ({ isLoading: false, canView: false }),
}));

// Stub DivisionFixtures: we pin what the page hands it, not its own behaviour.
vi.mock('../_components/fixtures-section', () => ({
  DivisionFixtures: (p: any) => {
    fixturesProps.push(p);
    return <div data-testid={`division-fixtures-${p.divisionId}`} />;
  },
}));
vi.mock('../_components/incharge-panel', () => ({ InchargePanel: () => null }));
vi.mock('../_components/registration-form-card', () => ({ RegistrationFormCard: () => null }));
vi.mock('../../_components/edit-tournament-dialog', () => ({ EditTournamentDialog: () => null }));
vi.mock('@/components/events/feedback/event-feedback-link-card', () => ({
  EventFeedbackLinkCard: () => null,
}));
vi.mock('@/components/events/shared/naac-criteria-field', () => ({ NaacCriteriaChips: () => null }));
vi.mock('@/components/events/shared/event-logistics', () => ({ EventLogistics: () => null }));
vi.mock('@/components/events/shared/event-tasks-card', () => ({ EventTasksCard: () => null }));
vi.mock('@/components/events/shared/event-review-comments-card', () => ({
  EventReviewCommentsCard: () => null,
}));

import TournamentManagePage from '../page';

function lastPropsFor(divisionId: string) {
  return [...fixturesProps].reverse().find((p) => p.divisionId === divisionId);
}

describe('tournament detail page: Fixtures & results entry point (BUG-006252)', () => {
  beforeEach(() => {
    fixturesProps.length = 0;
  });
  afterEach(() => cleanup());

  it('shows a Fixtures & results card with one bracket per division for a manager', () => {
    state.canManage = true;
    render(<TournamentManagePage />);

    expect(screen.getByTestId('tournament-fixtures-card')).toBeTruthy();
    expect(screen.getByText('Fixtures & results')).toBeTruthy();
    expect(screen.getByTestId('division-fixtures-d-1')).toBeTruthy();
    expect(screen.getByTestId('division-fixtures-d-2')).toBeTruthy();

    const d1 = lastPropsFor('d-1');
    expect(d1).toMatchObject({ eventId: 'ev-1', entryCount: 2, divisionFormat: 'knockout', canManage: true });
    expect(d1.matches.map((m: any) => m.id)).toEqual(['m1']);
    const d2 = lastPropsFor('d-2');
    expect(d2).toMatchObject({ entryCount: 1, divisionFormat: 'round_robin', canManage: true });
    expect(d2.matches).toEqual([]);
  });

  it('renders the brackets read-only for a viewer who cannot manage', () => {
    state.canManage = false;
    render(<TournamentManagePage />);

    expect(screen.getByTestId('tournament-fixtures-card')).toBeTruthy();
    expect(lastPropsFor('d-1').canManage).toBe(false);
    expect(lastPropsFor('d-2').canManage).toBe(false);
  });
});
