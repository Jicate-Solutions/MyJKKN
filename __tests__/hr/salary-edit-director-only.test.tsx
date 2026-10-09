// @vitest-environment jsdom
/**
 * Only the Director list may change a salary; the salary Excel import is gone
 * (Director ruling, 30 Sep 2026 08:59).
 *
 * The database is the real gate (20270603090000: fn_hr_set_staff_salary and the
 * hr_staff_salaries guard refuse everyone else; rehearsed in
 * supabase/tests/hr-salary-no-backdating). These tests pin the app side:
 *  - the import route, its dialog, the template and the sheet parser are gone,
 *    and nothing still points at them (a request to the route is a 404);
 *  - the screens ask the DATABASE who may edit (fn_is_the_director) and fail
 *    closed on any error;
 *  - the staff form never sends a salary for someone not on the list;
 *  - the staff form's salary fields are read-only, with the note, for them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

const setSalary = vi.fn();
const setPayer = vi.fn();
const setAccount = vi.fn();
vi.mock('@/lib/services/hr/payroll/staff-salary-service', () => ({
  StaffSalaryService: { setSalary: (...a: unknown[]) => setSalary(...a) },
}));
vi.mock('@/lib/services/hr/payroll/staff-payroll-service', () => ({
  StaffPayrollService: { setPayer: (...a: unknown[]) => setPayer(...a) },
}));
vi.mock('@/lib/services/hr/payroll/staff-bank-account-service', () => ({
  StaffBankAccountService: { setAccount: (...a: unknown[]) => setAccount(...a) },
}));
// The signed-in person. useCanEditSalaries keys its answer by this id.
let authProfile: { id: string } | null = { id: 'user-a' };
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ profile: authProfile }) }));
vi.mock('@/hooks/hr/use-staff-payroll', () => ({
  usePayrollOrganizations: () => ({ data: [], isLoading: false }),
}));

import { useCanEditSalaries } from '@/hooks/hr/use-staff-salaries';
import { emptyOfficeValues, saveStaffOffice } from '@/lib/hr/payroll/staff-office';
import { OfficeSection } from '@/app/(routes)/staff/list/_components/office-section';
import { Form } from '@/components/ui/form';

const ROOT = path.resolve(__dirname, '../..');

// jsdom has no ResizeObserver; Radix's Switch measures itself with one.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= NoopResizeObserver;

beforeEach(() => {
  authProfile = { id: 'user-a' };
  rpc.mockReset();
  setSalary.mockReset();
  setPayer.mockReset();
  setAccount.mockReset();
});

// ---------------------------------------------------------------------------
// 1. The import is gone
// ---------------------------------------------------------------------------
describe('the salary Excel import is removed', () => {
  const GONE = [
    'app/api/hr/payroll/salaries/import/route.ts',
    'app/(routes)/hr/payroll/salaries/_components/salary-import-dialog.tsx',
    'app/(routes)/hr/payroll/salaries/_components/salary-template-export.ts',
    'lib/hr/payroll/parse-salary-sheet.ts',
    'lib/hr/payroll/validate-salary-upload.ts',
  ];

  it.each(GONE)('%s no longer exists (so the route answers 404)', (rel) => {
    expect(fs.existsSync(path.join(ROOT, rel))).toBe(false);
  });

  it('no source file still calls the route or imports the removed modules', () => {
    // Code references only: a fetch/URL to the route, or an import of a removed
    // module. (A prose mention in a comment elsewhere is not a caller.)
    const needles = [
      /['"`]\/api\/hr\/payroll\/salaries\/import/,
      /from\s+['"][^'"]*(salary-import-dialog|salary-template-export|parse-salary-sheet|validate-salary-upload)['"]/,
      /import\(\s*['"][^'"]*(salary-import-dialog|salary-template-export|parse-salary-sheet|validate-salary-upload)['"]/,
      /<SalaryImportDialog\b/,
    ];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !p.endsWith('salary-edit-director-only.test.tsx')) {
          const text = fs.readFileSync(p, 'utf8');
          for (const n of needles) if (n.test(text)) hits.push(`${path.relative(ROOT, p)}: ${n}`);
        }
      }
    };
    for (const d of ['app', 'lib', 'hooks', 'components', 'types', '__tests__', 'scripts']) {
      if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
    }
    expect(hits).toEqual([]);
    // Walks every source folder; allow for a busy machine.
  }, 60_000);

  it('the Employee Salaries page has no import, template or manage-key edit gate', () => {
    const page = fs.readFileSync(
      path.join(ROOT, 'app/(routes)/hr/payroll/salaries/page.tsx'),
      'utf8'
    );
    expect(page).not.toMatch(/Import salaries|Bulk edit template|setImportOpen/);
    expect(page).not.toMatch(/canAccess\('hr\.payroll\.salary', 'manage'\)/);
    expect(page).toMatch(/useCanEditSalaries\(\)/);
    expect(page).toMatch(/Only the Director can change a salary\./);
  });
});

// ---------------------------------------------------------------------------
// 2. Who may edit: asked of the database, fail closed
// ---------------------------------------------------------------------------
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCanEditSalaries', () => {
  it('asks fn_is_the_director and is true only on a true answer', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useCanEditSalaries(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpc).toHaveBeenCalledWith('fn_is_the_director');
    expect(result.current.canEdit).toBe(true);
  });

  it.each([
    ['false', { data: false, error: null }],
    ['null', { data: null, error: null }],
    ['an error (e.g. #4121 not applied yet)', { data: null, error: { message: 'function does not exist' } }],
  ])('is false on %s', async (_label, answer) => {
    rpc.mockResolvedValue(answer);
    const { result } = renderHook(() => useCanEditSalaries(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canEdit).toBe(false);
  });

  it('is false while still loading', () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCanEditSalaries(), { wrapper });
    expect(result.current.canEdit).toBe(false);
  });

  // Panel round 1 (2026-10-09): one tab, a sign-out and a different sign-in.
  it("never shows the previous person's answer: a new sign-in asks again", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const { result, rerender } = renderHook(() => useCanEditSalaries(), { wrapper: shared });
    await waitFor(() => expect(result.current.canEdit).toBe(true));

    authProfile = { id: 'user-b' };
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rerender();
    expect(result.current.canEdit).toBe(false);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canEdit).toBe(false);
  });

  it('asks nothing and is false before anyone is signed in', () => {
    authProfile = null;
    const { result } = renderHook(() => useCanEditSalaries(), { wrapper });
    expect(result.current.canEdit).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not cache an error as a "no": the next ask goes to the database again', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'network blip' } });
    const first = renderHook(() => useCanEditSalaries(), { wrapper: shared });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.canEdit).toBe(false);
    first.unmount();

    rpc.mockResolvedValueOnce({ data: true, error: null });
    const second = renderHook(() => useCanEditSalaries(), { wrapper: shared });
    await waitFor(() => expect(second.result.current.canEdit).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 3. The staff form never sends a salary for someone not on the list
// ---------------------------------------------------------------------------
function filledOffice() {
  const o = emptyOfficeValues();
  o.payer_org_id = 'org-new';
  o.salary.monthly_gross = '9000';
  o.salary.effective_from = '2099-01-01';
  return o;
}

describe('saveStaffOffice', () => {
  it('not on the list: payer is saved, the salary is NOT sent', async () => {
    const res = await saveStaffOffice({} as never, 'staff-1', filledOffice(), 'org-old', null, false);
    expect(setPayer).toHaveBeenCalledTimes(1);
    expect(setSalary).not.toHaveBeenCalled();
    expect(res.failures).toEqual([]);
  });

  it('a caller that does not say is treated as not on the list', async () => {
    await saveStaffOffice({} as never, 'staff-1', filledOffice(), 'org-old');
    expect(setSalary).not.toHaveBeenCalled();
  });

  it('on the list: the salary is sent', async () => {
    await saveStaffOffice({} as never, 'staff-1', filledOffice(), 'org-old', null, true);
    expect(setSalary).toHaveBeenCalledTimes(1);
    expect(setSalary.mock.calls[0][1]).toMatchObject({
      staffId: 'staff-1',
      monthlyGross: 9000,
      effectiveFrom: '2099-01-01',
    });
  });
});

// ---------------------------------------------------------------------------
// 4. The staff form's salary fields are read-only for someone not on the list
// ---------------------------------------------------------------------------
function Harness({ canEditSalary }: { canEditSalary?: boolean }) {
  const form = useForm({ defaultValues: { office: filledOffice() } });
  return (
    <Form {...form}>
      <form>
        <OfficeSection form={form as never} isEditing canEditSalary={canEditSalary} />
      </form>
    </Form>
  );
}

describe('OfficeSection salary fields', () => {
  it('not on the list: the note shows and the gross field is disabled; bank stays editable', () => {
    const { container } = render(<Harness canEditSalary={false} />);
    expect(screen.getByTestId('staff-salary-read-only-note').textContent).toContain(
      'Only the Director can change a salary.'
    );
    const gross = container.querySelector('input[name="office.salary.monthly_gross"]') as HTMLInputElement;
    expect(gross.matches(':disabled')).toBe(true);
    const bank = container.querySelector('input[name="office.bank.account_number"]') as HTMLInputElement;
    expect(bank.matches(':disabled')).toBe(false);
  });

  it('the default is read-only (a missing answer never opens the fields)', () => {
    const { container } = render(<Harness />);
    const gross = container.querySelector('input[name="office.salary.monthly_gross"]') as HTMLInputElement;
    expect(gross.matches(':disabled')).toBe(true);
  });

  it('on the list: no note, the gross field is editable', () => {
    const { container } = render(<Harness canEditSalary />);
    expect(screen.queryByTestId('staff-salary-read-only-note')).toBeNull();
    const gross = container.querySelector('input[name="office.salary.monthly_gross"]') as HTMLInputElement;
    expect(gross.matches(':disabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. A new start date with the same figures is not a change (2026-10-08)
// ---------------------------------------------------------------------------
// Director's ruling: a date-only change is not saved. Employee Salaries already
// refuses it; the team member form's Office tab must neither send it nor stay
// silent about it.
function onRecord() {
  const o = filledOffice();
  o.salary.effective_from = '2099-01-01';
  return o.salary;
}

function DateHarness({ effectiveFrom, gross = '9000', payer = 'org-new' }: {
  effectiveFrom: string;
  gross?: string;
  payer?: string;
}) {
  const office = filledOffice();
  office.payer_org_id = payer;
  office.salary.effective_from = effectiveFrom;
  office.salary.monthly_gross = gross;
  const form = useForm({ defaultValues: { office } });
  return (
    <Form {...form}>
      <form>
        <OfficeSection
          form={form as never}
          isEditing
          canEditSalary
          initialSalary={onRecord()}
          initialPayerOrgId='org-new'
        />
      </form>
    </Form>
  );
}

describe('team member form: a date-only salary change', () => {
  it('is not sent; payer and bank are unaffected', async () => {
    const office = filledOffice();
    office.salary.effective_from = '2099-02-01';
    const res = await saveStaffOffice({} as never, 'staff-1', office, 'org-new', onRecord(), true);
    expect(setSalary).not.toHaveBeenCalled();
    expect(setPayer).not.toHaveBeenCalled();
    expect(res).toEqual({ failures: [], savedAny: false });
  });

  it('a new date with a new figure is still sent, from that date', async () => {
    const office = filledOffice();
    office.salary.effective_from = '2099-02-01';
    office.salary.monthly_gross = '9500';
    await saveStaffOffice({} as never, 'staff-1', office, 'org-new', onRecord(), true);
    expect(setSalary).toHaveBeenCalledTimes(1);
    expect(setSalary.mock.calls[0][1]).toMatchObject({ monthlyGross: 9500, effectiveFrom: '2099-02-01' });
  });

  it('the Office tab says nothing has changed when only the date differs', () => {
    render(<DateHarness effectiveFrom='2099-02-01' />);
    expect(screen.getByTestId('nothing-changed').textContent).toContain(
      'Nothing has changed from the figure in force, so the salary will not be saved.'
    );
  });

  it('no note when the date is as on record, when a figure changed too, or when the payer changed', () => {
    const { unmount } = render(<DateHarness effectiveFrom='2099-01-01' />);
    expect(screen.queryByTestId('nothing-changed')).toBeNull();
    unmount();
    const second = render(<DateHarness effectiveFrom='2099-02-01' gross='9500' />);
    expect(screen.queryByTestId('nothing-changed')).toBeNull();
    second.unmount();
    render(<DateHarness effectiveFrom='2099-02-01' payer='org-other' />);
    expect(screen.queryByTestId('nothing-changed')).toBeNull();
  });
});
