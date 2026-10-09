// @vitest-environment jsdom
// BALAM-2K26 (8 Oct 2026): a women's Chess knockout division with 7 recorded
// results was turned into "Athletics - 400 m" from the Edit dialog. Once a
// division has recorded results its sport, category and format must stay put;
// the dialog says so up front and the database trigger is the backstop.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ matches: [] as any[], heats: [] as any[], superAdmin: false }));
const calls = vi.hoisted(() => ({ order: [] as string[], divisionFails: false }));

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
  useUpdateTournament: () => ({
    mutateAsync: async () => {
      calls.order.push('tournament');
    },
    isPending: false,
  }),
  useUpdateDivision: () => ({
    mutateAsync: async () => {
      calls.order.push('division');
      if (calls.divisionFails) throw new Error('This division already has recorded results');
    },
    isPending: false,
  }),
  useCreateDivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDivision: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/events/use-tournament-registrations', () => ({
  useTournamentEntries: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/events/use-tournament-fixtures', () => ({
  useTournamentMatches: () => ({ data: state.matches }),
  useTournamentHeats: () => ({ data: state.heats }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isSuperAdmin: state.superAdmin }),
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
  state.heats = [];
  state.superAdmin = false;
  calls.order = [];
  calls.divisionFails = false;
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

describe('Edit dialog — super admin override (Director ruling, 9 Oct 2026)', () => {
  const OVERRIDE_NOTE = /You can change it as super admin; the change is recorded/;

  it('keeps the controls enabled for a super admin and warns that the change is recorded', () => {
    state.superAdmin = true;
    state.matches = [{ id: 'm1', division_id: 'd-chess', status: 'completed' }];
    renderDialog();
    expect(isDisabled('Sport')).toBe(false);
    expect(isDisabled('Category')).toBe(false);
    expect(isDisabled('Format')).toBe(false);
    expect(screen.getByText(OVERRIDE_NOTE)).toBeTruthy();
    expect(screen.queryByText(/already has recorded results/)).toBeNull();
  });

  it('keeps them locked for an organiser, without the super admin warning', () => {
    state.matches = [{ id: 'm1', division_id: 'd-chess', status: 'completed' }];
    renderDialog();
    expect(isDisabled('Sport')).toBe(true);
    expect(screen.queryByText(OVERRIDE_NOTE)).toBeNull();
  });

  it('shows no warning to a super admin when there are no results', () => {
    state.superAdmin = true;
    renderDialog();
    expect(isDisabled('Sport')).toBe(false);
    expect(screen.queryByText(OVERRIDE_NOTE)).toBeNull();
  });
});

const heat = (athlete: Record<string, unknown>) => ({
  id: 'h1',
  division_id: 'd-chess',
  heat_no: 1,
  status: 'pending',
  athletes: [
    { id: 'a1', heat_id: 'h1', entry_id: 'e1', position: null, mark: null, mark_value: null, result_status: 'ok', ...athlete },
  ],
});

describe('Edit dialog — heats division with recorded results', () => {
  it('locks the controls when an athlete has a mark, a place or DNS/DNF/DQ', () => {
    for (const athlete of [{ mark_value: 58.2 }, { position: 1 }, { result_status: 'dnf' }]) {
      state.heats = [heat(athlete)];
      renderDialog();
      expect(isDisabled('Sport')).toBe(true);
      expect(isDisabled('Format')).toBe(true);
      cleanup();
    }
  });

  it('leaves them editable when the heats are drawn but no result is in', () => {
    state.heats = [heat({ lane_no: 3 })];
    renderDialog();
    expect(isDisabled('Sport')).toBe(false);
  });
});

describe('Edit dialog — save order', () => {
  it('saves the division first and stops when the database refuses it', async () => {
    calls.divisionFails = true;
    renderDialog();
    fireEvent.change(screen.getByLabelText('Age Band'), { target: { value: 'U-19' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(calls.order).toEqual(['division']));
    // Give a wrongly ordered submit a chance to reach the tournament update.
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.order).toEqual(['division']);
  });

  it('saves the tournament after a successful division update', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Age Band'), { target: { value: 'U-19' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(calls.order).toEqual(['division', 'tournament']));
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

  it('makes every result write take FOR SHARE on the division row (race with an edit)', () => {
    const g = norm(guard);
    expect(g).toContain('PERFORM 1 FROM tournament_divisions WHERE id = NEW.division_id FOR SHARE');
    expect(g).toContain(
      'BEFORE INSERT OR UPDATE ON public.tournament_matches FOR EACH ROW EXECUTE FUNCTION public.fn_tournament_result_lock_division()'
    );
    expect(g).toContain(
      'BEFORE INSERT OR UPDATE ON public.tournament_heat_entries FOR EACH ROW EXECUTE FUNCTION public.fn_tournament_result_lock_division()'
    );
  });

  it('lets a super admin through and records who, when and old/new values', () => {
    const g = norm(guard);
    expect(g).toContain('IF COALESCE(public.is_super_admin(), false) THEN INSERT INTO tournament_division_lock_overrides');
    expect(g).toContain('(OLD.id, OLD.event_id, auth.uid(), now(), OLD.sport, NEW.sport, OLD.gender, NEW.gender, OLD.format, NEW.format)');
    expect(g).toContain('ALTER TABLE public.tournament_division_lock_overrides ENABLE ROW LEVEL SECURITY');
    expect(g).toContain('REVOKE ALL ON public.tournament_division_lock_overrides FROM PUBLIC, anon, authenticated');
  });
});
