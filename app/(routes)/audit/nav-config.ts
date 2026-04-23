import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Audit Workflow — 5 logical module tabs.
 *
 * Surfaces the 9 orphan /audit/* pages (previously unreachable from the
 * sidebar) as one flat AutoTabNav row with sub-groups where needed.
 *
 * Grouping notes:
 *   - Dashboard's matchPaths includes '/audit' so the bare module root
 *     (which redirect()s to /audit/dashboard) activates Dashboard too.
 *   - Cycles covers both the list page and the 4-step "new cycle" wizard
 *     plus the dynamic /audit/cycles/[id] detail view.
 *   - Findings collapses the cross-cycle list (/audit/findings), the
 *     per-owner rectification queue (/audit/my-findings), and the
 *     finding-types admin settings (/audit/finding-types/settings) into
 *     one group with tier-3 children. Findings detail routes to
 *     /service-requests/[id] (Sprint 01 decision #1), so there is no
 *     /audit/findings/[id] sibling to model here beyond the matchPaths.
 *   - Parameters covers the 36-parameter Aassaan catalog browser plus
 *     its admin settings + dynamic /audit/parameters/[code] detail.
 */
const config: ModuleNavConfig = {
  module: 'audit',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/audit/dashboard',
      matchPaths: ['/audit', '/audit/dashboard'],
    },
    {
      label: 'Cycles',
      icon: 'ClipboardCheck',
      href: '/audit/cycles',
      matchPaths: ['/audit/cycles'],
    },
    {
      label: 'Findings',
      icon: 'AlertTriangle',
      href: '/audit/findings',
      matchPaths: [
        '/audit/findings',
        '/audit/my-findings',
        '/audit/finding-types',
      ],
      children: [
        {
          label: 'All Findings',
          icon: 'AlertTriangle',
          href: '/audit/findings',
          matchPaths: ['/audit/findings'],
        },
        {
          label: 'My Findings',
          icon: 'UserCheck',
          href: '/audit/my-findings',
          matchPaths: ['/audit/my-findings'],
        },
        {
          label: 'Finding Types',
          icon: 'Settings',
          href: '/audit/finding-types/settings',
          matchPaths: ['/audit/finding-types'],
        },
      ],
    },
    {
      label: 'Parameters',
      icon: 'Gauge',
      href: '/audit/parameters',
      matchPaths: ['/audit/parameters'],
      children: [
        {
          label: 'Catalog',
          icon: 'Gauge',
          href: '/audit/parameters',
          exact: true,
        },
        {
          label: 'Settings',
          icon: 'Settings',
          href: '/audit/parameters/settings',
          matchPaths: ['/audit/parameters/settings'],
        },
      ],
    },
  ],
};

export default config;
