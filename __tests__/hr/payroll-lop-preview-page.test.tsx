// @vitest-environment jsdom

/**
 * What the absence preview SAYS when nobody on the payroll can be paid.
 *
 * Found driving the page in a browser on 2026-09-29: with every person left
 * off (their work location had not locked the month), the payable table's
 * heading read "All 0 people were present for every working day" and the
 * "days not paid for" / "held back" figures were coloured green — a payroll
 * that can pay nobody, presented as a clean month.
 *
 * The page is rendered for real; only the data hook and the site chrome are
 * stubbed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import type { LopPreviewResult } from '@/lib/services/hr/payroll/payslip-generator';

let preview: LopPreviewResult;

vi.mock('@/hooks/hr/payroll/use-payroll-lop-preview', () => ({
  usePayrollLopPreview: () => ({ data: preview, isLoading: false, error: null }),
}));
vi.mock('@/components/auth/admin-permission-guard', () => ({
  SuperAdminOnly: (p: React.PropsWithChildren) => <>{p.children}</>,
}));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: (p: React.PropsWithChildren) => <div>{p.children}</div>,
}));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));

import PayrollLopPreviewPage from '@/app/(routes)/hr/admin/payroll/periods/[id]/lop-preview/page';

const LEFT_OFF =
  'Their work location has not closed attendance for this month yet — close it, then rerun.';

function skipped(staff_id: string, name: string): LopPreviewResult['rows'][number] {
  return {
    staff_id,
    name,
    work_institution_id: 'inst-1',
    payable: false,
    reason: LEFT_OFF,
    business_working_days: 0,
    paid_days: 0,
    lop_days: 0,
    unprocessed_days: 0,
    full_gross: 0,
    lop_amount: 0,
    gross_after_lop: 0,
    total_deductions: 0,
    net_pay: 0,
  };
}

function result(rows: LopPreviewResult['rows']): LopPreviewResult {
  const payable = rows.filter((r) => r.payable);
  return {
    period: {
      id: 'p1',
      period_year: 2026,
      period_month: 8,
      status: 'draft',
      engine_type: 'aided',
      institution_id: 'inst-1',
    },
    rows,
    payable_count: payable.length,
    skipped_count: rows.length - payable.length,
    total_lop_days: payable.reduce((t, r) => t + r.lop_days, 0),
    totals: {
      full_gross: payable.reduce((t, r) => t + r.full_gross, 0),
      lop_amount: payable.reduce((t, r) => t + r.lop_amount, 0),
      gross_after_lop: payable.reduce((t, r) => t + r.gross_after_lop, 0),
      deductions: payable.reduce((t, r) => t + r.total_deductions, 0),
      net: payable.reduce((t, r) => t + r.net_pay, 0),
    },
    warnings: [],
  };
}

/** A promise React's `use` reads synchronously, so nothing suspends. */
function resolvedParams(id: string) {
  const p = Promise.resolve({ id }) as Promise<{ id: string }> & {
    status?: string;
    value?: { id: string };
  };
  p.status = 'fulfilled';
  p.value = { id };
  return p;
}

function toneOf(label: string): string | null {
  const card = screen.getByText(label).parentElement!;
  return card.querySelector('[data-tone]')!.getAttribute('data-tone');
}

afterEach(cleanup);

describe('absence preview — a payroll that can pay nobody', () => {
  it('does not announce that "All 0 people were present"', () => {
    preview = result([skipped('s1', 'Kavitha R'), skipped('s2', 'Senthil K')]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.queryByText(/All 0 people/)).toBeNull();
    expect(screen.getByText('Nobody on this payroll can be paid yet')).toBeTruthy();
    // Both people still listed, each with why.
    expect(screen.getByText('2 person(s) are not on this payroll')).toBeTruthy();
  });

  it('does not colour the absence figures green when nobody was checked', () => {
    preview = result([skipped('s1', 'Kavitha R')]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(toneOf('Days not paid for')).toBe('plain');
    expect(toneOf('Held back for absence')).toBe('plain');
  });

  it('still says "All N present" and green on a genuinely clean month', () => {
    preview = result([
      {
        ...skipped('s1', 'Priya D'),
        payable: true,
        reason: null,
        business_working_days: 22,
        paid_days: 22,
        full_gross: 28500,
        gross_after_lop: 28500,
        total_deductions: 3620,
        net_pay: 24880,
      },
    ]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.getByText('All 1 people were present for every working day')).toBeTruthy();
    expect(toneOf('Days not paid for')).toBe('ok');
  });
});
