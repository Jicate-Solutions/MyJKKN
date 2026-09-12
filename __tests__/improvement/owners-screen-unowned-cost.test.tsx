// @vitest-environment jsdom
/**
 * Department owners screen — an unowned department must state what it costs.
 *
 * WHY THIS GUARD EXISTS
 * ---------------------------------------------------------------------------
 * `fn_improvement_untriaged_notify` resolves the current holders of an idea's
 * department and, when that resolves to nobody, executes a bare CONTINUE — no
 * notice, and deliberately no ledger row, so the idea stays eligible for the
 * day an owner is named. The consequence: an idea on a department nobody owns
 * is skipped on every run, recorded nowhere, and counted by nothing anywhere in
 * the product. Production on 2026-09-12 had 33 ideas in Logged, 22 notices, and
 * 5 of 14 active departments owned.
 *
 * The screen already showed which departments had nobody. What it could not say
 * was how many people's ideas those empty rows were holding. These tests assert
 * the renderings that difference turns on — and, just as importantly, the ones
 * that must NOT appear, because a "0 ideas waiting" badge on a department whose
 * ideas the reader is simply not allowed to see would be a false reassurance,
 * not a fact.
 *
 * ON THE NUMBERS BELOW — these are a FIXTURE, not a production snapshot. The
 * shape is real (14 active departments, 5 owned, the 5 unowned ones that carry
 * ideas) and the per-department figures are the ones quoted in the brief that
 * commissioned this change. Those figures sum to 19, while the same brief puts
 * the stranded total at 12; both cannot be right, and the discrepancy is
 * recorded here rather than smoothed over. Nothing in the shipped code depends
 * on either figure — the count is read live per department — so these tests
 * assert the arithmetic of their OWN fixture, which is the only thing a test
 * can honestly prove.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  'Procurement'
] as const;

const AREAS = AREA_LABELS.map((label, i) => ({
  id: `area-${i + 1}`,
  key: label.toLowerCase().replace(/[^a-z]+/g, '_'),
  label,
  display_order: i + 1,
  is_active: true
}));

const areaIdOf = (label: string) =>
  AREAS[AREA_LABELS.indexOf(label as (typeof AREA_LABELS)[number])].id;

/** Departments that DO have a current department_owner row. */
const OWNED_LABELS = [
  'Admissions',
  'Fees & Finance',
  'Events',
  'HR',
  'COE / Academic'
] as const;

/**
 * Ideas in Logged per department. Fixture values — see the header note on the
 * brief's two irreconcilable totals. The five unowned entries sum to 19.
 */
const WAITING_BY_LABEL: Record<string, number> = {
  'CDC / Placement': 6,
  Library: 5,
  Transport: 4,
  'IQAC / Accreditation': 2,
  'Mess & Hostel': 2,
  // An owned department also has ideas waiting — they ARE being announced, so
  // this row must stay quiet. Without it the "owned rows show nothing" test
  // would pass for the wrong reason.
  Admissions: 3
};

// --- Fake Supabase browser client ------------------------------------------

const tables: Record<string, Record<string, unknown>[]> = {};
/** Set to a table name to make every read of it fail. */
let failingTable: string | null = null;

function makeBuilder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return builder;
    },
    not: (col: string) => {
      rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(
        failingTable === table
          ? { data: null, error: { message: `read of ${table} refused` } }
          : { data: rows, error: null }
      ).then(resolve, reject)
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: (table: string) => makeBuilder(table),
    rpc: vi.fn()
  })
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

/** The officer tier: may see the list and may change owners. */
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: (permission: string) =>
      permission === 'improvement.area_role.assign' ||
      permission === 'improvement.board.manage',
    isLoading: false,
    isSuperAdmin: false
  })
}));

/**
 * The owner NAME comes from an API route, not the database. Every owned
 * department resolves to the same person; nothing here turns on who it is.
 */
const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    assignments: [
      {
        role_type: 'department_owner',
        staff_id: 'staff-1',
        holder_note: null,
        holder_name: 'A named officer',
        holder_email: 'officer@jkkn.ac.in',
        start_date: '2026-08-01'
      }
    ]
  })
}));
vi.stubGlobal('fetch', fetchMock);

import { DepartmentOwnersClient } from '@/app/(routes)/improvement-board/owners/_components/owners-client';

