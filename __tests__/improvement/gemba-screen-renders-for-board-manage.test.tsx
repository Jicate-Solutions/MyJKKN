// @vitest-environment jsdom
/**
 * Regression guard for the gemba screen's TWO capabilities.
 *
 * The screen shipped twice with the same defect in different costumes. First it
 * gated on `improvement.ideas.view` alone and showed eight real officers a
 * no-access panel. Then the gate was widened, but "may browse every department"
 * and "may record a visit anywhere" were still one flag computed from
 * `improvement.area_role.assign`, so the six `mba_faculty` holders — who hold
 * `improvement.board.manage`, do not hold `area_role.assign`, and have zero
 * active postings — got past the gate onto a screen with nothing on it.
 *
 * The previous proof asserted only that the no-access panel was absent. That
 * assertion passes identically whether fourteen departments render or none do,
 * so it could not fail on the outcome that mattered for six of the eight
 * people. These tests assert what actually renders.
 *
 * Permission values below are the live production values, read by VALUE and not
 * by key existence — `cao` stores `improvement.ideas.view` as explicitly
 * `false`, which an existence test misreads as "has it".
 *
 * The Supabase browser client is faked, but `GembaService` itself is REAL, so
 * these tests also prove which queries the screen does and does not issue:
 * a browse-all holder must reach `listAllAreas()`, a posted associate must not.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Live production fixtures ----------------------------------------------

/** The 14 active rows of `improvement_areas`, in display_order. */
const AREA_LABELS = [
  'Admissions',
  'Fees & Finance',
  'Events',
  'Mess & Hostel',
  'HR',
  'Transport',
  'COE / Academic',
  'CDC / Placement',
  'IQAC / Accreditation',
  'Library',
  'Feedback / SCF',
  'Pharmacy',
  'Dental Hospital',
  'Procurement',
] as const;

const AREAS = AREA_LABELS.map((label, i) => ({
  id: `area-${i + 1}`,
  key: label.toLowerCase().replace(/[^a-z]+/g, '_'),
  label,
  gemba_interval_days: null,
  display_order: i + 1,
  is_active: true,
}));

const PROCUREMENT_ID = AREAS[AREAS.length - 1].id;
const ADMISSIONS_ID = AREAS[0].id;

/**
 * `custom_roles.permissions` as production stores it, verbatim. Absent keys are
 * absent; `cao`'s explicit `false` is preserved.
 */
const PRODUCTION_PERMISSIONS: Record<string, Record<string, boolean>> = {
  // 6 holders · board.manage only · ZERO active postings · not super admin.
  // This is the population the screen emptied.
  mba_faculty: { 'improvement.board.manage': true },
  // 45 holders · ideas.view only. Sees exactly the departments they are posted to.
  mba_associate: { 'improvement.ideas.view': true },
  // 1 holder each. Both hold area_role.assign, so both may record anywhere.
  cao: {
    'improvement.ideas.view': false,
    'improvement.board.manage': true,
    'improvement.area_role.assign': true,
  },
  // 483 holders · none of the three keys. Denied outright.
  faculty: {},
};

const VIEWER_ID = 'user-under-test';

// --- Fake Supabase browser client ------------------------------------------

const tables: Record<string, Record<string, unknown>[]> = {};
const queriedTables: string[] = [];

function makeBuilder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col] as never));
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: (table: string) => {
      queriedTables.push(table);
      return makeBuilder(table);
    },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: VIEWER_ID } } } }),
    },
    rpc: vi.fn(),
  }),
}));

// `next/link` needs the app-router context this test deliberately does not build.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// --- usePermissions, driven by the production permission objects ------------

const viewer: { roleKey: keyof typeof PRODUCTION_PERMISSIONS; isLoading: boolean } = {
  roleKey: 'mba_faculty',
  isLoading: false,
};

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => {
    const perms = PRODUCTION_PERMISSIONS[viewer.roleKey] ?? {};
    return {
      // Same shape as the real hook: value semantics, never key existence.
      can: (permission: string) => (viewer.isLoading ? false : perms[permission] === true),
      isLoading: viewer.isLoading,
      // Every holder of all four roles has is_super_admin = false in production.
      isSuperAdmin: false,
    };
  },
}));

import { GembaClient } from '@/app/(routes)/improvement-board/gemba/_components/gemba-client';

function seed({ postedAreaIds }: { postedAreaIds: string[] }) {
  for (const key of Object.keys(tables)) delete tables[key];
  queriedTables.length = 0;
  tables.improvement_areas = AREAS;
  tables.mba_associate_postings = postedAreaIds.map((area_id) => ({
    area_id,
    associate_user_id: VIEWER_ID,
    is_active: true,
  }));
  tables.mba_dept_artifacts = [
    {
      id: 'art-1',
      area_id: ADMISSIONS_ID,
      artifact_type: 'organogram',
      status: 'approved',
      version: 2,
      updated_at: null,
      official_at: null,
      official_until: null,
      official_by: null,
    },
    {
      id: 'art-2',
      area_id: PROCUREMENT_ID,
      artifact_type: 'sop',
      status: 'approved',
      version: 1,
      updated_at: null,
      official_at: null,
      official_until: null,
      official_by: null,
    },
  ];
  tables.gemba_observations = [];
  tables.gemba_observation_replies = [];
  tables.profiles = [];
}

