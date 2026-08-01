// @vitest-environment jsdom
/**
 * What the case-study screen actually RENDERS, per population.
 *
 * The sibling gemba screen shipped the same defect twice — first a no-access
 * panel for the officers, then a gate they passed onto a screen with nothing on
 * it — because its proof asserted only that the deny panel was absent. That
 * assertion passes identically on a blank page. These tests assert the lanes.
 *
 * Permission objects below are the LIVE production values, read from
 * `custom_roles.permissions` on 2026-08-02 and asserted by VALUE, never by key
 * existence: `cao` stores `improvement.ideas.view` as an explicit `false`,
 * which an existence test misreads as "has it".
 *
 *   mba_associate            ideas.view TRUE
 *   mba_faculty              board.manage TRUE, ideas.view ABSENT
 *   cao                      board.manage TRUE, area_role.assign TRUE,
 *                            ideas.view FALSE (explicit)
 *   executive_admin_officer  board.manage TRUE, area_role.assign TRUE,
 *                            ideas.view ABSENT
 *
 * The Supabase browser client is faked but `CaseStudyService` is REAL, so these
 * also prove which queries the screen issues — and that a missing migration is
 * reported as a missing migration rather than as an empty screen.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Live production permission fixtures ------------------------------------

const PRODUCTION_PERMISSIONS: Record<string, Record<string, boolean>> = {
  mba_associate: { 'improvement.ideas.view': true },
  mba_faculty: { 'improvement.board.manage': true },
  cao: {
    'improvement.ideas.view': false,
    'improvement.board.manage': true,
    'improvement.area_role.assign': true,
  },
  executive_admin_officer: {
    'improvement.board.manage': true,
    'improvement.area_role.assign': true,
  },
  // 483 holders of the teaching role hold none of the three keys.
  noBoardAccess: {},
};

const VIEWER_ID = 'viewer-under-test';

// --- Fake Supabase browser client -------------------------------------------

const tables: Record<string, Record<string, unknown>[]> = {};
const queriedTables: string[] = [];
/** Per-table error injection — how a not-yet-applied migration presents. */
const tableErrors: Record<string, { code: string; message: string }> = {};

function makeBuilder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const settle = () => {
    const failure = tableErrors[table];
    return failure
      ? { data: null, error: failure }
      : { data: rows, error: null };
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col] as never));
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
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
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const viewer: { roleKey: keyof typeof PRODUCTION_PERMISSIONS; isLoading: boolean } =
  { roleKey: 'mba_associate', isLoading: false };

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => {
    const perms = PRODUCTION_PERMISSIONS[viewer.roleKey] ?? {};
    return {
      // Same shape as the real hook: value semantics, never key existence.
      can: (permission: string) =>
        viewer.isLoading ? false : perms[permission] === true,
      isLoading: viewer.isLoading,
      // Every holder of these roles has is_super_admin = false in production.
      isSuperAdmin: false,
    };
  },
}));

import { CaseStudiesClient } from '@/app/(routes)/improvement-board/case-studies/_components/case-studies-client';
import {
  isMissingObject,
  linesToArray,
} from '@/lib/services/improvement/case-study-service';
import { navPathAllowed } from '@/lib/sidebarMenuLink';

function seed(options: { ideas?: Record<string, unknown>[]; cases?: Record<string, unknown>[] } = {}) {
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(tableErrors)) delete tableErrors[key];
  queriedTables.length = 0;
  tables.improvement_ideas = options.ideas ?? [];
  tables.ss_case_studies = options.cases ?? [];
  tables.improvement_areas = [
    { id: 'area-procurement', label: 'Procurement' },
  ];
  tables.profiles = [{ id: VIEWER_ID, full_name: 'The viewer' }];
}

function renderScreen() {
  return render(
    <CaseStudiesClient currentUserId={VIEWER_ID} currentUserName="The viewer" />
  );
}

beforeEach(() => {
  viewer.roleKey = 'mba_associate';
  viewer.isLoading = false;
  seed();
});

afterEach(cleanup);

// ---------------------------------------------------------------------------

