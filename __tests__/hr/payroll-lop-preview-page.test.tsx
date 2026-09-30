// @vitest-environment jsdom

/**
 * What the absence preview SAYS when nobody on the payroll can be paid.
 *
 * Found driving the page in a browser on 2026-09-29: with every person left
 * off (their work location had not closed the month), the payable table's
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

let preview: LopPreviewResult | undefined;
let previewError: Error | null = null;

vi.mock('@/hooks/hr/payroll/use-payroll-lop-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/hr/payroll/use-payroll-lop-preview')>();
  return {
    ...actual,
    usePayrollLopPreview: () => ({ data: preview, isLoading: false, error: previewError }),
  };
});
vi.mock('@/components/auth/admin-permission-guard', () => ({
  SuperAdminOnly: (p: React.PropsWithChildren) => <>{p.children}</>,
}));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: (p: React.PropsWithChildren) => <div>{p.children}</div>,
}));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));

import PayrollLopPreviewPage from '@/app/(routes)/hr/admin/payroll/periods/[id]/lop-preview/page';
import { LopPreviewRequestError } from '@/hooks/hr/payroll/use-payroll-lop-preview';

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
    basic_pay: null,
    allowance_paid: 0,
    pf: 0,
    esi: 0,
    pf_exempt: false,
    esi_exempt: false,
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
    month_not_closed_count: rows.filter((r) => !r.payable && r.reason === LEFT_OFF).length,
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

afterEach(() => {
  cleanup();
  previewError = null;
});

function payableRow(staff_id: string, name: string): LopPreviewResult['rows'][number] {
  return {
    ...skipped(staff_id, name),
    payable: true,
    reason: null,
    business_working_days: 22,
    paid_days: 22,
    full_gross: 28500,
    gross_after_lop: 28500,
    total_deductions: 3620,
    net_pay: 24880,
  };
}

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

describe('absence preview — the "close attendance first" advice', () => {
  it('is NOT shown when every person is payable', () => {
    preview = result([payableRow('s1', 'Priya D'), payableRow('s2', 'Arun M')]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.queryByTestId('close-attendance-banner')).toBeNull();
    expect(screen.queryByText(/Close attendance before/)).toBeNull();
  });

  it('is NOT shown when people are left off for a reason other than an open month', () => {
    preview = result([
      payableRow('s1', 'Priya D'),
      { ...skipped('s2', 'Arun M'), reason: 'No pay scale configured for this designation/cadre' },
    ]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.queryByTestId('close-attendance-banner')).toBeNull();
  });

  it('IS shown, with the count, when people are left off because the month is still open', () => {
    preview = result([payableRow('s1', 'Priya D'), skipped('s2', 'Kavitha R'), skipped('s3', 'Senthil K')]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    const banner = screen.getByTestId('close-attendance-banner');
    expect(banner.textContent).toMatch(/Close attendance before/);
    expect(banner.textContent).toMatch(/2 person\(s\) are left off/);
  });

  it('uses the verb the attendance module uses ("close"), the same one as the skip reason beside it', () => {
    // The attendance screen is "Month Close" with a "Closed" badge, and the
    // skip reason on this page says "has not closed attendance". A banner
    // saying "locked" for the same state reads as a second, separate step.
    preview = result([payableRow('s1', 'Priya D'), skipped('s2', 'Kavitha R')]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    const banner = screen.getByTestId('close-attendance-banner').textContent ?? '';
    expect(banner).toMatch(/has not closed attendance for this month/);
    expect(banner).not.toMatch(/lock/i);
    expect(LEFT_OFF).toMatch(/has not closed attendance for this month/);
  });
});

describe('absence preview — a refusal reads as a refusal', () => {
  it('says "no access" (not "could not work out") on a 403', () => {
    preview = undefined;
    previewError = new LopPreviewRequestError(403, 'This preview … open only to platform administrators');
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.getByText('You don’t have access to this preview')).toBeTruthy();
    expect(screen.queryByText(/Could not work out/)).toBeNull();
  });

  it('still says "could not work out" on a real fault', () => {
    preview = undefined;
    previewError = new LopPreviewRequestError(500, 'Failed to load the frozen day counts');
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.getByText('Could not work out this month’s absence')).toBeTruthy();
  });
});

describe('absence preview — pay, PF and allowance as HR recorded them (rulings 2026-09-30)', () => {
  it('prints "basic not recorded", the PF HR typed, and "not eligible" where HR said so', () => {
    preview = result([
      { ...payableRow('s1', 'Priya D'), basic_pay: 12000, pf: 1800, esi: 0, esi_exempt: true },
      { ...payableRow('s2', 'Arun M'), basic_pay: null, pf: 0, pf_exempt: true, esi_exempt: true },
    ]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.getByText('Basic')).toBeTruthy();
    // Exactly one person has no basic, and only that row says so.
    expect(screen.getAllByTestId('basic-not-recorded')).toHaveLength(1);
    expect(screen.getByText('basic not recorded')).toBeTruthy();
    expect(screen.getByText(/₹12,000/)).toBeTruthy();

    const notes = screen.getAllByTestId('statutory-note').map((n) => n.textContent);
    expect(notes).toEqual([
      'PF ₹1,800 · No ESI (not eligible)',
      'No PF (not eligible) · No ESI (not eligible)',
    ]);
    // PF is never described as "not worked out" any more.
    expect(screen.queryByText(/not worked out/)).toBeNull();
  });

  it('says how much allowance is inside the month’s pay', () => {
    preview = result([
      { ...payableRow('s1', 'Priya D'), full_gross: 20000, allowance_paid: 2000 },
      payableRow('s2', 'Arun M'),
    ]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    const notes = screen.getAllByTestId('allowance-note');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe('incl. allowance ₹2,000 paid');
  });

  it('a skipped person is listed with the reason, not silently dropped', () => {
    preview = result([
      payableRow('s1', 'Priya D'),
      {
        ...skipped('s2', 'Nila S'),
        reason:
          'No current salary recorded for this person — record their monthly gross on the Salaries screen, then rerun. Nobody is paid a guessed figure.',
      },
    ]);
    render(<PayrollLopPreviewPage params={resolvedParams('p1')} />);

    expect(screen.getByText('Nila S')).toBeTruthy();
    expect(screen.getByText(/No current salary recorded for this person/)).toBeTruthy();
  });
});