function renderScreen() {
  return render(<GembaClient currentUserId={VIEWER_ID} currentUserName="The viewer" />);
}

/** The department chips — round buttons, one per department on screen. */
function departmentChips(): string[] {
  return screen
    .queryAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter((t) => (AREA_LABELS as readonly string[]).includes(t));
}

beforeEach(() => {
  viewer.roleKey = 'mba_faculty';
  viewer.isLoading = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('gemba screen — browse and record are two different capabilities', () => {
  it('board.manage with no posting sees every department, not an empty screen', async () => {
    viewer.roleKey = 'mba_faculty';
    seed({ postedAreaIds: [] });

    renderScreen();

    // The outcome that matters: the departments actually render. Asserting only
    // that the no-access panel is absent would pass on a blank screen too.
    await waitFor(() => {
      expect(departmentChips()).toHaveLength(AREA_LABELS.length);
    });
    expect(departmentChips()).toEqual([...AREA_LABELS]);

    // The panels below the picker render for the selected department.
    expect(
      await screen.findByRole('heading', { name: /Admissions — playbook documents/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Visits' })).toBeInTheDocument();

    // The browse query was actually issued — a browse-all holder has no posting
    // to fall back on, so this is the only source of the 14 above.
    expect(queriedTables).toContain('improvement_areas');
    expect(queriedTables).toContain('mba_dept_artifacts');
    expect(queriedTables).toContain('gemba_observations');

    // And neither costume of the defect is on screen.
    expect(
      screen.queryByText(/Gemba visits are for the Improvement Board/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/You are not posted to a department yet/)
    ).not.toBeInTheDocument();
  });

  it('board.manage still cannot record anywhere — reading is not writing', async () => {
    viewer.roleKey = 'mba_faculty';
    seed({ postedAreaIds: [] });

    renderScreen();
    await waitFor(() => expect(departmentChips()).toHaveLength(AREA_LABELS.length));

    // The record lane mirrors fn_gemba_observation_record, which grants the
    // write to area_role.assign alone. Widening it here would hand this person
    // a form the RPC then refuses.
    expect(
      screen.getByText(
        /You can read Admissions, but you are not posted there, so you cannot record a visit to it\./
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record a visit/ })).toBeDisabled();
  });

  it('a posted associate sees exactly their one department and may record there', async () => {
    viewer.roleKey = 'mba_associate';
    seed({ postedAreaIds: [PROCUREMENT_ID] });

    renderScreen();

    await waitFor(() => expect(departmentChips()).toEqual(['Procurement']));

    expect(
      await screen.findByRole('heading', { name: /Procurement — playbook documents/ })
    ).toBeInTheDocument();

    // Posted, so no read-only banner and the button is live.
    expect(screen.queryByText(/but you are not posted there/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record a visit/ })).toBeEnabled();

    // ideas.view alone must not reach the browse-everything query. The only
    // improvement_areas read is the `.in(id, ...)` lookup for their postings,
    // and it returned one row — proven by the single chip above.
    expect(departmentChips()).not.toContain('Admissions');
  });

  it('an officer with area_role.assign may record against any department', async () => {
    viewer.roleKey = 'cao';
    seed({ postedAreaIds: [] });

    renderScreen();

    await waitFor(() => expect(departmentChips()).toHaveLength(AREA_LABELS.length));
    expect(screen.queryByText(/but you are not posted there/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record a visit/ })).toBeEnabled();
  });

  it('a Senior Learner with none of the three keys is refused, and told who to ask', async () => {
    // custom_roles.role_key for the plain teaching role, 483 holders.
    viewer.roleKey = 'faculty';
    seed({ postedAreaIds: [] });

    renderScreen();

    const panel = await screen.findByText(/Gemba visits are for the Improvement Board/);
    expect(panel).toBeInTheDocument();
    expect(
      within(panel.closest('div') as HTMLElement).getByText(/contact your programme lead/)
    ).toBeInTheDocument();
    expect(departmentChips()).toEqual([]);
  });

  it('a still-loading permission set renders the skeleton, never the refusal', () => {
    viewer.roleKey = 'mba_faculty';
    viewer.isLoading = true;
    seed({ postedAreaIds: [] });

    renderScreen();

    expect(
      screen.queryByText(/Gemba visits are for the Improvement Board/)
    ).not.toBeInTheDocument();
    expect(departmentChips()).toEqual([]);
  });
});
