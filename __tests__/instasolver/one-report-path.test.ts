// ONE report path (Director, 5–6 Oct 2026): the two InstaSolvers merge into
// one. Reporting goes only through the chooser at /instasolver; the desk from
// #4191 is no longer a second way in, and its screens sit under Administration.
import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

import { GetPages, MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { routeMatcher } from '@/lib/auth/route-matcher';
import { hasMyComplaintsPage } from '@/lib/instasolver/follow-up-links';
import { findActiveGroup } from '@/lib/navigation/nav-config';
import navConfig from '@/app/(routes)/instasolver/nav-config';
import NewIssuePage from '@/app/(routes)/instasolver/issues/new/page';
import NewRequirementPage from '@/app/(routes)/instasolver/requirements/new/page';
import {
  REPORTING_MOVED_HREF,
  cameFromOldDeskLink
} from '@/lib/instasolver/one-report-path';

const DESK_SCREENS = [
  '/instasolver/dashboard',
  '/instasolver/issues',
  '/instasolver/requirements',
  '/instasolver/triage',
  '/instasolver/work',
  '/instasolver/workload',
  '/instasolver/analytics'
];

const instaSolverRow = () => {
  for (const g of GetPages('/instasolver')) {
    const row = g.menus.find((m) => m.href === '/instasolver');
    if (row) return row;
  }
  throw new Error('InstaSolver row missing from the sidebar');
};

describe('sidebar: one way to report', () => {
  it('lists the chooser, your own reports, buying and administration only', () => {
    expect(instaSolverRow().submenus.map((s) => s.href)).toEqual([
      '/instasolver',
      '/instasolver/my-reports',
      '/instasolver/my-complaints',
      '/procurement/requests/new',
      '/instasolver/admin'
    ]);
  });

  it('has no desk report form and no desk screen', () => {
    const hrefs = instaSolverRow().submenus.map((s) => s.href);
    for (const h of [...DESK_SCREENS, '/instasolver/issues/new', '/instasolver/requirements/new']) {
      expect(hrefs).not.toContain(h);
    }
  });

  it('shows Request an item only to people who may raise a purchase request', () => {
    expect(MENU_PERMISSIONS['/procurement/requests/new']).toBe('procurement.request_create');
  });

  it('shows Administration only to the CAO', () => {
    expect(MENU_PERMISSIONS['/instasolver/admin']).toBe('instasolver.triage');
  });
});

describe('tab row: the chooser and its lanes again', () => {
  const groupHrefs = navConfig.groups.map((g) => g.href);

  it('puts Broken, Complaint and Track back in the row', () => {
    expect(groupHrefs).toEqual(
      expect.arrayContaining(['/instasolver', '/instasolver/broken', '/instasolver/complaint', '/instasolver/track'])
    );
  });

  it('keeps every desk screen out of the top row', () => {
    for (const h of DESK_SCREENS) expect(groupHrefs).not.toContain(h);
  });

  it('files every desk screen under Administration', () => {
    for (const h of DESK_SCREENS) {
      expect(findActiveGroup(h, navConfig)?.label).toBe('Administration');
    }
  });

  it('lights Report a problem on the chooser and the QR sticker page', () => {
    expect(findActiveGroup('/instasolver', navConfig)?.label).toBe('Report a problem');
    expect(findActiveGroup('/instasolver/r/res_0123456789abcdef', navConfig)?.label).toBe('Report a problem');
  });
});

describe('old desk links land on the chooser with a note', () => {
  it('sends the old Report an issue form to the chooser', () => {
    redirect.mockClear();
    NewIssuePage();
    expect(redirect).toHaveBeenCalledWith(REPORTING_MOVED_HREF);
  });

  it('sends the old Request an item form to the chooser', () => {
    redirect.mockClear();
    NewRequirementPage();
    expect(redirect).toHaveBeenCalledWith(REPORTING_MOVED_HREF);
  });

  it('shows the note only when the link carries moved=1', () => {
    expect(REPORTING_MOVED_HREF).toBe('/instasolver?moved=1');
    expect(cameFromOldDeskLink({ moved: '1' })).toBe(true);
    expect(cameFromOldDeskLink({ moved: ['1'] })).toBe(true);
    expect(cameFromOldDeskLink({ moved: '0' })).toBe(false);
    expect(cameFromOldDeskLink({})).toBe(false);
    expect(cameFromOldDeskLink(undefined)).toBe(false);
  });
});

// Review follow-up to #4237: hiding the desk screens from the menus is not
// enough, because the front door enforces each page's MENU_PERMISSIONS key.
describe('old desk screens: CAO only, even by direct link', () => {
  it('needs instasolver.triage for every desk list screen', () => {
    for (const h of ['/instasolver/dashboard', '/instasolver/issues', '/instasolver/requirements', '/instasolver/triage', '/instasolver/workload']) {
      expect(MENU_PERMISSIONS[h], h).toBe('instasolver.triage');
    }
    expect(MENU_PERMISSIONS['/instasolver/analytics']).toBe('instasolver.analytics');
  });

  it('still lets a reporter open one of their own desk issues or requests', () => {
    expect(MENU_PERMISSIONS['/instasolver/issues/[id]']).toBe('instasolver.view');
    expect(MENU_PERMISSIONS['/instasolver/requirements/[id]']).toBe('instasolver.view');
  });

  it('refuses someone holding only instasolver.view, and lets the CAO in', () => {
    const everyone = { 'instasolver.view': true };
    const cao = { 'instasolver.view': true, 'instasolver.triage': true };
    for (const h of ['/instasolver/dashboard', '/instasolver/issues', '/instasolver/requirements']) {
      expect(routeMatcher.hasAccess(h, 'staff', everyone), h).toBe(false);
      expect(routeMatcher.hasAccess(h, 'cao', cao), h).toBe(true);
    }
    expect(routeMatcher.hasAccess('/instasolver/issues/0b6f9c1e-2d3a-4b5c-8d7e-9f0a1b2c3d4e', 'staff', everyone)).toBe(true);
    expect(routeMatcher.hasAccess('/instasolver', 'staff', everyone)).toBe(true);
  });

  it('only links My complaints when that page is part of the build', () => {
    const inSidebar = instaSolverRow().submenus.some((s) => s.href === '/instasolver/my-complaints');
    const inTabs = navConfig.groups.some((g) => g.href === '/instasolver/my-complaints');
    expect(hasMyComplaintsPage()).toBe(inSidebar);
    expect(hasMyComplaintsPage()).toBe(inTabs);
  });
});
