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
  '/billing/scholarships',
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
  // A fourth menu, 'Settings', was added 2026-10-01 (58c6987f64) for the
  // group-wide pages (Categories, Reports, Analytics, Activities, Payment
  // Gateway Accounts) that used to sit at the bottom of Colleges. A fifth,
  // 'Scholarships', was split out of Colleges 2026-10-09; it sits before
  // Settings, which stays last.
  it('exposes exactly five menus, in domain order', () => {
    expect(billingGroup('/billing').menus.map((m) => m.label)).toEqual([
      'Colleges',
      'Transport Fees',
      'Schools',
      'Scholarships',
      'Settings',
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

  // Colleges: 17 at the split, +1 Bill Cancellations (dc2495ff05, 28 Sep),
  // -5 group-wide pages moved to Settings (58c6987f64, 1 Oct), -1 Scholarships
  // moved to its own menu (2026-10-09) = 12.
  it('splits the routes 12 / 0 / 5 / 3 / 5 across the five menus', () => {
    const [colleges, transport, schools, scholarships, settings] = billingGroup('/billing').menus;
    expect(colleges.submenus).toHaveLength(12);
    expect(scholarships.submenus.map((s) => s.href)).toEqual([
      '/billing/scholarships',
      '/billing/scholarships/new',
      '/billing/scholarships/setup',
    ]);
    // A direct link: an empty submenus[] is what makes the filter gate this
    // menu on its own billing.transport.view mapping.
    expect(transport.submenus).toHaveLength(0);
    expect(transport.href).toBe('/billing/transport');
    expect(schools.submenus).toHaveLength(5);
    expect(settings.submenus.map((s) => s.href)).toEqual([
      '/billing/categories',
      '/billing/reports',
      '/billing/analytics',
      '/billing/activities',
      '/billing/payment-accounts',
    ]);
  });

  it('lists every billing route in exactly one menu', () => {
    const hrefs = billingGroup('/billing').menus.flatMap((m) => m.submenus.map((s) => s.href));
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps school routes out of Colleges and college routes out of Schools', () => {
    const [colleges, , schools] = billingGroup('/billing').menus;
    expect(colleges.submenus.filter((s) => s.href.startsWith('/billing/school-fees'))).toEqual([]);
    expect(colleges.submenus.filter((s) => s.href.startsWith('/billing/transport'))).toEqual([]);
    expect(colleges.submenus.filter((s) => s.href.startsWith('/billing/scholarships'))).toEqual([]);
    expect(schools.submenus.every((s) => s.href.startsWith('/billing/school-fees'))).toBe(true);
  });

  // All four menus live under /billing, so the college predicate has to
  // exclude the other prefixes. Drop that exclusion and every row lights up.
  it.each([
    ['/billing', 'Colleges'],
    ['/billing/schedule', 'Colleges'],
    ['/billing/schedule/students/02ea8e45-509e-4e67-b4de-27933b2482e2', 'Colleges'],
    ['/billing/receipts', 'Colleges'],
    ['/billing/late-charges', 'Colleges'],
    ['/billing/bill-cancellations', 'Colleges'],
    ['/billing/categories', 'Settings'],
    ['/billing/reports', 'Settings'],
    ['/billing/analytics', 'Settings'],
    ['/billing/activities', 'Settings'],
    ['/billing/payment-accounts', 'Settings'],
    ['/billing/transport', 'Transport Fees'],
    ['/billing/school-fees', 'Schools'],
    ['/billing/school-fees/collect', 'Schools'],
    ['/billing/school-fees/term-calendar', 'Schools'],
    ['/billing/scholarships', 'Scholarships'],
    ['/billing/scholarships/new', 'Scholarships'],
    ['/billing/scholarships/setup', 'Scholarships'],
    ['/billing/scholarships/02ea8e45-509e-4e67-b4de-27933b2482e2', 'Scholarships'],
    ['/billing/scholarships/02ea8e45-509e-4e67-b4de-27933b2482e2/edit', 'Scholarships'],
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

  // 'All Scholarships' owns the list plus its /[id] and /[id]/edit pages but
  // NOT /new or /setup, which have their own rows.
  it.each([
    ['/billing/scholarships', 'All Scholarships'],
    ['/billing/scholarships/02ea8e45-509e-4e67-b4de-27933b2482e2', 'All Scholarships'],
    ['/billing/scholarships/02ea8e45-509e-4e67-b4de-27933b2482e2/edit', 'All Scholarships'],
    ['/billing/scholarships/new', 'Apply Scholarship'],
    ['/billing/scholarships/setup', 'Categories & Types'],
  ])('highlights exactly one Scholarships submenu on %s', (pathname, expected) => {
    const scholarships = billingGroup(pathname).menus.find((m) => m.label === 'Scholarships')!;
    const active = scholarships.submenus.filter((s) => s.active).map((s) => s.label);
    expect(active).toEqual([expected]);
  });
});