function seed() {
  for (const key of Object.keys(tables)) delete tables[key];
  failingTable = null;

  tables.improvement_areas = AREAS;
  tables.hr_additional_roles = OWNED_LABELS.map((label) => ({
    improvement_area_id: areaIdOf(label),
    is_current: true,
    role_type: 'department_owner'
  }));
  tables.improvement_ideas = Object.entries(WAITING_BY_LABEL).flatMap(
    ([label, count]) =>
      Array.from({ length: count }, () => ({
        area_id: areaIdOf(label),
        status: 'logged'
      }))
  );
}

/** The table row for one department, found by its label cell. */
function rowFor(label: string): HTMLElement {
  const cell = screen.getByRole('cell', { name: label });
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row rendered for ${label}`);
  return row as HTMLElement;
}

async function renderScreen() {
  render(<DepartmentOwnersClient />);
  await waitFor(() =>
    expect(screen.getByText('Admissions')).toBeInTheDocument()
  );
}

beforeEach(() => {
  seed();
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('an unowned department states what being unowned costs', () => {
  it('shows the waiting-idea count on an unowned row, in plain words', async () => {
    await renderScreen();

    const cdc = rowFor('CDC / Placement');
    expect(cdc).toHaveTextContent('No owner yet');
    expect(cdc).toHaveTextContent('6 ideas waiting — nobody is being told');

    // Every unowned department carrying ideas says so, not just the first.
    expect(rowFor('Library')).toHaveTextContent(
      '5 ideas waiting — nobody is being told'
    );
    expect(rowFor('Transport')).toHaveTextContent(
      '4 ideas waiting — nobody is being told'
    );
    expect(rowFor('IQAC / Accreditation')).toHaveTextContent(
      '2 ideas waiting — nobody is being told'
    );
    expect(rowFor('Mess & Hostel')).toHaveTextContent(
      '2 ideas waiting — nobody is being told'
    );
  });

  it('says "idea", not "ideas", when exactly one is waiting', async () => {
    tables.improvement_ideas = [
      { area_id: areaIdOf('Library'), status: 'logged' }
    ];
    await renderScreen();

    expect(rowFor('Library')).toHaveTextContent(
      '1 idea waiting — nobody is being told'
    );
    expect(rowFor('Library')).not.toHaveTextContent('1 ideas');
  });

  it('stays silent on an OWNED department, even when ideas are waiting there', async () => {
    await renderScreen();

    // Admissions carries 3 logged ideas AND has an owner: those ideas are
    // already being announced, so there is no unowned cost to state.
    const admissions = rowFor('Admissions');
    expect(admissions).toHaveTextContent('A named officer');
    expect(admissions).not.toHaveTextContent('waiting');
    expect(admissions).not.toHaveTextContent('nobody is being told');
  });

  it('stays silent on an unowned department with nothing waiting', async () => {
    await renderScreen();

    // Procurement has no owner and no logged ideas. "No owner yet" is the whole
    // truth about it; a "0 ideas waiting" badge would add a claim, not a fact.
    const procurement = rowFor('Procurement');
    expect(procurement).toHaveTextContent('No owner yet');
    expect(procurement).not.toHaveTextContent('waiting');
    expect(procurement).not.toHaveTextContent('0 idea');
  });

  it('renders NO badge — never a zero — when the count could not be read', async () => {
    failingTable = 'improvement_ideas';
    await renderScreen();

    // The owner list is the page's job and still renders in full.
    expect(rowFor('Admissions')).toHaveTextContent('A named officer');
    expect(rowFor('CDC / Placement')).toHaveTextContent('No owner yet');

    // An unknown count asserts nothing at all. A refused read and a genuinely
    // quiet board are indistinguishable, so neither may print a number.
    expect(rowFor('CDC / Placement')).not.toHaveTextContent('waiting');
    expect(screen.queryByText(/nobody is being told/)).toBeNull();
    expect(screen.queryByText(/0 ideas waiting/)).toBeNull();
  });
});

describe('the header count carries the total, not just the gap', () => {
  it('adds the stranded total to the "still unowned" badge', async () => {
    await renderScreen();

    // 14 departments, 5 owned → 9 unowned; 6+5+4+2+2 = 19 ideas behind them.
    // Admissions' 3 are excluded: that department HAS an owner, so its ideas
    // are already being announced and are not part of the unowned cost.
    expect(
      screen.getByText(/9 still unowned · 19 ideas waiting/)
    ).toBeInTheDocument();
  });

  it('drops the total when nothing is waiting behind the unowned rows', async () => {
    tables.improvement_ideas = [
      { area_id: areaIdOf('Admissions'), status: 'logged' }
    ];
    await renderScreen();

    expect(screen.getByText(/9 still unowned/)).toBeInTheDocument();
    expect(screen.queryByText(/ideas waiting/)).toBeNull();
  });
});
