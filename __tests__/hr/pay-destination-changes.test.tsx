// @vitest-environment jsdom
// =====================================================================
// HR: the weekly list of bank-account and paying-trust changes
// =====================================================================
// Director ruling, 1 Oct 2026: the HR head may change where a person's pay
// goes; every such change goes on a weekly list to the Director list. The
// database keeps the log (migration 20270614090000, rehearsed in
// supabase/tests/hr-pay-destination). These tests cover the words, the
// Monday route and the panel that only the Director list sees.
// =====================================================================
import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  describeChange,
  istWeekBounds,
  istWeekStart,
  personLabel,
  totalChanges,
  weeklyNoticeBody,
  weeklyNoticeTitle,
  type PayDestinationChange,
} from '@/lib/hr/payroll/pay-destination-changes';

const bankChange: PayDestinationChange = {
  change_id: 'c1', staff_id: 's1', staff_name: 'Priya R', staff_code: 'DCH061', college: 'JKKN Dental College',
  kind: 'bank',
  before: { holder: 'PRIYA R', account_last4: '9012', ifsc: 'SBIN0001234', bank: 'SBI' },
  after: { holder: 'PRIYA R', account_last4: '7777', ifsc: 'HDFC0000123', bank: 'HDFC' },
  changed_by_name: 'HR Head', changed_at: '2026-10-01T05:00:00Z', total_count: 2,
};
const payerChange: PayDestinationChange = {
  ...bankChange, change_id: 'c2', staff_name: 'Arun K', staff_code: 'DCH062', kind: 'payer',
  before: { organization_name: 'JKKN Educational Trust' }, after: { organization_name: 'JKKN Dental Trust' },
};