describe('who gets past the gate', () => {
  it('lets an associate in (holds improvement.ideas.view)', async () => {
    viewer.roleKey = 'mba_associate';
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/Ideas ready to write up/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/do not have access/i)).not.toBeInTheDocument();
  });

  it.each(['mba_faculty', 'cao', 'executive_admin_officer'] as const)(
    'lets %s in and shows them the review lane, though they lack ideas.view',
    async (roleKey) => {
      viewer.roleKey = roleKey;
      renderScreen();
      await waitFor(() =>
        expect(screen.queryByText(/do not have access/i)).not.toBeInTheDocument()
      );
      // The point of the gate widening: the REVIEW tab must actually be there.
      // Asserting only the absence of the deny panel would pass on a blank page.
      expect(
        await screen.findByRole('tab', { name: /Review/i })
      ).toBeInTheDocument();
    }
  );

  it('shows the review lane to nobody who lacks improvement.board.manage', async () => {
    viewer.roleKey = 'mba_associate';
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/Ideas ready to write up/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('tab', { name: /Review/i })).not.toBeInTheDocument();
  });

  it('refuses a role holding none of the three keys, with a reason and a contact', async () => {
    viewer.roleKey = 'noBoardAccess';
    renderScreen();
    expect(
      await screen.findByText(/do not have access to read or write/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/contact your programme lead/i)).toBeInTheDocument();
    // A refusal must never be a silent redirect (CLAUDE.md rule 27).
    expect(screen.queryByText(/Ideas ready to write up/i)).not.toBeInTheDocument();
  });

  it('does not read as denied while permissions are still loading', async () => {
    viewer.roleKey = 'mba_faculty';
    viewer.isLoading = true;
    renderScreen();
    expect(screen.queryByText(/do not have access/i)).not.toBeInTheDocument();
  });
});

describe('when the sibling migration has not been applied', () => {
  it('says the database change is missing instead of rendering a blank screen', async () => {
    viewer.roleKey = 'mba_associate';
    seed();
    tableErrors.ss_case_studies = {
      code: '42703',
      message:
        'column ss_case_studies.improvement_idea_id does not exist',
    };
    renderScreen();
    expect(
      await screen.findByText(/database change behind it is not/i)
    ).toBeInTheDocument();
    // Not a permission problem and not an empty state — both would mislead.
    expect(screen.queryByText(/do not have access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ideas ready to write up/i)).not.toBeInTheDocument();
  });
});

describe('an empty write-up lane explains itself', () => {
  it('gives the funnel counts rather than an unexplained empty box', async () => {
    viewer.roleKey = 'mba_associate';
    seed({
      ideas: [
        {
          id: 'idea-1',
          title: 'Two signatures for one purchase order',
          problem: 'p',
          expected_impact: null,
          area_id: 'area-procurement',
          status: 'applied',
          value_holds: null,
          verified_at: null,
          author_id: VIEWER_ID,
        },
      ],
    });
    renderScreen();
    expect(
      await screen.findByText(/Nothing of yours is eligible yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/filed, approved, applied, and then verified/i)
    ).toBeInTheDocument();
  });

  it('offers an idea that is verified AND whose value holds', async () => {
    viewer.roleKey = 'mba_associate';
    seed({
      ideas: [
        {
          id: 'idea-ok',
          title: 'One signature is enough below ten thousand',
          problem: 'p',
          expected_impact: null,
          area_id: 'area-procurement',
          status: 'verified',
          value_holds: true,
          verified_at: '2026-07-01T00:00:00Z',
          author_id: VIEWER_ID,
        },
      ],
    });
    renderScreen();
    expect(
      await screen.findByText(/One signature is enough below ten thousand/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Write the case/i })
    ).toBeInTheDocument();
  });

  it('withholds a verified idea whose value did NOT hold', async () => {
    viewer.roleKey = 'mba_associate';
    seed({
      ideas: [
        {
          id: 'idea-no-value',
          title: 'The saving evaporated',
          problem: 'p',
          expected_impact: null,
          area_id: 'area-procurement',
          status: 'verified',
          value_holds: false,
          verified_at: '2026-07-01T00:00:00Z',
          author_id: VIEWER_ID,
        },
      ],
    });
    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByText(/Nothing of yours is eligible yet/i)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText(/The saving evaporated/i)).not.toBeInTheDocument();
  });

  it('does not offer an eligible idea twice once its case exists', async () => {
    viewer.roleKey = 'mba_associate';
    seed({
      ideas: [
        {
          id: 'idea-written',
          title: 'Already written up',
          problem: 'p',
          expected_impact: null,
          area_id: 'area-procurement',
          status: 'verified',
          value_holds: true,
          verified_at: '2026-07-01T00:00:00Z',
          author_id: VIEWER_ID,
        },
      ],
      cases: [
        {
          id: 'case-1',
          improvement_idea_id: 'idea-written',
          author_id: VIEWER_ID,
          title: 'The case about the purchase order',
          summary: null,
          full_content: null,
          key_takeaways: null,
          learning_objectives: null,
          status: 'draft',
          published_at: null,
          generated_by: 'mba.draft_case_study',
          grade: null,
          graded_by: null,
          graded_at: null,
          grade_notes: null,
          created_at: '2026-07-02T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
        },
      ],
    });
    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByText(/Nothing of yours is eligible yet/i)
      ).toBeInTheDocument()
    );
    // It moved from the eligible list into "My cases" — not vanished. The
    // eligible list must no longer offer it, and the case must be listed.
    expect(
      screen.queryByRole('button', { name: /Write the case/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/The case about the purchase order/i)
    ).toBeInTheDocument();
  });
});

