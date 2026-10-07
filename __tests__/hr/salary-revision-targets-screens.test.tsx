// @vitest-environment jsdom
/**
 * Target-gated raises on screen (rulings of 7 Oct 2026, 20271007180207).
 *
 *   The section shows the increment and the held part, where the held part
 *   stands, and each counted month's five numbers, in words.
 *   The principal's "Flag this month" appears only for a month not yet
 *   counted, and needs a note; the Director's "Count as met / missed" only for
 *   a flagged month that is over. The person sees their own numbers on My Pay
 *   Changes with no buttons, and never a flag note (the server never sends one).
 *   The request page shows the section only for an approved raise.
 *
 * Run: npx vitest run __tests__/hr/salary-revision-targets-screens.test.tsx
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaiseTargets, TargetMonth, TargetPlan } from '@/lib/hr/salary-revision';
import { MONTH_STATUS_LABELS, canDecideMonth, planStateText, resultText, windowEnd } from '@/lib/hr/salary-revision';

let keys = new Set<string>();
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isLoading: false, canAccess: (m: string, a: string) => keys.has(`${m}.${a}`) }),
}));
const act = vi.fn();
const decideFromList = vi.fn();
let detail: unknown = null;
let outcomes: unknown[] = [];
let listedRows: unknown[] = [];
let listedEnabled: boolean[] = [];
vi.mock('@/hooks/hr/use-salary-revisions', async (orig) => ({
  ...(await orig<typeof import('@/hooks/hr/use-salary-revisions')>()),
  useRevisionAction: () => ({ mutate: act, isPending: false }),
  useRevisionDetail: () => ({ data: detail, isLoading: false, error: null }),
  useMyPayOutcomes: () => ({ data: outcomes, isLoading: false, error: null }),
  useSalaryRevisionList: () => ({ data: [], isLoading: false, error: null }),
  useApproveMany: () => ({ mutate: vi.fn(), isPending: false }),
  useHeldApprovals: () => ({ data: undefined, isLoading: false, error: new Error('Only the Director can see this list.') }),
  // The database answers the Director list only; for anyone else the hook stays off.
  useTargetsListed: (enabled = true) => {
    listedEnabled.push(enabled);
    return enabled ? { data: listedRows, isLoading: false, error: null } : { data: undefined, isLoading: false, error: null };
  },
  useTargetDecide: () => ({ mutate: decideFromList, isPending: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({ default: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} /> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'r1' }) }));
vi.mock('@/lib/hr/raise-effective-date', async (orig) => ({
  ...(await orig<typeof import('@/lib/hr/raise-effective-date')>()),
  todayIST: () => '2026-12-10',
}));
vi.mock('@/components/layout/content-layout', async () => {
  const React = await import('react');
  return { ContentLayout: (p: React.PropsWithChildren) => React.createElement(React.Fragment, null, p.children) };
});

import { TargetSection } from '@/app/(routes)/hr/salary-revisions/_components/target-section';
import DetailPage from '@/app/(routes)/hr/salary-revisions/[id]/page';
import MyPayChangesPage from '@/app/(routes)/hr/my-pay-changes/page';
import ApprovePage from '@/app/(routes)/hr/salary-revisions/approve/page';
import { listedReasonInWords } from '@/lib/hr/salary-revision';

const THRESHOLDS = {
  t1_marked_by_self_min_pct: 85, t1_mark_within_hours: 24, t3_linked_min_pct: 60,
  t4_resource_min_pct: 25, t5_min_pulses_per_week: 1,
};
const plan = (over: Partial<TargetPlan> = {}): TargetPlan => ({
  request_id: 'r1', staff_id: 's1', base_monthly_gross: '48000.00', increment_amount: '2400.00', held_amount: '2100.00',
  target_role: 'faculty',
  rules: { annual_increment_percent: 5, window_months: 6, pause_after_missed_months: 3, role: 'faculty', targets: THRESHOLDS },
  window_start: '2026-11-01', window_months: 6, state: 'waiting', state_reason: null, missed_in_row: 0,
  held_paid_from: null, paused_from: null, run_note: null, ...over,
});
const results = (t5met: boolean) => [
  { target: 't1', numerator: 16, denominator: 19, met: false },
  { target: 't2', numerator: 2, denominator: 2, met: true },
  { target: 't3', numerator: 11, denominator: 17, met: true },
  { target: 't4', numerator: 5, denominator: 19, met: true },
  { target: 't5', numerator: t5met ? 4 : 2, denominator: 4, met: t5met },
] as TargetMonth['results'];
const month = (m: string, status: TargetMonth['status'], over: Partial<TargetMonth> = {}): TargetMonth => ({
  request_id: 'r1', month: m, status, results: results(false), acted: status !== 'in_progress' && status !== 'flagged',
  action: null, action_effective_from: null, ...over,
});
const targets = (over: Partial<RaiseTargets> = {}): RaiseTargets => ({
  plan: plan(), months: [month('2026-11-01', 'missed'), month('2026-12-01', 'in_progress')], flags: [], ...over,
});

beforeEach(() => {
  keys = new Set();
  detail = null;
  outcomes = [];
  listedRows = [];
  listedEnabled = [];
  act.mockReset();
  decideFromList.mockReset();
});
afterEach(cleanup);

describe('the words', () => {
  it('says where the held part stands, in a sentence', () => {
    expect(planStateText(plan())).toBe(
      'The held ₹2,100 a month starts on the 1st of the month after a month with every target met, if that happens by April 2027.');
    expect(planStateText(plan({ state: 'paused', paused_from: '2027-05-01' })))
      .toMatch(/paused from 1 May 2027 after 3 months below target in a row\. .*Months already paid are not taken back\./);
    expect(planStateText(plan({ state: 'held_listed', state_reason: 'waits_for_own_targets:principal' })))
      .toBe('Held: there are no targets for the principal role yet. Listed for the Director.');
    expect(planStateText(plan({ state: 'held_listed', state_reason: 'director_list' }))).toMatch(/only the Director decides/);
    expect(planStateText(plan({ state: 'lapsed', state_reason: 'moved_college' }))).toMatch(/moved to another college/);
    expect(planStateText(plan({ state: 'back_to_director' }))).toMatch(/back with the Director, with the numbers/);
    // The person's own view carries no reason (7 Oct, default cc): plain words, nothing internal.
    expect(planStateText(plan({ state: 'held_listed', state_reason: null }))).toBe('Held: the Director decides when it is paid.');
    expect(planStateText(plan({ state: 'lapsed', state_reason: null }))).toBe('Lapsed: this held part will not be paid under this raise.');
    // 8 Oct 2026: measurement is on and the schedule record is not complete yet: not "targets being set up".
    expect(planStateText(plan({ state: 'awaiting_measurement', state_reason: 'schedule_not_recorded' }))).toBe(
      'The held ₹2,100 a month is held while the class schedule of the last 90 days is being recorded. '
      + 'Then it is decided which targets apply. Nothing changes your pay until then.');
    expect(planStateText(plan({ state: 'awaiting_measurement', state_reason: null }))).toMatch(/while the targets are being set up/);
  });

  it('writes each number as "n of d (p%)", and a month with nothing scheduled plainly', () => {
    expect(resultText({ numerator: 16, denominator: 19 })).toBe('16 of 19 (84%)');
    expect(resultText({ numerator: 0, denominator: 0 })).toBe('none scheduled');
  });

  it('knows the last month of the window and when a flagged month may be decided', () => {
    expect(windowEnd(plan())).toBe('2027-04-01');
    expect(canDecideMonth(month('2026-11-01', 'flagged'), '2026-12-10')).toBe(true);
    expect(canDecideMonth(month('2026-12-01', 'flagged'), '2026-12-10')).toBe(false);
    expect(canDecideMonth(month('2026-11-01', 'missed'), '2026-12-10')).toBe(false);
  });
});

describe('the section', () => {
  it('shows the two parts, the state and each month, newest first', () => {
    render(<TargetSection targets={targets()} today='2026-12-10' />);
    expect(screen.getByTestId('increment-amount')).toHaveTextContent('₹2,400');
    expect(screen.getByTestId('held-amount')).toHaveTextContent('₹2,100');
    expect(screen.getByTestId('target-state')).toHaveTextContent('Held: waiting for targets');
    const rows = screen.getAllByTestId('target-month');
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['December 2026', 'November 2026']);
    expect(rows[1]).toHaveTextContent('16 of 19 (84%) not met');
    expect(rows[1]).toHaveTextContent('Missed');
    expect(screen.getByText(/At least 85% of your periods, first marked by you between the start of the session and 24 hours after it ends/)).toBeInTheDocument();
    expect(screen.getByText(/Class material on at least 25% of your periods, posted by the end of that day/)).toBeInTheDocument();
    expect(screen.getByText(/At least 1 opened each week \(Monday to Sunday\)/)).toBeInTheDocument();
  });

  it('while measurement is switched off: the two parts, "targets being set up", and no targets or months', () => {
    const waiting = plan({
      state: 'awaiting_measurement', target_role: null,
      rules: { annual_increment_percent: 5, window_months: 6, pause_after_missed_months: 3, role: null, targets: null },
    });
    render(<TargetSection targets={targets({ plan: waiting, months: [month('2026-11-01', 'not_measured', { results: [] })] })}
      today='2026-12-10' canDecide onLapse={() => undefined} />);
    expect(screen.getByTestId('increment-amount')).toHaveTextContent('₹2,400');
    expect(screen.getByTestId('held-amount')).toHaveTextContent('₹2,100');
    expect(screen.getByTestId('target-state')).toHaveTextContent('Held: targets being set up');
    expect(screen.getByTestId('target-state-text')).toHaveTextContent(
      'The held ₹2,100 a month is held while the targets are being set up. Nothing is measured yet, and nothing changes your pay until they are.');
    expect(screen.queryByTestId('target-months')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('The five targets')).not.toBeInTheDocument();
    // The Director can still lapse it, so a new raise can be asked for.
    expect(screen.getByRole('button', { name: 'Lapse the held part…' })).toBeInTheDocument();
    expect(MONTH_STATUS_LABELS.not_measured).toBe('Not measured: targets being set up');
  });

  it('shows nothing when there is no plan', () => {
    const { container } = render(<TargetSection targets={{ plan: null, months: [], flags: [] }} today='2026-12-10' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gives the principal "Flag this month" only on the month not yet counted, and needs a note', () => {
    const onFlag = vi.fn();
    render(<TargetSection targets={targets()} today='2026-12-10' canFlag onFlag={onFlag} />);
    const [december, november] = screen.getAllByTestId('target-month');
    expect(within(november).queryByRole('button', { name: /Flag this month/ })).not.toBeInTheDocument();
    fireEvent.click(within(december).getByRole('button', { name: /Flag this month/ }));
    const send = screen.getByRole('button', { name: 'Send to the Director' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why this month should go to the Director/), { target: { value: ' Exams week ' } });
    fireEvent.click(send);
    expect(onFlag).toHaveBeenCalledWith('2026-12-01', 'Exams week');
  });

  it('gives no flag button to anyone else, and none once the held part is no longer being checked', () => {
    render(<TargetSection targets={targets()} today='2026-12-10' onFlag={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Flag this month/ })).not.toBeInTheDocument();
    cleanup();
    render(<TargetSection targets={targets({ plan: plan({ state: 'back_to_director' }) })} today='2026-12-10' canFlag onFlag={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Flag this month/ })).not.toBeInTheDocument();
  });

  it('gives the Director "Count as met / missed" only on a flagged month that is over, with the note beside it', () => {
    const onDecide = vi.fn();
    const t = targets({
      months: [month('2026-11-01', 'flagged'), month('2026-12-01', 'flagged')],
      flags: [{ request_id: 'r1', month: '2026-11-01', note: 'Room under repair', flagged_at: '2026-11-20T00:00:00Z',
                decided_at: null, counts_as_met: null, decision_note: null }],
    });
    render(<TargetSection targets={t} today='2026-12-10' canDecide onDecide={onDecide} />);
    const [december, november] = screen.getAllByTestId('target-month');
    expect(within(december).queryByRole('button', { name: 'Count as met' })).not.toBeInTheDocument();
    expect(within(november).getByTestId('flag-note')).toHaveTextContent('Principal: Room under repair');
    fireEvent.click(within(november).getByRole('button', { name: 'Count as missed' }));
    expect(onDecide).toHaveBeenCalledWith('2026-11-01', false);
  });

  it('gives the Director "Lapse the held part" with a required note, and nobody else', () => {
    const onLapse = vi.fn();
    render(<TargetSection targets={targets()} today='2026-12-10' onLapse={onLapse} />);
    expect(screen.queryByRole('button', { name: /Lapse the held part/ })).not.toBeInTheDocument();
    cleanup();
    render(<TargetSection targets={targets()} today='2026-12-10' canDecide onLapse={onLapse} />);
    fireEvent.click(screen.getByRole('button', { name: /Lapse the held part…/ }));
    const go = screen.getByRole('button', { name: 'Lapse the held part' });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Why the held part lapses'), { target: { value: ' New scale ' } });
    fireEvent.click(go);
    expect(onLapse).toHaveBeenCalledWith('New scale');
    cleanup();
    render(<TargetSection targets={targets({ plan: plan({ state: 'lapsed', state_reason: 'lapsed_by_director' }) })} today='2026-12-10' canDecide onLapse={onLapse} />);
    expect(screen.queryByRole('button', { name: /Lapse the held part/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('target-state-text')).toHaveTextContent(/Lapsed by the Director/);
  });

  it('says when the held part was paid', () => {
    const t = targets({
      plan: plan({ state: 'released', held_paid_from: '2027-01-01' }),
      months: [month('2026-12-01', 'met', { results: results(true), action: 'released', action_effective_from: '2027-01-01' })],
    });
    render(<TargetSection targets={t} today='2027-01-02' />);
    expect(screen.getByTestId('target-state-text')).toHaveTextContent('The held ₹2,100 a month is being paid from 1 January 2027.');
    expect(screen.getByTestId('target-month')).toHaveTextContent('Held part released from 1 January 2027');
  });
});

describe('on the pages', () => {
  const request = {
    id: 'r1', staff_id: 's1', person_name: 'Member One', staff_code: 'F1', designation: 'Office Assistant',
    institution_id: 'a', institution_name: 'College A', department_name: 'Dept A1', asked_by: 'u1', asked_by_name: 'HR head',
    asked_as: 'hr_head', route: 'direct', is_self: false, is_for_senior: false, current_monthly_gross: '48000.00',
    asked_monthly_gross: '52500.00', is_cut: false, final_monthly_gross: '52500.00', final_is_cut: false, reason: 'Load',
    status: 'applied', starts_on: '2026-11-01', created_at: '2026-10-07T05:00:00Z', principal_decided_at: null,
    director_decided_at: '2026-10-07T06:00:00Z', applied_at: '2026-11-01T00:00:00Z', comment_count: 0,
    asker_is_also_hod: false, band_changed: false, apply_note: null, cancel_note: null, can_decide: false,
    suggestion: { verdict: 'rule_not_set', figure: null, note: 'Rule not set' }, band_warning: null,
  };

  it('the request page shows the section for an approved raise, and the principal\'s flag goes to the server', () => {
    keys = new Set(['hr.payroll.salary_revision.college_check']);
    detail = { request, decisionNote: null, comments: [], targets: targets() };
    render(<DetailPage />);
    expect(screen.getByTestId('raise-targets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Flag this month/ }));
    fireEvent.change(screen.getByLabelText(/Why this month should go to the Director/), { target: { value: 'Exams' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to the Director' }));
    expect(act.mock.calls[0][0]).toEqual({ action: 'target_flag', month: '2026-12-01', note: 'Exams' });
  });

  it('the request page shows no section while the raise still waits', () => {
    detail = { request: { ...request, status: 'waiting_director', final_monthly_gross: null }, decisionNote: null, comments: [], targets: targets() };
    render(<DetailPage />);
    expect(screen.queryByTestId('raise-targets')).not.toBeInTheDocument();
  });

  it('My Pay Changes shows the person their own numbers, read-only', () => {
    keys = new Set(['hr.payroll.salary_revision.college_check', 'hr.payroll.salary_revision.approve']);
    outcomes = [{
      id: 'o1', request_id: 'r1', previous_monthly_gross: '48000.00', new_monthly_gross: '50400.00', is_cut: false,
      starts_on: '2026-11-01', created_at: '2026-10-07T06:00:00Z', targets: targets(),
    }];
    render(<MyPayChangesPage />);
    expect(screen.getByTestId('pay-outcome')).toHaveTextContent('₹50,400');
    expect(screen.getByTestId('raise-targets')).toHaveTextContent('₹2,100');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe("the Director's list of held parts waiting on him (approval page)", () => {
  const flagged = {
    request_id: 'r5', staff_id: 's5', person_name: 'Member Five', staff_code: 'F5', state: 'waiting',
    why: 'flagged: Exams week', month: '2026-11-01', increment_amount: '3000.00', held_amount: '3000.00',
    results: results(true),
  };
  const parked = {
    request_id: 'r7', staff_id: 's7', person_name: 'Member Seven', staff_code: 'F7', state: 'held_listed',
    why: 'no_teaching_timetable', month: null, increment_amount: '1500.00', held_amount: '2500.00',
    results: [{ month: '2026-11-01', status: 'missed', results: [] }],
  };

  it('shows every listed item, in words, with its numbers and a link, to the Director list', () => {
    keys = new Set(['hr.payroll.salary_revision.approve']);
    listedRows = [flagged, parked];
    render(<ApprovePage />);
    const section = screen.getByTestId('targets-listed');
    const rows = within(section).getAllByTestId('listed-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Principal flagged this month: Exams week (November 2026)');
    expect(rows[0]).toHaveTextContent('16 of 19 (84%) not met');
    expect(rows[1]).toHaveTextContent('Does not teach (no timetable): no targets');
    expect(rows[1]).toHaveTextContent('1 month measured: 0 met, 1 missed');
    expect(within(rows[1]).getByRole('link', { name: 'Member Seven' })).toHaveAttribute('href', '/hr/salary-revisions/r7');
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Count as met' }));
    expect(decideFromList.mock.calls[0][0]).toEqual({ id: 'r5', month: '2026-11-01', met: true });
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument();
  });

  it('is hidden from everyone else (the list is never even asked for)', () => {
    keys = new Set(['hr.payroll.salary_revision.college_check']);
    listedRows = [flagged, parked];
    render(<ApprovePage />);
    expect(screen.queryByTestId('targets-listed')).not.toBeInTheDocument();
    expect(listedEnabled.every((e) => e === false)).toBe(true);
  });

  it('says every reason in plain words', () => {
    expect(listedReasonInWords('director_list')).toMatch(/On the Director list/);
    expect(listedReasonInWords('awaiting_measurement')).toBe('Waiting for measurement to be switched on');
    // 8 Oct 2026: measurement on, the schedule of the 90 days not all recorded yet (never the raw code).
    expect(listedReasonInWords('schedule_not_recorded'))
      .toBe('Waiting for the last 90 days of class schedule to be recorded, then for its targets to be decided');
    expect(listedReasonInWords('waits_for_own_targets:principal')).toBe('No targets for the principal role yet');
    expect(listedReasonInWords('window_over')).toMatch(/No month met every target in time/);
    expect(listedReasonInWords('lapsed_by_director: New scale')).toBe('Lapsed by you: New scale');
    expect(listedReasonInWords('run: Linked to no account, so nobody can tell')).toMatch(/^Monthly check skipped it: Linked to no account/);
    expect(listedReasonInWords('start date: The pay in force (₹30,500) changed')).toMatch(/^Start date wrote nothing: /);
  });
});
