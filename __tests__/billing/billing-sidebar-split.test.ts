import { describe, expect, it } from 'vitest';
import { GetPages } from '@/lib/sidebarMenuLink';

const billingGroup = (pathname: string) => {
  const group = GetPages(pathname).find((g) => g.groupLabel === 'Billing & Accounts');
  if (!group) throw new Error('Billing & Accounts group missing from the sidebar');
  return group;
};

/**
 * Every route the single "Billing" menu carried before the 2026-08-25 split.
 * The split rearranges them across three menus; it must not drop one.
 */
const PRE_SPLIT_ROUTES = [
  '/billing/categories',
  '/billing/schedule',
  '/billing/schedule/students',
  '/billing/coverage',
  '/billing/onboarding',
  '/billing/receipts',
  '/billing/discounts',
  '/billing/refunds',
  '/billing/refund-approvals',
  '/billing/receipt-cancellations',
  '/billing/apportionment',
  '/billing/invoices',
  '/billing/reports',
  '/billing/analytics',
  '/billing/activities',
  '/billing/payment-accounts',
  '/billing/transport',
  '/billing/late-charges',
  '/billing/school-fees',
  '/billing/school-fees/term-calendar',
  '/billing/school-fees/concessions',
  '/billing/school-fees/generate',
  '/billing/school-fees/collect',
];

describe('Billing & Accounts sidebar split', () => {
  it('exposes exactly three menus, in domain order', () => {
    expect(billingGroup('/billing').menus.map((m) => m.label)).toEqual([
      'Colleges',
      'Transport Fees',
      'Schools',
    ]);
  });

  it('drops none of the pre-split routes', () => {
    const menus = billingGroup('/billing').menus;
    const hrefs = new Set(
      menus.flatMap((m) => [m.href, ...m.submenus.map((s) => s.href)])
    );
    const missing = PRE_SPLIT_ROUTES.filter((r) => !hrefs.has(r));
    expect(missing).toEqual([]);
  });

  it('splits the routes 17 / 0 / 5 across the three menus', () => {
    const [colleges, transport, schools] = billingGroup('/billing').menus;
    expect(colleges.submenus).toHaveLength(17);
    // A direct link: an empty submenus[] is what makes the filter gate this
    // menu on its own billing.transport.view mapping.
    expect(transport.submenus).toHaveLength(0);
    expect(transport.href).toBe('/billing/transport');
    expect(schools.submenus).toHaveLength(5);
  });

  it('keeps school routes out of Colleges and college routes out of Schools', () => {
    const [colleges, , schools] = billingGroup('/billing').menus;
    expect(colleges.submenus.filter((s) => s.href.startsWith('/billing/school-fees'))).toEqual([]);
    expect(colleges.submenus.filter((s) => s.href.startsWith('/billing/transport'))).toEqual([]);
    expect(schools.submenus.every((s) => s.href.startsWith('/billing/school-fees'))).toBe(true);
  });

  // All three menus live under /billing, so the college predicate has to
  // exclude the other two prefixes. Drop that exclusion and every row lights up.
  it.each([
    ['/billing', 'Colleges'],
    ['/billing/schedule', 'Colleges'],
    ['/billing/schedule/students/02ea8e45-509e-4e67-b4de-27933b2482e2', 'Colleges'],
    ['/billing/receipts', 'Colleges'],
    ['/billing/categories', 'Colleges'],
    ['/billing/late-charges', 'Colleges'],
    ['/billing/transport', 'Transport Fees'],
    ['/billing/school-fees', 'Schools'],
    ['/billing/school-fees/collect', 'Schools'],
    ['/billing/school-fees/term-calendar', 'Schools'],
  ])('highlights exactly one menu on %s', (pathname, expected) => {
    const active = billingGroup(pathname).menus.filter((m) => m.active).map((m) => m.label);
    expect(active).toEqual([expected]);
  });

  // The pre-split comment warned that 'School Fee Plans' must not own the
  // sibling routes, or two rows highlight together.
  it.each([
    ['/billing/school-fees', 'School Fee Plans'],
    ['/billing/school-fees/new', 'School Fee Plans'],
    ['/billing/school-fees/term-calendar', 'School Term Calendar'],
    ['/billing/school-fees/concessions', 'School Fee Concessions'],
    ['/billing/school-fees/generate', 'Generate School Fees'],
    ['/billing/school-fees/collect', 'School Bill Payment'],
  ])('highlights exactly one Schools submenu on %s', (pathname, expected) => {
    const schools = billingGroup(pathname).menus.find((m) => m.label === 'Schools')!;
    const active = schools.submenus.filter((s) => s.active).map((s) => s.label);
    expect(active).toEqual([expected]);
  });
});
