// @vitest-environment jsdom

/**
 * GAP closed: the "due" and "withheld" verdicts, and any rupee figure, had never
 * been RENDERED. Against today's real data nobody reaches either verdict and no
 * college records an amount, so the live check of the page could only ever see
 * "cannot tell", "not due yet" and "no rules".
 *
 * The rows here are produced by the REAL engine (buildCollegeReport) from
 * fixture rules and fixture people, then rendered through the real screen
 * components. The assertions are on the words and figures a person reading the
 * page would see — labels, rupees as the page formats them, the withheld reason
 * — not on props.
 */

import '@testing-library/jest-dom';
import { render, screen, within, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

import {
  buildCollegeReport,
  type CollegeIncrementReport,
  type PersonPayFacts,
} from '@/lib/hr/increment-engine';
import type { IncrementReport } from '@/lib/services/hr/increments/increment-report-service';

// --- Page-level stand-ins (only the page tests use them) -------------------

let grantedKeys: string[] = [];
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isLoading: false,
    canAccess: (module: string, action: string) => grantedKeys.includes(`${module}.${action}`),
  }),
}));

let reportData: IncrementReport | undefined;
vi.mock('@/hooks/hr/payroll/use-increment-proposals', () => ({
  useIncrementReport: () => ({
    data: reportData,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/layout/content-layout', () => ({
  // The prop name is on the terminology gate's list, so it is kept off any
  // line that also holds JSX text.
  ContentLayout: (props: { children: React.ReactNode }) => {
    const inner = props.children;
    return <div>{inner}</div>;
  },
}));

import { CollegeIncrementSection } from '@/app/(routes)/hr/payroll/increments/_components/college-increment-section';
import AnnualIncrementsPage from '@/app/(routes)/hr/payroll/increments/page';

afterEach(() => {
  cleanup();
  grantedKeys = [];
  reportData = undefined;
});

// --- Fixtures ---------------------------------------------------------------

const INSTITUTION = 'inst-eng';
const ASOF = '2026-09-29';

/** Rules that can reach a verdict: a window, a threshold, no HOD requirement. */
function policy(extra: Record<string, unknown> = {}) {
  return {
    increments: {
      annual_window_months: 12,
      approver_default: 'Principal',
      approver_for_principal: ['Chairman', 'Secretary'],
      satisfactory_performance_required: true,
      satisfactory_min_score: 60,
      head_of_dept_recommendation_required: false,
      withholding_triggers: ['poor_conduct', 'unsatisfactory_work'],
      ...extra,
    },
  };
}

function person(over: Partial<PersonPayFacts>): PersonPayFacts {
  return {
    staffId: 'p-0',
    staffName: 'Nobody',
    designation: null,
    institutionId: INSTITUTION,
    currentMonthlyGross: 20000,
    payEffectiveFrom: '2025-01-15',
    dateOfJoining: '2020-06-01',
    latestReview: { cycleYear: 2026, finalScore: 75, isFinalApproved: true },
    decidedDisciplinaryCases: [],
    openUndecidedDisciplinaryCases: 0,
    scale: null,
    ...over,
  };
}

const DUE = person({ staffId: 'p-1', staffName: 'Kavya Ramesh' });
const WITHHELD_SCORE = person({
  staffId: 'p-2',
  staffName: 'Arun Prakash',
  latestReview: { cycleYear: 2026, finalScore: 50, isFinalApproved: true },
});
const WITHHELD_CONDUCT = person({
  staffId: 'p-3',
  staffName: 'Meena Sundar',
  decidedDisciplinaryCases: [{ outcome: 'warning', outcomeDate: '2025-06-10' }],
});

function college(
  policyExtra: Record<string, unknown>,
  people: PersonPayFacts[],
): CollegeIncrementReport {
  return buildCollegeReport({
    institutionId: INSTITUTION,
    institutionName: 'Engineering College',
    policyValue: policy(policyExtra),
    people,
    asOf: ASOF,
  });
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`no table row for ${name}`);
  return row as HTMLElement;
}

/** The "Proposed rise" cell is the fourth column. */
function riseCell(row: HTMLElement): HTMLElement {
  return row.querySelectorAll('td')[3] as HTMLElement;
}

// ===========================================================================
// The college table
// ===========================================================================

describe('college table: a DUE row with an amount the rules state', () => {
  const report = college({ annual_amount: 1500 }, [DUE, WITHHELD_SCORE]);

  it('the engine really produced the verdicts this test is about', () => {
    expect(report.proposals.map((p) => p.verdict).sort()).toEqual(['due', 'withheld']);
  });

  it('shows "Due", the rise in rupees, the new pay, and who approves', () => {
    render(<CollegeIncrementSection college={report} />);
    const row = rowFor('Kavya Ramesh');

    expect(within(row).getByText('Due')).toBeInTheDocument();
    expect(within(row).getByText('₹20,000.00')).toBeInTheDocument(); // pay now
    expect(within(row).getByText('₹1,500.00')).toBeInTheDocument(); // proposed rise
    expect(within(row).getByText('would become ₹21,500.00')).toBeInTheDocument();
    expect(within(row).getByText('Principal approves')).toBeInTheDocument();
    expect(
      within(row).getByText('Due — the year has passed and every condition is met.'),
    ).toBeInTheDocument();
  });

  it('states the college total a month in rupees in the header', () => {
    render(<CollegeIncrementSection college={report} />);
    expect(screen.getByText(/₹1,500\.00 a month proposed in total/)).toBeInTheDocument();
  });

  it('formats a percentage-of-pay rise in rupees, with Indian digit grouping', () => {
    // 3.5% of 2,45,000 = 8,575; the new figure crosses a lakh.
    const higherPaid = person({
      staffId: 'p-9',
      staffName: 'Lakshmi Devi',
      currentMonthlyGross: 245000,
    });
    render(
      <CollegeIncrementSection college={college({ annual_percent_of_gross: 3.5 }, [higherPaid])} />,
    );
    const row = rowFor('Lakshmi Devi');
    expect(within(row).getByText('₹8,575.00')).toBeInTheDocument();
    expect(within(row).getByText('would become ₹2,53,575.00')).toBeInTheDocument();
  });
});

describe('college table: WITHHELD rows', () => {
  const report = college({ annual_amount: 1500 }, [DUE, WITHHELD_SCORE, WITHHELD_CONDUCT]);

  it('shows "Withheld" and the performance reason in words, and no rupee rise', () => {
    render(<CollegeIncrementSection college={report} />);
    const row = rowFor('Arun Prakash');

    expect(within(row).getByText('Withheld')).toBeInTheDocument();
    expect(
      within(row).getByText(
        'Withheld — this person scored 50 in their performance review and the rules ask for at least 60.',
      ),
    ).toBeInTheDocument();
    expect(riseCell(row)).toHaveTextContent(/^—$/);
    expect(within(row).queryByText(/approves$/)).not.toBeInTheDocument();
  });

  it('shows the conduct reason, naming the recorded decision', () => {
    render(<CollegeIncrementSection college={report} />);
    const row = rowFor('Meena Sundar');

    expect(within(row).getByText('Withheld')).toBeInTheDocument();
    expect(row).toHaveTextContent(
      /Withheld — a disciplinary decision of "warning" was recorded since .+, and the rules withhold an increment for poor conduct\./,
    );
    expect(riseCell(row)).toHaveTextContent(/^—$/);
  });

  it('lists the due person first, then the withheld', () => {
    render(<CollegeIncrementSection college={report} />);
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelector('td span')?.textContent);
    expect(names).toEqual(['Kavya Ramesh', 'Arun Prakash', 'Meena Sundar']);
  });

  it('the header total counts only the priced rows', () => {
    render(<CollegeIncrementSection college={report} />);
    expect(screen.getByText(/₹1,500\.00 a month proposed in total/)).toBeInTheDocument();
  });
});

