import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * OKR & Performance — 10 logical module tabs.
 *
 * Mirrors the original OKRNav design (see _components/okr-nav.tsx) but as
 * data. AutoTabNav reads this to render the 10 tier-2 chips instead of a
 * hand-coded tab bar.
 *
 * Grouping notes:
 *   - Dashboard's matchPaths includes '/okr' so the bare module root
 *     activates Dashboard (Admission uses the same trick for '/admission').
 *   - My OKRs collapses /okr/objectives and /okr/check-in into one tab
 *     (check-ins are always entered against an objective).
 *   - Compliance lives at /okr/admin/compliance; matchPaths includes
 *     '/okr/admin' so any admin sub-route keeps Compliance active.
 */
const config: ModuleNavConfig = {
  module: 'okr',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/okr',
      matchPaths: ['/okr', '/okr/dashboard'],
    },
    {
      label: 'My OKRs',
      icon: 'Target',
      href: '/okr/objectives',
      matchPaths: ['/okr/objectives', '/okr/check-in'],
    },
    {
      label: 'Team',
      icon: 'Users',
      href: '/okr/team',
      matchPaths: ['/okr/team'],
    },
    {
      label: 'Department',
      icon: 'Building2',
      href: '/okr/department',
      matchPaths: ['/okr/department'],
    },
    {
      label: 'Organization',
      icon: 'Building',
      href: '/okr/organization',
      matchPaths: ['/okr/organization'],
    },
    {
      label: 'Cascade',
      icon: 'FolderTree',
      href: '/okr/cascade',
      matchPaths: ['/okr/cascade'],
    },
    {
      label: 'Analytics',
      icon: 'BarChart',
      href: '/okr/analytics',
      matchPaths: ['/okr/analytics'],
    },
    {
      label: 'Manage',
      icon: 'Settings',
      href: '/okr/manage',
      matchPaths: ['/okr/manage'],
    },
    {
      label: 'Compliance',
      icon: 'Shield',
      href: '/okr/admin/compliance',
      matchPaths: ['/okr/admin'],
    },
    {
      label: 'ABCD',
      icon: 'CircleDot',
      href: '/okr/abcd',
      matchPaths: ['/okr/abcd'],
    },
  ],
};

export default config;