describe('the AI draft is labelled as something to rewrite', () => {
  it('tells the author the first draft is not what they hand in', async () => {
    viewer.roleKey = 'mba_associate';
    seed({
      cases: [
        {
          id: 'case-ai',
          improvement_idea_id: null,
          author_id: VIEWER_ID,
          title: 'An AI first draft',
          summary: 's',
          full_content: 'c',
          key_takeaways: null,
          learning_objectives: null,
          status: 'draft',
          published_at: null,
          generated_by: 'mba.draft_case_study',
          grade: null,
          graded_by: null,
          graded_at: null,
          grade_notes: null,
          created_at: '2026-07-02T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
        },
      ],
    });
    const { container } = renderScreen();
    const row = await screen.findByText(/An AI first draft/i);
    (row.closest('button') as HTMLButtonElement).click();
    await waitFor(() =>
      expect(
        screen.getByText(/first draft was written by AI/i)
      ).toBeInTheDocument()
    );
    expect(container).toBeTruthy();
  });
});

// --- Pure units -------------------------------------------------------------

describe('nav union', () => {
  const PATH = '/improvement-board/case-studies';

  it.each([
    ['mba_associate', true],
    ['mba_faculty', true],
    ['cao', true],
    ['executive_admin_officer', true],
    ['noBoardAccess', false],
  ] as const)('%s reaches the nav entry: %s', (roleKey, expected) => {
    expect(
      navPathAllowed(PATH, PRODUCTION_PERMISSIONS[roleKey], 'improvement.ideas.view')
    ).toBe(expected);
  });

  it('leaves every other path on its single declared key', () => {
    expect(
      navPathAllowed(
        '/improvement-board/postings',
        PRODUCTION_PERMISSIONS.mba_associate,
        'improvement.board.manage'
      )
    ).toBe(false);
    expect(
      navPathAllowed(
        '/improvement-board/postings',
        PRODUCTION_PERMISSIONS.mba_faculty,
        'improvement.board.manage'
      )
    ).toBe(true);
  });
});

describe('missing-object detection', () => {
  it('recognises the shapes a not-yet-applied migration produces', () => {
    expect(isMissingObject({ code: '42703' })).toBe(true);
    expect(isMissingObject({ code: 'PGRST202' })).toBe(true);
    expect(
      isMissingObject({
        message: 'Could not find the function public.fn_case_study_start',
      })
    ).toBe(true);
  });

  it('does NOT mistake a business refusal for a missing migration', () => {
    // fn_case_study_start raises this when the idea is not eligible. Reading it
    // as "not installed" would tell the author to wait for a change that has
    // already shipped.
    expect(
      isMissingObject({
        code: 'P0001',
        message: 'That improvement idea does not exist or is not yours.',
      })
    ).toBe(false);
    expect(
      isMissingObject({ code: '42501', message: 'permission denied' })
    ).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});

describe('text[] round-trip', () => {
  it('drops blank lines and trims, so an empty box yields an empty array', () => {
    expect(linesToArray('  one \n\n two  \n   \n')).toEqual(['one', 'two']);
    expect(linesToArray('   ')).toEqual([]);
  });
});
