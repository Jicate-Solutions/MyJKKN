import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Campus Living — collapses 23 flat children into 7 workflow buckets.
 *
 * Mirrors the original CLNav design (see _components/cl-nav.tsx) but as
 * data. AutoTabNav reads this to render 7 tier-2 chips instead of the
 * manifest's 23 raw child folders.
 */
const config: ModuleNavConfig = {
  module: 'campus-living',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/campus-living/dashboard',
      matchPaths: ['/campus-living/dashboard'],
    },
    {
      label: 'Residents',
      icon: 'UsersRound',
      href: '/campus-living/residents',
      matchPaths: [
        '/campus-living/residents',
        '/campus-living/blocks',
        '/campus-living/allocations',
      ],
    },
    {
      label: 'Attendance',
      icon: 'UserCheck',
      href: '/campus-living/attendance',
      matchPaths: [
        '/campus-living/attendance',
        '/campus-living/leave',
        '/campus-living/gate-passes',
        '/campus-living/visitors',
      ],
    },
    {
      label: 'Services',
      icon: 'UtensilsCrossed',
      href: '/campus-living/mess',
      matchPaths: [
        '/campus-living/mess',
        '/campus-living/laundry',
        '/campus-living/housekeeping',
      ],
    },
    {
      label: 'Facility',
      icon: 'Wrench',
      href: '/campus-living/maintenance',
      matchPaths: [
        '/campus-living/maintenance',
        '/campus-living/safety',
        '/campus-living/wellness',
        '/campus-living/health',
      ],
    },
    {
      label: 'Community',
      icon: 'Users',
      href: '/campus-living/community',
      matchPaths: [
        '/campus-living/community',
        '/campus-living/activity',
        '/campus-living/calendar',
      ],
    },
    {
      label: 'Insights',
      icon: 'BarChart3',
      href: '/campus-living/analytics',
      matchPaths: ['/campus-living/analytics', '/campus-living/reports'],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/campus-living/settings',
      matchPaths: ['/campus-living/settings'],
    },
  ],
};

export default config;