describe('the words', () => {
  it('a bank change names both accounts by their last 4 digits and bank, never a full number', () => {
    expect(describeChange(bankChange)).toBe('Bank account changed from account ending 9012 at SBI to account ending 7777 at HDFC');
  });
  it('first-time and removed accounts say so', () => {
    expect(describeChange({ ...bankChange, before: null })).toBe('Bank account recorded: account ending 7777 at HDFC');
    expect(describeChange({ ...bankChange, after: null })).toBe('Bank account removed: was account ending 9012 at SBI');
  });
  it('a paying-trust change names both trusts', () => {
    expect(describeChange(payerChange)).toBe('Paying trust changed from JKKN Educational Trust to JKKN Dental Trust');
    expect(describeChange({ ...payerChange, after: null })).toBe('Paying trust removed: was JKKN Educational Trust');
  });
  it('the person is named with their code and college', () => {
    expect(personLabel(bankChange)).toBe('Priya R (DCH061), JKKN Dental College');
    expect(personLabel({ staff_name: null, staff_code: null, college: null })).toBe('A team member');
  });
  it('a quiet week still sends a notice that says none', () => {
    expect(weeklyNoticeTitle(0)).toBe('Bank and paying-trust changes last week: none');
    expect(weeklyNoticeBody([])).toBe('No bank account or paying trust was changed last week.');
  });
  it('the notice lists each change with who made it, and points to the rest', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...bankChange, change_id: `c${i}` }));
    const body = weeklyNoticeBody(many);
    expect(body).toContain('Priya R (DCH061), JKKN Dental College: Bank account changed from account ending 9012 at SBI to account ending 7777 at HDFC, by HR Head.');
    expect(body).toContain('And 2 more on the salaries page.');
    expect(weeklyNoticeTitle(8)).toBe('Bank and paying-trust changes last week: 8');
  });
  it('a person whose record was deleted is still named, from the kept snapshot', () => {
    const recordDeleted: PayDestinationChange = { ...bankChange, staff_id: null };
    expect(personLabel(recordDeleted)).toBe('Priya R (DCH061), JKKN Dental College');
  });
  it('past the 2,000-row cap the notice states the true count, never the rows it got', () => {
    const capped = Array.from({ length: 8 }, (_, i) => ({ ...bankChange, change_id: `c${i}`, total_count: 2345 }));
    expect(totalChanges(capped)).toBe(2345);
    expect(weeklyNoticeBody(capped)).toContain('And 2339 more on the salaries page.');
    expect(totalChanges([])).toBe(0);
    // A missing or smaller total never under-counts the rows actually returned.
    expect(totalChanges([{ total_count: undefined as unknown as number }, { total_count: 0 }])).toBe(2);
  });
  it('a salary register whose account number was edited, or is not the one on file, says so', () => {
    const reg: PayDestinationChange = {
      ...bankChange, kind: 'register_bank',
      before: { account_last4: '1212', register_run_id: 'r1' }, after: { account_last4: '5555', register_run_id: 'r1' },
    };
    expect(describeChange(reg)).toBe('Bank account on a salary register changed from account ending 1212 to account ending 5555');
    expect(describeChange({ ...reg, after: { account_last4: '9090', differs_from_file: true }, before: bankChange.before }))
      .toBe('A salary register pays account ending 9090, but the account on file is account ending 9012 at SBI');
    expect(describeChange({ ...reg, after: { account_last4: '9090', differs_from_file: true }, before: null }))
      .toBe('A salary register pays account ending 9090, but no account is on file');
    expect(describeChange({ ...reg, after: null })).toBe('Bank account on a salary register cleared: was account ending 1212');
  });
  it('a salary register whose paying trust was edited, or is not the one on file, says so', () => {
    const reg: PayDestinationChange = {
      ...bankChange, kind: 'register_payer',
      before: { organization_id: 'o1', organization_name: 'JKKN Educational Trust', register_run_id: 'r1' },
      after: { organization_id: 'o2', organization_name: 'JKKN Dental Trust', register_run_id: 'r1' },
    };
    expect(describeChange(reg)).toBe('Paying trust on a salary register changed from JKKN Educational Trust to JKKN Dental Trust');
    expect(describeChange({ ...reg, after: { ...reg.after, differs_from_file: true } }))
      .toBe('A salary register names JKKN Dental Trust as the paying trust, but the paying trust on file is JKKN Educational Trust');
    expect(describeChange({ ...reg, before: null, after: { ...reg.after, differs_from_file: true } }))
      .toBe('A salary register names JKKN Dental Trust as the paying trust, but no paying trust is on file');
    expect(describeChange({ ...reg, after: null })).toBe('Paying trust on a salary register cleared: was JKKN Educational Trust');
  });
  it('the notice covers one fixed IST week, Monday 00:00 to Monday 00:00, whenever it runs', () => {
    // Monday 08:17 IST and the same Monday's late retry at 23:00 IST: the same week.
    const onTime = istWeekBounds(Date.parse('2026-10-05T02:47:00Z'));
    const late = istWeekBounds(Date.parse('2026-10-05T17:30:00Z'));
    expect(onTime).toEqual({ since: '2026-09-27T18:30:00.000Z', until: '2026-10-04T18:30:00.000Z' });
    expect(late).toEqual(onTime);
    // The next edition starts exactly where this one stopped: nothing falls between.
    const next = istWeekBounds(Date.parse('2026-10-12T02:47:00Z'));
    expect(next.since).toBe(onTime.until);
    // A change at Monday 03:00 IST is after this edition's end and inside the next one.
    const mondayEarly = Date.parse('2026-10-04T21:30:00Z');
    expect(mondayEarly >= Date.parse(onTime.until)).toBe(true);
    expect(mondayEarly >= Date.parse(next.since) && mondayEarly < Date.parse(next.until)).toBe(true);
  });
  it('the week is the IST week, so a Sunday-night run and a Monday run are different editions', () => {
    expect(istWeekStart(Date.parse('2026-10-05T03:00:00Z'))).toBe('2026-10-05'); // Monday 08:30 IST
    expect(istWeekStart(Date.parse('2026-10-04T17:00:00Z'))).toBe('2026-09-28'); // Sunday 22:30 IST
    expect(istWeekStart(Date.parse('2026-10-04T19:00:00Z'))).toBe('2026-10-05'); // Monday 00:30 IST
  });
});

