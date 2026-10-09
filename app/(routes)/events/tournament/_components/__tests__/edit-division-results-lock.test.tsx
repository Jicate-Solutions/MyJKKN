// @vitest-environment jsdom
// BALAM-2K26 (8 Oct 2026): a women's Chess knockout division with 7 recorded
// results was turned into "Athletics - 400 m" from the Edit dialog. Once a
// division has recorded results its sport, category and format must stay put;
// the dialog says so up front and the database trigger is the backstop.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ matches: [] as any[] }));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/events/use-tournaments', () => ({
  useTournament: () => ({
    isLoading: false,
    data: {
      id: 'ev-1',
      divisions: [
        {
          id: 'd-chess',
          event_id: 'ev-1',
          sport: 'Chess',
          gender: 'female',
          age_band: null,
          format: 'knockout',
          level: 'intra_college',
          max_teams: null,
          eligibility: {},
          config: {},
          sort_order: 0,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
    },
  }),
  useUpdateTournament: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateDivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/events/use-tournament-registrations', () => ({
  useTournamentEntries: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/events/use-tournament-fixtures', () => ({
  useTournamentMatches: () => ({ data: state.matches }),
}));
vi.mock('@/hooks/organization/use-institutions-with-access', () => ({
  useInstitutionsWithAccess: () => ({ institutions: [], loading: false }),
}));
vi.mock('../host-institutions-picker', () => ({
  HostInstitutionsPicker: () => null,
  hostInstitutionsDto: () => ({}),
}));
vi.mock('@/components/events/shared/naac-criteria-field', () => ({
  NaacCriteriaField: () => null,
}));

import { EditTournamentDialog } from '../edit-tournament-dialog';

const tournament = {
  id: 'ev-1',
  name: 'BALAM-2K26',
  status: 'published',
  institution_id: 'inst-1',
  naac_criteria: [],
} as any;

const renderDialog = () =>
  render(
    <EditTournamentDialog open onClose={() => {}} tournament={tournament} onSaved={() => {}} />
  );

const isDisabled = (name: string) =>
  (screen.getByRole('combobox', { name }) as HTMLButtonElement).disabled;

afterEach(() => {
  cleanup();
  state.matches = [];
});

describe('Edit dialog — division with recorded results', () => {
  it('locks sport, category and format and says why', () => {
    state.matches = [
      { id: 'm1', division_id: 'd-chess', status: 'completed' },
      { id: 'm2', division_id: 'd-chess', status: 'pending' },
    ];
    renderDialog();
    expect(isDisabled('Sport')).toBe(true);
    expect(isDisabled('Category')).toBe(true);
    expect(isDisabled('Format')).toBe(true);
    expect(screen.getByText(/already has recorded results/)).toBeTruthy();
  });

  it('leaves them editable when no result is recorded yet', () => {
    state.matches = [
      { id: 'm1', division_id: 'd-chess', status: 'scheduled' },
      { id: 'm2', division_id: 'd-other', status: 'completed' },
    ];
    renderDialog();
    expect(isDisabled('Sport')).toBe(false);
    expect(isDisabled('Format')).toBe(false);
    expect(screen.queryByText(/already has recorded results/)).toBeNull();
  });
});

describe('Database guard — trg_tournament_division_results_lock', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const guard = readFileSync(
    join(dir, '20271009120000_tournament_division_results_lock.sql'),
    'utf8'
  );
  const manual = readFileSync(join(dir, '20271007170000_tournament_manual_fixtures.sql'), 'utf8');
  const norm = (s: string) => s.replace(/\s+/g, ' ');

  it('uses the same "results are recorded" predicate as the fixture-mode switch', () => {
    const predicate = "status IN ('completed', 'walkover', 'disqualified')";
    expect(norm(manual)).toContain(predicate);
    expect(norm(guard)).toContain(predicate);
    expect(norm(guard)).toContain('FROM tournament_matches WHERE division_id = OLD.id');
    // Heats divisions keep results per runner, not per match.
    expect(norm(guard)).toContain('FROM tournament_heat_entries WHERE division_id = OLD.id');
  });

  it('fires before an update and blocks sport, category and format changes', () => {
    const g = norm(guard);
    expect(g).toContain(
      'BEFORE UPDATE OF sport, gender, format ON public.tournament_divisions FOR EACH ROW'
    );
    for (const col of ['sport', 'gender', 'format']) {
      expect(g).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    expect(g).toMatch(/RAISE EXCEPTION 'This division already has recorded results/);
    expect(g).toContain('SET search_path = public');
    expect(g).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_tournament_division_results_lock\(\) FROM PUBLIC, anon, authenticated/
    );
  });
});