describe('college table: a DUE row when the rules state no amount', () => {
  const report = college({}, [DUE]);

  it('shows "Due" and says in words that the rules do not say how much', () => {
    render(<CollegeIncrementSection college={report} />);
    const row = rowFor('Kavya Ramesh');

    expect(within(row).getByText('Due')).toBeInTheDocument();
    expect(
      within(row).getByText(
        'Due — the year has passed and every condition is met. The rules for this college do not say how much an increment is worth.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a dash for the rise and invents no figure anywhere', () => {
    render(<CollegeIncrementSection college={report} />);
    const row = rowFor('Kavya Ramesh');

    expect(riseCell(row)).toHaveTextContent(/^—$/);
    expect(screen.queryByText(/would become/)).not.toBeInTheDocument();
    expect(screen.queryByText(/a month proposed in total/)).not.toBeInTheDocument();
    // The only rupee figure on the panel is the pay the person has now.
    expect(document.body.textContent?.match(/₹[\d,.]+/g)).toEqual(['₹20,000.00']);
  });
});

// ===========================================================================
// The whole page
// ===========================================================================

function pageReport(colleges: CollegeIncrementReport[]): IncrementReport {
  return {
    asOf: ASOF,
    colleges,
    collegesWithoutRules: [],
    noAccessibleColleges: false,
  };
}

describe('Annual Increments page', () => {
  it('with nobody priced, says the rules do not say how much an increment is worth', () => {
    grantedKeys = ['hr.payroll.salary.view'];
    reportData = pageReport([college({}, [DUE])]);
    render(<AnnualIncrementsPage />);

    expect(
      screen.getByText('The rules do not say how much an increment is worth'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 person has met every condition their college.s rules set/),
    ).toBeInTheDocument();
    expect(screen.getByText(/MyJKKN will not invent one\./)).toBeInTheDocument();
  });

  it('with an amount recorded, drops that notice and shows the rupees', () => {
    grantedKeys = ['hr.payroll.salary.view'];
    reportData = pageReport([college({ annual_amount: 1500 }, [DUE, WITHHELD_SCORE])]);
    render(<AnnualIncrementsPage />);

    expect(
      screen.queryByText('The rules do not say how much an increment is worth'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
    expect(screen.getByText('would become ₹21,500.00')).toBeInTheDocument();
  });

  it('the Due and Withheld tiles count the rendered rows', () => {
    grantedKeys = ['hr.payroll.salary.view'];
    reportData = pageReport([
      college({ annual_amount: 1500 }, [DUE, WITHHELD_SCORE, WITHHELD_CONDUCT]),
    ]);
    render(<AnnualIncrementsPage />);

    const tile = (caption: string) => screen.getByText(caption).parentElement as HTMLElement;
    expect(tile('the year has passed and every condition is met')).toHaveTextContent(/^Due1/);
    expect(tile('a rule definitely blocks it')).toHaveTextContent(/^Withheld2/);
  });

  it('renders for an account holding hr.payroll.salary.view without being a super admin', () => {
    grantedKeys = ['hr.payroll.salary.view'];
    reportData = pageReport([college({ annual_amount: 1500 }, [DUE])]);
    render(<AnnualIncrementsPage />);

    expect(screen.queryByText('Not available to your role')).not.toBeInTheDocument();
    expect(screen.getByText('Kavya Ramesh')).toBeInTheDocument();
  });

  it('refuses in words an account without that key, and shows no pay', () => {
    grantedKeys = ['hr.payroll.view'];
    reportData = pageReport([college({ annual_amount: 1500 }, [DUE])]);
    render(<AnnualIncrementsPage />);

    expect(screen.getByText('Not available to your role')).toBeInTheDocument();
    expect(screen.queryByText('Kavya Ramesh')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₹/);
  });
});
