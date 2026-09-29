// @vitest-environment jsdom
/**
 * The salary revision screens, rendered with their data hooks stubbed.
 *
 *   Director's list (ruling 15): tick boxes; approve sends exactly the ticked
 *     ids, only after a second click; the red band warning (6), PAY CUT (7),
 *     asking-for-self / for-a-senior (9) and "Rule not set" (13) are all shown.
 *   Ask form: a cut is called a cut before sending (7); no reason, no send
 *     (13); a person with a waiting request gets the comment box instead (10).
 *   Single view: the Director's buttons only for the Director and only while
 *     it waits for him; the principal's only for a principal while it waits for
 *     them; the reason for a no appears only when the server sent it (14).
 *   No key → an explicit "You do not have access" (never a silent redirect).
 *
 * Run: npx vitest run __tests__/hr/salary-revision-screens.test.tsx
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalaryRevisionListRow, RevisionPerson } from '@/hooks/hr/use-salary-revisions';

let keys = new Set<string>();
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isLoading: false,
    canAccess: (m: string, a: string) => keys.has(`${m}.${a}`),
  }),
}));

const approveMany = vi.fn();
const act = vi.fn();
const ask = vi.fn();
let listRows: SalaryRevisionListRow[] = [];
let listEnabled: boolean[] = [];
let people: RevisionPerson[] = [];
let detail: unknown = null;
vi.mock('@/hooks/hr/use-salary-revisions', async (orig) => ({
  ...(await orig<typeof import('@/hooks/hr/use-salary-revisions')>()),
  useSalaryRevisionList: (_view: string, enabled = true) => {
    listEnabled.push(enabled);
    return { data: listRows, isLoading: false, error: null };
  },
  useApproveMany: () => ({ mutate: approveMany, isPending: false }),
  useRevisionAction: () => ({ mutate: act, isPending: false }),
  useAskForRevision: () => ({ mutate: ask, isPending: false }),
  useRevisionPeople: () => ({ data: people, isLoading: false, error: null }),
  useRevisionPerson: (id: string | null) => ({
    data: id ? { person: people.find((p) => p.staff_uuid === id), suggestion: { verdict: 'rule_not_set', figure: null, note: 'Rule not set' } } : undefined,
    isLoading: false,
  }),
  useRevisionDetail: () => ({ data: detail, isLoading: false, error: null }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({ default: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'r1' }) }));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ApprovePage from '@/app/(routes)/hr/salary-revisions/approve/page';
import AskPage from '@/app/(routes)/hr/salary-revisions/ask/page';
import DetailPage from '@/app/(routes)/hr/salary-revisions/[id]/page';

const row = (over: Partial<SalaryRevisionListRow>): SalaryRevisionListRow => ({
  id: 'r1', staff_id: 's1', person_name: 'Member One', staff_code: 'F1', designation: 'Office Assistant',
  institution_id: 'a', institution_name: 'College A', department_name: 'Dept A1', asked_by: 'u1', asked_by_name: 'HOD HA',
  asked_as: 'hod', route: 'via_principal', is_self: false, is_for_senior: false, current_monthly_gross: '48000.00',
  asked_monthly_gross: '56500.00', is_cut: false, final_monthly_gross: null, final_is_cut: null, reason: 'Good work',
  status: 'waiting_director', starts_on: null, created_at: '2026-09-29T05:00:00Z', principal_decided_at: null,
  director_decided_at: null, applied_at: null, comment_count: 0,
  suggestion: { verdict: 'suggested', figure: 50000, note: null }, band_warning: null, ...over,
});

beforeEach(() => {
  keys = new Set();
  listRows = [];
  listEnabled = [];
  people = [];
  detail = null;
  approveMany.mockReset();
  act.mockReset();
  ask.mockReset();
});
afterEach(cleanup);

describe("the Director's approval list", () => {
  beforeEach(() => {
    keys = new Set(['hr.payroll.salary_revision.approve']);
    listRows = [
      row({ id: 'r1', person_name: 'Member One', band_warning: 'Above the band by ₹6,500' }),
      row({ id: 'r2', person_name: 'Member Two', is_cut: true, asked_monthly_gross: '30000.00',
            suggestion: { verdict: 'rule_not_set', figure: null, note: 'Rule not set' } }),
      row({ id: 'r3', person_name: 'Member Three', is_self: true, is_for_senior: false }),
      row({ id: 'r4', person_name: 'Waiting Elsewhere', status: 'waiting_principal' }),
    ];
  });

  it('shows the red band warning, the cut, the self flag and "Rule not set"', () => {
    render(<ApprovePage />);
    expect(screen.getByTestId('band-warning')).toHaveTextContent('Above the band by ₹6,500');
    expect(screen.getByTestId('band-warning').className).toContain('text-destructive');
    expect(screen.getAllByText('PAY CUT').length).toBeGreaterThan(0);
    expect(screen.getByText('Asking for self')).toBeInTheDocument();
    expect(screen.getAllByText('Rule not set').length).toBeGreaterThan(0);
  });

  it('only requests waiting for him get a tick box; the principal’s are listed apart', () => {
    render(<ApprovePage />);
    expect(screen.getAllByRole('checkbox', { name: /^Tick (?!all)/ })).toHaveLength(3);
    expect(screen.getByText(/Waiting for a principal/)).toBeInTheDocument();
  });

  it('approves exactly the ticked requests, and only after he confirms', () => {
    render(<ApprovePage />);
    const approveButton = screen.getByRole('button', { name: /Approve ticked \(0\)/ });
    expect(approveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Member One' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Member Three' }));
    fireEvent.click(screen.getByRole('button', { name: /Approve ticked \(2\)/ }));
    expect(approveMany).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId('confirm-bar')).getByRole('button', { name: /Yes, approve/ }));
    expect(approveMany).toHaveBeenCalledTimes(1);
    expect(approveMany.mock.calls[0][0]).toEqual(['r1', 'r3']);
  });

  it('tick all ticks every waiting request', () => {
    render(<ApprovePage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick all' }));
    expect(screen.getByRole('button', { name: /Approve ticked \(3\)/ })).toBeEnabled();
  });

  it('says plainly when the viewer is not the Director, and asks for nothing', () => {
    keys = new Set(['hr.payroll.salary_revision.ask']);
    render(<ApprovePage />);
    expect(screen.getByText(/You do not have access/)).toBeInTheDocument();
    expect(listEnabled.every((e) => e === false)).toBe(true);
  });
});

describe('the ask form', () => {
  beforeEach(() => {
    keys = new Set(['hr.payroll.salary_revision.ask']);
    people = [
      { staff_uuid: 's1', person_name: 'Member One', staff_code: 'F1', designation: 'Office Assistant', institution_id: 'a',
        institution_name: 'College A', department_id: 'd', department_name: 'Dept A1', monthly_gross: '48000.00',
        is_self: false, open_request_id: null, open_request_status: null },
      { staff_uuid: 's2', person_name: 'Member Waiting', staff_code: 'F2', designation: 'Office Assistant', institution_id: 'a',
        institution_name: 'College A', department_id: 'd', department_name: 'Dept A1', monthly_gross: '40000.00',
        is_self: false, open_request_id: 'open-1', open_request_status: 'waiting_director' },
    ];
  });

  it('shows the pay now and "Rule not set" beside the figure (rulings 8 and 13)', () => {
    render(<AskPage />);
    fireEvent.click(screen.getByRole('button', { name: /Member One/ }));
    expect(screen.getByTestId('suggested-figure')).toHaveTextContent('Rule not set');
    expect(screen.getAllByText('₹48,000').length).toBeGreaterThan(0);
  });

  it('calls a lower figure a PAY CUT before sending (ruling 7)', () => {
    render(<AskPage />);
    fireEvent.click(screen.getByRole('button', { name: /Member One/ }));
    fireEvent.change(screen.getByLabelText(/New monthly pay/), { target: { value: '30000' } });
    expect(screen.getByTestId('change-preview')).toHaveTextContent('PAY CUT');
  });

  it('will not send without a reason (ruling 13)', () => {
    render(<AskPage />);
    fireEvent.click(screen.getByRole('button', { name: /Member One/ }));
    fireEvent.change(screen.getByLabelText(/New monthly pay/), { target: { value: '52000' } });
    fireEvent.click(screen.getByRole('button', { name: /Send the request/ }));
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByText(/Write a reason/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Why\?/), { target: { value: 'Took on the evening batch' } });
    fireEvent.click(screen.getByRole('button', { name: /Send the request/ }));
    expect(ask.mock.calls[0][0]).toEqual({ staffId: 's1', monthlyGross: 52000, reason: 'Took on the evening batch' });
  });

  it('offers a comment on the waiting request instead of a second one (ruling 10)', () => {
    render(<AskPage />);
    fireEvent.click(screen.getByRole('button', { name: /Member Waiting/ }));
    expect(screen.getByTestId('open-request')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send the request/ })).not.toBeInTheDocument();
  });
});

describe('the single request view', () => {
  const detailOf = (over: Partial<SalaryRevisionListRow>, note: unknown = null) => ({
    request: row(over), decisionNote: note, comments: [],
  });

  it('gives the Director approve / say no only while it waits for him', () => {
    keys = new Set(['hr.payroll.salary_revision.approve']);
    detail = detailOf({ status: 'waiting_director' });
    render(<DetailPage />);
    expect(screen.getByTestId('director-actions')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Monthly pay to approve/), { target: { value: '52500' } });
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));
    expect(act.mock.calls[0][0]).toMatchObject({ action: 'approve', finalMonthlyGross: 52500 });
    cleanup();
    detail = detailOf({ status: 'waiting_principal' });
    render(<DetailPage />);
    expect(screen.queryByTestId('director-actions')).not.toBeInTheDocument();
  });

  it('a no needs a reason before it can be sent (ruling 14)', () => {
    keys = new Set(['hr.payroll.salary_revision.approve']);
    detail = detailOf({ status: 'waiting_director' });
    render(<DetailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Say no/ }));
    expect(screen.getByRole('button', { name: /^Say no$/ })).toBeDisabled();
  });

  it('gives a principal agree / stop only while it waits for the principal', () => {
    keys = new Set(['hr.payroll.salary_revision.ask', 'hr.payroll.salary_revision.college_check']);
    detail = detailOf({ status: 'waiting_principal' });
    render(<DetailPage />);
    expect(screen.getByTestId('principal-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('director-actions')).not.toBeInTheDocument();
  });

  it('shows the reason for a no only when the server sent it', () => {
    keys = new Set(['hr.payroll.salary_revision.ask']);
    detail = detailOf({ status: 'refused' }, { kind: 'refused', reason: 'Budget closed', created_at: '2026-09-29' });
    render(<DetailPage />);
    expect(screen.getByTestId('decision-note')).toHaveTextContent('Budget closed');
    cleanup();
    detail = detailOf({ status: 'refused' }, null);
    render(<DetailPage />);
    expect(screen.queryByTestId('decision-note')).not.toBeInTheDocument();
  });

  it('shows the Director’s figure and the start date once approved (ruling 12)', () => {
    keys = new Set(['hr.payroll.salary_revision.ask']);
    detail = detailOf({ status: 'approved', final_monthly_gross: '52500.00', asked_monthly_gross: '50000.00', starts_on: '2026-10-01' });
    render(<DetailPage />);
    expect(screen.getByText('Approved at ₹52,500 a month from 1 October 2026 (asked: ₹50,000).')).toBeInTheDocument();
  });
});
