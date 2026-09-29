// @vitest-environment jsdom
/**
 * "Use this figure" only FILLS IN the existing Edit Salary dialog. Nothing is
 * saved until the HR head presses Save there, exactly as today.
 *
 *   - the panel hands the suggested figure to its caller and writes nothing;
 *   - the dialog opens with that figure in Monthly gross, every other field
 *     (the effective date included) seeded exactly as it always is, and no save
 *     call is made;
 *   - opened again without a figure, it starts from the pay in force.
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
vi.mock('@/hooks/hr/use-salary-suggestion', () => ({
  useSalarySuggestion: () => ({ data: suggestion, isLoading: false, error: null }),
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
};

function suggested(figure: number): SalarySuggestionPayload {
  return {
    ruleSource: 'group',
    ruleUpdatedAt: null,
    suggestion: {
      verdict: 'suggested',
      lines: [{ label: 'Band floor for Office Assistant', amount: 20000, note: 'floor' }],
      suggested: figure,
      computed: figure,
      bandMin: 20000,
      bandMax: 30000,
      currentMonthlyPay: 21000,
      extrasEligible: [],
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it('offers no figure at all when the rule is not set, and links a super admin to the rule', () => {
    suggestion = {
      ruleSource: null,
      ruleUpdatedAt: null,
      suggestion: {
        verdict: 'rule_not_set',
        lines: [],
        suggested: null,
        computed: null,
        bandMin: 20000,
        bandMax: 30000,
        currentMonthlyPay: 21000,
        extrasEligible: [],
        reasons: [{ code: 'rule_not_set', text: 'not set' }],
      },
    };
    render(<SalarySuggestionSheet row={ROW} onOpenChange={() => {}} canManage canEditRule onUseFigure={vi.fn()} />);
    expect(screen.getByTestId('rule-not-set')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set the rule' })).toHaveAttribute(
      'href',
      '/hr/admin/policies/salary-suggestion'
    );
    expect(screen.queryByRole('button', { name: 'Use this figure' })).toBeNull();
    expect(screen.queryByTestId('suggested-figure')).toBeNull();
  });
});

describe('the Edit Salary dialog, pre-filled', () => {
  it('opens with the suggested monthly gross, the usual effective date, and makes no save call', () => {
    render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('24500');
    expect(screen.getByLabelText('Effective from')).toHaveValue('2026-04-01');
    expect(screen.getByTestId('prefill-note')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('without a figure, starts from the pay in force and shows no note', () => {
    render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('21000');
    expect(screen.queryByTestId('prefill-note')).toBeNull();
  });

  it('re-seeds when the same person is reopened with a figure', () => {
    const { rerender } = render(<EditSalaryDialog row={ROW} onOpenChange={() => {}} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('21000');
    rerender(<EditSalaryDialog row={ROW} onOpenChange={() => {}} prefillMonthlyGross={24500} />);
    expect(screen.getByLabelText('Monthly gross')).toHaveValue('24500');
  });
});
