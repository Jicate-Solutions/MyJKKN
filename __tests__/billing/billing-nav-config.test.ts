import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getNavConfigForPath, findActiveGroup } from '@/lib/navigation/nav-config';
import { resolveTiers } from '@/lib/navigation/tier-rendering';

const config = () => {
  const c = getNavConfigForPath('/billing');
  if (!c) throw new Error('billing nav-config is not registered in NAV_CONFIG_REGISTRY');
  return c;
};

const tier2 = (pathname: string) =>
  resolveTiers(pathname)[0].map((c) => c.label);

const activeTier2 = (pathname: string) =>
  resolveTiers(pathname)[0].filter((c) => c.isActive).map((c) => c.label);

const activeTier3 = (pathname: string) =>
  (resolveTiers(pathname)[1] ?? []).filter((c) => c.isActive).map((c) => c.label);

describe('Billing top navigation (AutoTabNav)', () => {
  // 'Settings' added 2026-10-01 (58c6987f64); 'Scholarships' added 2026-10-09 (dbaaf9e323),
  // mirroring the sidebar's own Scholarships menu.
  it('is registered and exposes the five sidebar domains as tier-2', () => {
    expect(config().module).toBe('billing');
    expect(tier2('/billing/schedule')).toEqual(['Colleges', 'Transport Fees', 'Schools', 'Scholarships', 'Settings']);
  });

  it('mirrors the sidebar split, plus the orphaned Receipt Templates page', () => {
    const [colleges, transport, schools, scholarships, settings] = config().groups;
    // 12 sidebar submenus + Receipt Templates, which has no other entry point.
    // (Discounts left Colleges for its own Scholarships group on 2026-10-09.)
    expect(colleges.children).toHaveLength(13);
    expect((colleges.children ?? []).filter((c) => /^\/billing\/(scholarships|discounts)/.test(c.href))).toEqual([]);
    expect(transport.children).toBeUndefined(); // single page, no tier-3
    expect(schools.children).toHaveLength(5);
    expect((scholarships.children ?? []).map((c) => c.href)).toEqual([
      '/billing/scholarships',
      '/billing/scholarships/new',
      '/billing/scholarships/setup',
    ]);
    expect((settings.children ?? []).map((c) => c.href)).toEqual([
      '/billing/categories',
      '/billing/reports',
      '/billing/analytics',
      '/billing/activities',
      '/billing/payment-accounts',
    ]);
  });

  // Every child href must be a real page, or the chip 404s.
  it('points every chip at a route that exists', () => {
    const hrefs = config().groups.flatMap((g) => [
      g.href,
      ...(g.children ?? []).map((c) => c.href),
    ]);
    const missing = hrefs.filter(
      (h) => !existsSync(join(process.cwd(), 'app/(routes)', h, 'page.tsx'))
    );
    expect(missing).toEqual([]);
  });

  // Colleges holds the bare '/billing' catch-all; the other three win on length.
  it.each([
    ['/billing', 'Colleges'],
    ['/billing/schedule', 'Colleges'],
    ['/billing/schedule/students/02ea8e45-509e-4e67-b4de-27933b2482e2', 'Colleges'],
    ['/billing/receipts', 'Colleges'],
    ['/billing/late-charges', 'Colleges'],
    ['/billing/transport', 'Transport Fees'],
    ['/billing/categories', 'Settings'],
    ['/billing/reports', 'Settings'],
    ['/billing/analytics', 'Settings'],
    ['/billing/activities', 'Settings'],
    ['/billing/payment-accounts', 'Settings'],
    ['/billing/school-fees', 'Schools'],
    ['/billing/school-fees/collect', 'Schools'],
    ['/billing/school-fees/term-calendar', 'Schools'],
  ])('activates exactly one tier-2 group on %s', (pathname, expected) => {
    expect(findActiveGroup(pathname, config())?.label).toBe(expected);
    expect(activeTier2(pathname)).toEqual([expected]);
  });

  // '/billing/schedule' is a prefix of '/billing/schedule/students', so plain
  // prefix matching would light both chips.
  it.each([
    ['/billing/schedule', 'Schedule · All Bills'],
    ['/billing/schedule/new', 'Schedule · All Bills'],
    ['/billing/schedule/bulk-create', 'Schedule · All Bills'],
    ['/billing/schedule/bulk-create/upload', 'Schedule · All Bills'],
    ['/billing/schedule/bulk-edit', 'Schedule · All Bills'],
    ['/billing/schedule/students', 'Schedule · Student Search'],
    ['/billing/coverage', 'Bill Coverage'],
    ['/billing/receipts', 'Receipts'],
  ])('activates exactly one Colleges chip on %s', (pathname, expected) => {
    expect(activeTier3(pathname)).toEqual([expected]);
  });

  it.each([
    ['/billing/categories', 'Categories'],
    ['/billing/reports', 'Reports'],
    ['/billing/payment-accounts', 'Payment Gateway Accounts'],
  ])('activates exactly one Settings chip on %s', (pathname, expected) => {
    expect(activeTier3(pathname)).toEqual([expected]);
  });

  it.each([
    ['/billing/school-fees', 'School Fee Plans'],
    ['/billing/school-fees/new', 'School Fee Plans'],
    ['/billing/school-fees/term-calendar', 'School Term Calendar'],
    ['/billing/school-fees/concessions', 'School Fee Concessions'],
    ['/billing/school-fees/generate', 'Generate School Fees'],
    ['/billing/school-fees/collect', 'School Bill Payment'],
  ])('activates exactly one Schools chip on %s', (pathname, expected) => {
    expect(activeTier3(pathname)).toEqual([expected]);
  });

  it('gives Transport Fees no tier-3 strip of its own', () => {
    expect(activeTier2('/billing/transport')).toEqual(['Transport Fees']);
    // No explicit children, so tier-3 falls back to the manifest — and
    // /billing/transport is a leaf, so nothing repeats the group chip.
    expect(resolveTiers('/billing/transport')[1] ?? []).toEqual([]);
  });
});
