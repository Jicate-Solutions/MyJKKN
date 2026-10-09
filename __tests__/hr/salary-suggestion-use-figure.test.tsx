// @vitest-environment jsdom
/**
 * "Use this figure" only FILLS IN the existing Edit Salary dialog. Nothing is
 * saved until the HR head presses Save there, exactly as today.
 *
 *   - the panel hands the suggested figure to its caller and writes nothing;
 *   - the dialog opens with that figure in Monthly gross and Effective from on
 *     the 1st of NEXT month in India (the Director: an approved raise starts on
 *     the 1st of the month after approval, 29 Sep 2026; nothing is backdated,
 *     18 Sep 2026), refuses a past date with Save disabled, and makes no save
 *     call;
 *   - opened again without a figure, it starts from the pay in force and the
 *     current salary's date, and accepts any date — unchanged from main;
 *   - while the panel re-asks the server, the old figure is hidden and "Use
 *     this figure" is disabled; when that re-ask FAILS (React Query keeps the
 *     old data), only the error shows and there is no "Use this figure";
 *   - the plain dialog puts no lower limit on the date picker (only the
 *     suggested-raise flow sets `min` to today in India);
 *   - a non-super-admin is told a super admin (not "the Director") sets the rule.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-use-figure.test.tsx
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';
import type { SalarySuggestionPayload } from '@/hooks/hr/use-salary-suggestion';

const mutateAsync = vi.fn();
vi.mock('@/hooks/hr/use-staff-salaries', () => ({
  useSetStaffSalary: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/hooks/hr/use-tds-slabs', () => ({ useTdsSlabs: () => ({ data: [] }) }));

let suggestion: SalarySuggestionPayload | undefined;
let fetching = false;
let queryError: Error | null = null;
vi.mock('@/hooks/hr/use-salary-suggestion', () => ({
  useSalarySuggestion: () => ({ data: suggestion, isLoading: false, isFetching: fetching, error: queryError }),
}));
vi.mock('next/link', () => ({
  // A plain anchor: every prop (href and the link text) is passed straight through.
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

import { EditSalaryDialog } from '@/app/(routes)/hr/payroll/salaries/_components/edit-salary-dialog';
import { SalarySuggestionSheet } from '@/app/(routes)/hr/payroll/salaries/_components/salary-suggestion-sheet';

const ROW: StaffSalaryDirectoryRow = {
  staff_uuid: '11111111-1111-4111-8111-111111111111',
  staff_code: 'E001',
  person_name: 'Test Person',
  role_title: 'Office Assistant',
  is_active: true,
  works_at_id: 'inst-a',
  works_at_name: 'College A',
  payer_org_id: 'org-a',
  payer_org_name: 'Org A',
  salary_id: 'sal-1',
  salary_structure: 'Monthly',
  monthly_gross: 21000,
  annual_gross: 252000,
  overtime_level: 'No overtime',
  overtime_amount: null,
  eligible_for_pf: false,
  exempt_edli: false,
  eligible_for_insurance: false,
  eligible_for_gratuity: false,
  eligible_for_etf: false,
  epf_amount: null,
  eligible_for_esi: false,
  esi_amount: null,
  allowance_amount: null,
  allowance_label: null,
  effective_from: '2026-04-01',
  notes: null,
  in_force_salary_id: 'sal-1',
  in_force_monthly_gross: 21000,
  in_force_annual_gross: 252000,
  in_force_allowance_amount: null,
  in_force_effective_from: '2026-04-01',
};

function suggested(figure: number): SalarySuggestionPayload {
  return {
    ruleUpdatedAt: null,
    suggestion: {
      verdict: 'suggested',
      lines: [{ label: 'Band floor for Office Assistant', amount: 20000, note: 'floor' }],
      suggested: figure,
      computed: figure,
      bandMin: 20000,
      bandMax: 30000,
      currentMonthlyPay: 21000,
      aboveBandBy: null,
      departmentName: 'Dept X',
      reasons: [],
    },
  };
}

const fetchSpy = vi.fn();
beforeEach(() => {
  mutateAsync.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  suggestion = undefined;
  fetching = false;
  queryError = null;
  // 29 Sep 2026, midday in India. Only Date is faked.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T06:30:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function ruleNotSet(): SalarySuggestionPayload {
  return {
    ruleUpdatedAt: null,
    suggestion: {
      verdict: 'rule_not_set',
      lines: [],
      suggested: null,
      computed: null,
      bandMin: 20000,
      bandMax: 30000,
      currentMonthlyPay: 21000,
      aboveBandBy: null,
      departmentName: 'Dept X',
      reasons: [{ code: 'department_amount_not_set', text: 'not set' }],
    },
  };
}

const save = () => screen.getByRole('button', { name: 'Update salary' });

describe('the Suggest panel', () => {
  it('"Use this figure" hands the figure over and saves nothing', () => {
    suggestion = suggested(24500);
    const onUseFigure = vi.fn();
    render(
      <SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={onUseFigure} />
    );
    expect(screen.getByTestId('suggested-figure')).toHaveTextContent('₹24,500');
    fireEvent.click(screen.getByRole('button', { name: 'Use this figure' }));
    expect(onUseFigure).toHaveBeenCalledWith(ROW, 24500);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers no "Use this figure" to someone who can see salaries but not record them', () => {
    suggestion = suggested(24500);
    render(
      <SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage={false} canEditRule={false} onUseFigure={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Use this figure' })).toBeNull();
  });

  it('says the figure starts on the 1st of next month and that a past date is refused — what the dialog does', () => {
    suggestion = suggested(24500);
    render(
      <SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={vi.fn()} />
    );
    expect(
      screen.getByText(/Opens Update salary with ₹24,500 filled in, starting on 1 October 2026\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/a date in the past\s+is refused there/)).toBeInTheDocument();
    expect(screen.queryByText(/change it before saving/)).toBeNull();
  });

  it('while re-asking the server: the old figure is hidden and "Use this figure" is disabled', () => {
    suggestion = suggested(24500);
    fetching = true;
    const onUseFigure = vi.fn();
    render(
      <SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={onUseFigure} />
    );
    expect(screen.getByTestId('suggestion-working')).toHaveTextContent('Working it out');
    expect(screen.queryByTestId('suggested-figure')).toBeNull();
    expect(screen.queryByText(/24,500/)).toBeNull();
    const button = screen.getByRole('button', { name: 'Use this figure' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onUseFigure).not.toHaveBeenCalled();
  });

  it('after a FAILED re-ask (old data still held), shows only the error: no old figure, no "Use this figure"', () => {
    suggestion = suggested(24500);
    queryError = new Error('Could not work out the suggestion.');
    const onUseFigure = vi.fn();
    render(
      <SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={onUseFigure} />
    );
    expect(screen.getByText('Could not work out the suggestion.')).toBeInTheDocument();
    expect(screen.queryByTestId('suggested-figure')).toBeNull();
    expect(screen.queryByText(/24,500/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use this figure' })).toBeNull();
    expect(onUseFigure).not.toHaveBeenCalled();
  });

  it('tells someone who is not a super admin that only the Director sets the amount', () => {
    suggestion = ruleNotSet();
    render(<SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={vi.fn()} />);
    expect(screen.getByText('Only the Director can set it.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See the department amounts' })).toBeNull();
  });

  it('offers no figure at all when the department is empty, and links a super admin to the amounts', () => {
    suggestion = ruleNotSet();
    render(<SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule onUseFigure={vi.fn()} />);
    expect(screen.getByTestId('rule-not-set')).toBeInTheDocument();
    expect(screen.getByText('No amount is set for this department')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the department amounts' })).toHaveAttribute(
      'href',
      '/hr/admin/policies/salary-suggestion'
    );
    expect(screen.queryByRole('button', { name: 'Use this figure' })).toBeNull();
    expect(screen.queryByTestId('suggested-figure')).toBeNull();
  });

  it('shows a red "above band by" warning and still offers the figure (no cap)', () => {
    const payload = suggested(32000);
    payload.suggestion.aboveBandBy = 2000;
    payload.suggestion.reasons = [{ code: 'above_band_top', text: 'Above the band top by ₹2,000.' }];
    suggestion = payload;
    render(<SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={vi.fn()} />);
    expect(screen.getByTestId('above-band')).toHaveTextContent('Above band by ₹2,000');
    expect(screen.getByTestId('suggested-figure')).toHaveTextContent('₹32,000');
    expect(screen.getByRole('button', { name: 'Use this figure' })).toBeEnabled();
  });

  it('shows no warning when the figure is inside the band', () => {
    suggestion = suggested(24500);
    render(<SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule={false} onUseFigure={vi.fn()} />);
    expect(screen.queryByTestId('above-band')).toBeNull();
    expect(screen.getByText('Dept X')).toBeInTheDocument();
  });
});

describe('the Edit Salary dialog, pre-filled', () => {
  it('opens with the suggested monthly gross, Effective from on the 1st of NEXT month, and makes no save call', () => {
    render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('24500');
    // Not the current salary's date (1 April 2026, in the past).
    expect(screen.getByLabelText('Effective from')).toHaveValue('2026-10-01');
    // The picker itself starts at today in India in this flow.
    expect(screen.getByLabelText('Effective from')).toHaveAttribute('min', '2026-09-29');
    expect(screen.getByTestId('prefill-note')).toHaveTextContent('starting on 1 October 2026');
    expect(screen.queryByTestId('backdated-raise')).toBeNull();
    expect(save()).toBeEnabled();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('REFUSES a date in the past in the suggested-raise flow: a plain message, Save disabled, nothing saved', () => {
    render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-04-01' } });
    expect(screen.getByTestId('backdated-raise')).toHaveTextContent('A raise cannot start in the past.');
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(mutateAsync).not.toHaveBeenCalled();

    // Yesterday is the past too; today is allowed.
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-09-28' } });
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-09-29' } });
    expect(screen.queryByTestId('backdated-raise')).toBeNull();
    expect(save()).toBeEnabled();
  });

  it('rolls into January from December, and uses the date in INDIA, not the browser', () => {
    vi.setSystemTime(new Date('2026-12-15T06:30:00Z'));
    const { unmount } = render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    expect(screen.getByLabelText('Effective from')).toHaveValue('2027-01-01');
    unmount();
    // 30 Sep 19:00 UTC is already 1 October 00:30 in India.
    vi.setSystemTime(new Date('2026-09-30T19:00:00Z'));
    render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    expect(screen.getByLabelText('Effective from')).toHaveValue('2026-11-01');
  });

  it('without a figure: pay in force, the 1st of next month, and a past date refused (no backdating, 30 Sep / 1 Oct rulings)', () => {
    render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('21000');
    // Not the current salary's own date (1 April 2026, in the past).
    expect(screen.getByLabelText('Effective from')).toHaveValue('2026-10-01');
    expect(screen.queryByTestId('prefill-note')).toBeNull();
    expect(screen.getByLabelText('Effective from')).toHaveAttribute('min', '2026-09-29');
    fireEvent.change(screen.getByLabelText('Monthly gross'), { target: { value: '22000' } });
    expect(screen.queryByTestId('backdated-raise')).toBeNull();
    expect(save()).toBeEnabled();
    // Any future date is allowed for a direct change, not only a 1st.
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-10-17' } });
    expect(save()).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-04-01' } });
    expect(screen.getByTestId('backdated-raise')).toHaveTextContent(
      'A salary change cannot start in the past.'
    );
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('re-seeds when the same person is reopened with a figure', () => {
    const { rerender } = render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('21000');
    rerender(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('24500');
  });
});