// ---------------------------------------------------------------------
// The Monday route
// ---------------------------------------------------------------------
const db = vi.hoisted(() => ({
  listRow: null as null | { value: unknown; is_active: boolean },
  listError: null as null | { message: string },
  rpcRows: [] as unknown[],
  rpcError: null as null | { message: string },
  rpcArgs: [] as unknown[],
}));
const fan = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const q: any = { select: () => q, eq: () => q, is: () => q, maybeSingle: async () => ({ data: db.listRow, error: db.listError }) };
      return q;
    },
    rpc: async (_n: string, args: unknown) => { db.rpcArgs.push(args); return { data: db.rpcRows, error: db.rpcError }; },
  }),
}));
vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: async (_c: unknown, o: Record<string, unknown>) => { fan.calls.push(o); return { notified: (o.userIds as string[]).length, skipped: false }; },
}));
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/hr-pay-destination-weekly/route';

const call = (auth?: string, query = '') =>
  GET(new NextRequest(`http://localhost/api/cron/hr-pay-destination-weekly${query}`, { headers: auth ? { authorization: auth } : {} }));

describe('the Monday route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    db.listRow = { value: ['d1', 'd6'], is_active: true }; db.listError = null;
    db.rpcRows = [bankChange, payerChange]; db.rpcError = null; db.rpcArgs = [];
    fan.calls = [];
  });

  it('refuses without the Bearer secret, and never accepts it in the address', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect((await call(undefined, '?secret=cron-secret')).status).toBe(401);
    expect(fan.calls).toHaveLength(0);
  });

  it('sends one notice to everyone on the Director list, read from the list itself', async () => {
    const res = await call('Bearer cron-secret');
    expect(res.status).toBe(200);
    expect(fan.calls).toHaveLength(1);
    expect(fan.calls[0].userIds).toEqual(['d1', 'd6']);
    expect(fan.calls[0].title).toBe('Bank and paying-trust changes last week: 2');
    expect(fan.calls[0].url).toBe('/hr/payroll/salaries#pay-destination-changes');
    expect(String(fan.calls[0].idempotencyKey)).toMatch(/^hr-pay-destination-weekly:\d{4}-\d{2}-\d{2}$/);
    expect(fan.calls[0].priority).toBe('high');
  });

  it('asks for last IST week with both ends fixed, so a late run covers the same changes', async () => {
    await call('Bearer cron-secret');
    const args = db.rpcArgs[0] as { p_since: string; p_until: string };
    const week = istWeekBounds();
    expect(args).toEqual({ p_since: week.since, p_until: week.until });
    expect(Date.parse(args.p_until) - Date.parse(args.p_since)).toBe(7 * 86_400_000);
    expect(Date.parse(args.p_until)).toBeLessThanOrEqual(Date.now());
  });

  it('past the cap, the notice and the run report the true count', async () => {
    db.rpcRows = [{ ...bankChange, total_count: 2345 }, { ...payerChange, total_count: 2345 }];
    const res = await call('Bearer cron-secret');
    const json = await res.json();
    expect(fan.calls[0].title).toBe('Bank and paying-trust changes last week: 2345');
    expect(String(fan.calls[0].body)).toContain('And 2343 more on the salaries page.');
    expect((fan.calls[0].metadata as { count: number }).count).toBe(2345);
    expect(json.count).toBe(2345);
    expect(json.listed).toBe(2);
  });

  it('a quiet week still sends, at normal priority', async () => {
    db.rpcRows = [];
    await call('Bearer cron-secret');
    expect(fan.calls[0].title).toBe('Bank and paying-trust changes last week: none');
    expect(fan.calls[0].priority).toBe('normal');
  });

  it('fails loud (500) when the Director list is empty, switched off or unreadable', async () => {
    db.listRow = { value: [], is_active: true };
    expect((await call('Bearer cron-secret')).status).toBe(500);
    db.listRow = { value: ['d1'], is_active: false };
    expect((await call('Bearer cron-secret')).status).toBe(500);
    db.listRow = null; db.listError = { message: 'down' };
    expect((await call('Bearer cron-secret')).status).toBe(500);
    expect(fan.calls).toHaveLength(0);
  });

  it('fails loud when the change list cannot be read', async () => {
    db.rpcError = { message: 'boom' };
    expect((await call('Bearer cron-secret')).status).toBe(500);
    expect(fan.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// The panel on Employee Salaries
// ---------------------------------------------------------------------
const hooks = vi.hoisted(() => ({
  isDirector: false, rows: [] as unknown[], days: [] as number[],
  error: null as Error | null, refetch: (() => undefined) as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock('@/hooks/hr/payroll/use-pay-destination-changes', () => ({
  useIsTheDirector: () => ({ data: hooks.isDirector }),
  usePayDestinationChanges: (days: number, enabled: boolean) => { hooks.days.push(days); return { data: enabled ? hooks.rows : undefined, isLoading: false, error: hooks.error, refetch: hooks.refetch }; },
}));
import { PayDestinationChanges } from '@/app/(routes)/hr/payroll/salaries/_components/pay-destination-changes';

describe('the panel', () => {
  beforeEach(() => { hooks.isDirector = false; hooks.rows = [bankChange, payerChange]; hooks.days = []; hooks.error = null; hooks.refetch = vi.fn(); });

  it('renders nothing for anyone not on the Director list', () => {
    const { container } = render(<PayDestinationChanges />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each change, who made it, and lets the Director widen the window', () => {
    hooks.isDirector = true;
    render(<PayDestinationChanges />);
    expect(screen.getByText(/Only the Director list sees this\./)).toBeInTheDocument();
    expect(screen.getAllByTestId('pay-destination-change')).toHaveLength(2);
    expect(screen.getByText('Priya R (DCH061), JKKN Dental College')).toBeInTheDocument();
    expect(screen.getByText(/Bank account changed from account ending 9012 at SBI to account ending 7777 at HDFC\. By HR Head/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(hooks.days.at(-1)).toBe(30);
  });

  it('past the cap, says plainly how many are not shown', () => {
    hooks.isDirector = true;
    hooks.rows = [{ ...bankChange, total_count: 2345 }, { ...payerChange, total_count: 2345 }];
    render(<PayDestinationChanges />);
    expect(screen.getByTestId('pay-destination-cap')).toHaveTextContent('Showing the newest 2 of 2,345 changes in the last 7 days.');
  });

  it('under the cap, no count line', () => {
    hooks.isDirector = true;
    render(<PayDestinationChanges />);
    expect(screen.queryByTestId('pay-destination-cap')).not.toBeInTheDocument();
  });

  it('says plainly when nothing changed', () => {
    hooks.isDirector = true; hooks.rows = [];
    render(<PayDestinationChanges />);
    expect(screen.getByText('No bank account or paying trust was changed in the last 7 days.')).toBeInTheDocument();
  });

  it('says plainly when nothing changed in the widest window too', () => {
    hooks.isDirector = true; hooks.rows = [];
    render(<PayDestinationChanges />);
    fireEvent.click(screen.getByRole('button', { name: 'Last 90 days' }));
    expect(screen.getByText('No bank account or paying trust was changed in the last 90 days.')).toBeInTheDocument();
    expect(screen.queryAllByTestId('pay-destination-change')).toHaveLength(0);
  });

  it('a refusal shows a plain sentence and a retry, never the raw database message', () => {
    hooks.isDirector = true;
    hooks.error = new Error('Only the Director list can read the bank and payer change list.');
    render(<PayDestinationChanges />);
    expect(screen.getByText('This list is only for the Director list, and your account is not on it.')).toBeInTheDocument();
    expect(screen.queryByText(/Only the Director list can read/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(hooks.refetch).toHaveBeenCalledTimes(1);
  });

  it('any other failure shows a plain sentence and a retry', () => {
    hooks.isDirector = true;
    hooks.error = new Error('JWT expired');
    render(<PayDestinationChanges />);
    expect(screen.getByText('The list of changes could not be loaded just now.')).toBeInTheDocument();
    expect(screen.queryByText(/JWT expired/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
