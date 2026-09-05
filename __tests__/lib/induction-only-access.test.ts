/**
 * Pre-onboarding (induction-only) learner access surface.
 *
 * Reserved/admitted learners are scoped to a tiny allowlist of authenticated
 * paths (spec: specs/pre-onboarding-induction-access-2026-06-29.md). That
 * allowlist is enforced in TWO places that must agree:
 *
 *   1. proxy.ts            — the real gate; anything else redirects to /learners/my-induction
 *   2. sidebarMenuLink.ts  — nav presentation; hides links that would only redirect
 *
 * They used to be hand-mirrored across two files. The drift guard below is the
 * point of this file: a nav href that the proxy would bounce is a dead link, and
 * a proxy-allowed page with no nav href is unreachable.
 */
import { describe, it, expect } from 'vitest';
import {
  INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES,
  INDUCTION_ONLY_NAV_HREFS,
  INDUCTION_ONLY_NAV_REWRITES,
  isInductionOnlyAllowedPath,
} from '@/lib/constants/induction-access';
import { filterToInductionOnlyMenu } from '@/lib/sidebarMenuLink';

describe('induction-only lifecycle statuses', () => {
  it('covers the reserved and admitted onboarding cohort', () => {
    expect(INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES).toContain('reserved');
    expect(INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES).toContain('admitted');
  });
});

describe('isInductionOnlyAllowedPath', () => {
  it('keeps the induction + profile surface reachable', () => {
    expect(isInductionOnlyAllowedPath('/learners/my-induction')).toBe(true);
    expect(isInductionOnlyAllowedPath('/learners/my-induction/123')).toBe(true);
    expect(isInductionOnlyAllowedPath('/learners/my-profile')).toBe(true);
  });

  it('lets reserved/admitted learners reach the Service Requests module', () => {
    expect(isInductionOnlyAllowedPath('/service-requests')).toBe(true);
    expect(isInductionOnlyAllowedPath('/service-requests/my-requests')).toBe(true);
    expect(isInductionOnlyAllowedPath('/service-requests/new')).toBe(true);
    // Request detail — a learner must be able to open the request they raised.
    expect(isInductionOnlyAllowedPath('/service-requests/abc-123')).toBe(true);
  });

  it('lets reserved/admitted learners reach the AI Pulse module', () => {
    expect(isInductionOnlyAllowedPath('/ai-pulse')).toBe(true);
    expect(isInductionOnlyAllowedPath('/ai-pulse/my-pulse')).toBe(true);
    expect(isInductionOnlyAllowedPath('/ai-pulse/leaderboard')).toBe(true);
    expect(isInductionOnlyAllowedPath('/ai-pulse/guide')).toBe(true);
  });

  it('still locks down everything outside the allowlist', () => {
    expect(isInductionOnlyAllowedPath('/learners/profiles')).toBe(false);
    expect(isInductionOnlyAllowedPath('/learners/onboarding')).toBe(false);
    expect(isInductionOnlyAllowedPath('/billing')).toBe(false);
    expect(isInductionOnlyAllowedPath('/dashboard')).toBe(false);
  });

  it('does not allow a path that merely shares the prefix string', () => {
    // '/service-requests-admin' must NOT match the '/service-requests' prefix.
    expect(isInductionOnlyAllowedPath('/service-requests-admin')).toBe(false);
    expect(isInductionOnlyAllowedPath('/ai-pulse-admin')).toBe(false);
    expect(isInductionOnlyAllowedPath('/learners/my-profile-export')).toBe(false);
  });
});

describe('nav / proxy drift guard', () => {
  it('every induction-only nav href is a path the proxy actually allows', () => {
    for (const href of INDUCTION_ONLY_NAV_HREFS) {
      expect(
        isInductionOnlyAllowedPath(href),
        `${href} is in the induction-only sidebar but the proxy would redirect it`
      ).toBe(true);
    }
  });

  it('surfaces Service Requests in the induction-only sidebar', () => {
    expect(INDUCTION_ONLY_NAV_HREFS.has('/service-requests')).toBe(true);
  });

  it('surfaces AI Pulse in the induction-only sidebar', () => {
    // Top-level accordion href, NOT '/ai-pulse/my-pulse' — the filter matches
    // menu.href, so a submenu href here would keep nothing.
    expect(INDUCTION_ONLY_NAV_HREFS.has('/ai-pulse')).toBe(true);
  });

  it('every rewrite target is itself proxy-allowed', () => {
    for (const [from, to] of Object.entries(INDUCTION_ONLY_NAV_REWRITES)) {
      expect(INDUCTION_ONLY_NAV_HREFS.has(from)).toBe(true);
      expect(
        isInductionOnlyAllowedPath(to.href),
        `${from} rewrites to ${to.href}, which the proxy would redirect`
      ).toBe(true);
    }
  });
});

describe('filterToInductionOnlyMenu', () => {
  // GetPages() builds Service Requests as an ACCORDION: top-level href
  // '/service-requests' with My Requests / Approvals / Analytics as submenus.
  // Matching the submenu href would keep nothing at all — this is the shape the
  // real sidebar produces.
  const icon = (() => null) as never;
  const groups = [
    {
      groupLabel: 'Services',
      menus: [
        {
          href: '/service-requests',
          label: 'Service Requests',
          icon,
          active: false,
          submenus: [
            { href: '/service-requests/my-requests', label: 'My Requests', active: false },
            { href: '/service-requests/approvals', label: 'Pending Approvals', active: false },
            { href: '/service-requests/analytics', label: 'Analytics', active: false },
          ],
        },
        {
          href: '/ai-pulse',
          label: 'AI Pulse',
          icon,
          active: false,
          submenus: [
            { href: '/ai-pulse', label: 'Home', active: false },
            { href: '/ai-pulse/my-pulse', label: 'My AI Pulse', active: false },
            { href: '/ai-pulse/admin/cycles', label: 'Champion · Cycles', active: false },
          ],
        },
        { href: '/billing', label: 'Billing', icon, active: false, submenus: [] },
      ],
    },
  ];

  it('keeps Service Requests and lands the learner on My Requests', () => {
    const result = filterToInductionOnlyMenu(groups);
    const menus = result.flatMap((g) => g.menus);
    const sr = menus.find((m) => m.label === 'Service Requests');

    expect(sr).toBeDefined();
    expect(sr!.href).toBe('/service-requests/my-requests');
    // Approvals/Analytics are staff surfaces — they must not survive.
    expect(sr!.submenus).toEqual([]);
    expect(sr!.noSubmenus).toBe(true);
  });

  it('keeps AI Pulse on its hub, which self-gates its own onward links', () => {
    const menus = filterToInductionOnlyMenu(groups).flatMap((g) => g.menus);
    const ap = menus.find((m) => m.label === 'AI Pulse');

    expect(ap).toBeDefined();
    // No rewrite: /ai-pulse is a universal authenticated landing that hides the
    // My Pulse / Champion Console buttons behind its own permission checks.
    expect(ap!.href).toBe('/ai-pulse');
    // The Champion · Cycles submenu must not survive into a learner's sidebar.
    expect(ap!.submenus).toEqual([]);
  });

  it('still drops menus outside the allowlist', () => {
    const menus = filterToInductionOnlyMenu(groups).flatMap((g) => g.menus);
    expect(menus.some((m) => m.href === '/billing')).toBe(false);
  });
});
