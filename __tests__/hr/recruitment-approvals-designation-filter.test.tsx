// @vitest-environment jsdom
// BUG-006259: the approvals Advanced Filters offer a Designation control, and
// choosing "Professor" keeps a PROFESSOR job and drops an Associate Professor job.
// jkkn-terminology: official-hr-designations
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ onValueChange: (v: string) => void }>({
    onValueChange: () => {},
  });
  type Slot = { children?: ReactNode };
  return {
    Select: ({
      value,
      onValueChange,
      ...rest
    }: Slot & { value?: string; onValueChange: (v: string) => void }) => (
      <Ctx.Provider value={{ onValueChange }}>
        <div data-testid="select" data-value={value}>
          {rest.children}
        </div>
      </Ctx.Provider>
    ),
    SelectTrigger: (p: Slot) => <div>{p.children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: (p: Slot) => <div>{p.children}</div>,
    SelectItem: ({ value, ...rest }: Slot & { value: string }) => {
      const { onValueChange } = React.useContext(Ctx);
      return (
        <button
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onValueChange(value)}
        >
          {rest.children}
        </button>
      );
    },
  };
});

import {
  ApprovalsFiltersPanel,
  EMPTY_APPROVALS_FILTERS,
  approvalRowMatchesFilters,
  type ApprovalsAdvancedFilters,
} from '@/app/(routes)/hr/recruitment/approvals/_components/approvals-filters-panel';
import type { ApprovalsJobOverviewRow } from '@/types/hr-recruitment';

function row(id: string, title: string): ApprovalsJobOverviewRow {
  return {
    job: {
      id,
      title,
      status: 'open',
      role_category: 'teaching',
      institution_id: 'inst-1',
      job_type: 'full_time',
      state: null,
      city: null,
      created_at: new Date().toISOString(),
    },
    applications_total: 1,
    applications_pending: 0,
    applications_reviewed: 0,
    applications_shortlisted: 0,
    applications_rejected: 0,
    applications_promoted: 0,
    in_approval: 0,
    approved: 0,
    joined: 0,
    awaiting_me: 0,
  } as unknown as ApprovalsJobOverviewRow;
}

const ROWS = [
  row('j1', 'PROFESSOR'),
  row('j2', 'Associate Professor'),
  row('j3', 'ASST PROF - RIT -- AHS'),
  row('j4', 'NURSING TUTOR'),
];

afterEach(cleanup);

describe('Approvals advanced filters: Designation (BUG-006259)', () => {
  it('renders a Designation control and Professor excludes Associate Professor', () => {
    const onChange = vi.fn();
    render(
      <ApprovalsFiltersPanel
        open
        rows={ROWS}
        institutionNameById={new Map()}
        value={EMPTY_APPROVALS_FILTERS}
        onChange={onChange}
      />
    );

    const designationSelect = screen
      .getAllByTestId('select')
      .find((el) => within(el).queryAllByText('All Designations').length > 0);
    expect(designationSelect).toBeTruthy();

    fireEvent.click(
      within(designationSelect as HTMLElement).getByRole('option', { name: 'Professor' })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ApprovalsAdvancedFilters;

    const kept = ROWS.filter((r) => approvalRowMatchesFilters(r, next)).map(
      (r) => r.job.title
    );
    expect(kept).toEqual(['PROFESSOR']);
  });
});
