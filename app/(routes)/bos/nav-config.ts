import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Board of Studies (BoS) — 5 logical tabs.
 *
 * Mirrors the BOS_NAV_TABS in layout.tsx but as data for the reachability
 * checker. Each tab is a clickable chip in AutoTabNav.
 */
const config: ModuleNavConfig = {
  module: 'bos',
  groups: [
    {
      label: 'External Experts',
      icon: 'Users',
      href: '/bos/experts',
      matchPaths: ['/bos/experts'],
    },
    {
      label: 'Compositions',
      icon: 'ClipboardList',
      href: '/bos/compositions',
      matchPaths: ['/bos/compositions'],
    },
    {
      label: 'Meetings',
      icon: 'CalendarDays',
      href: '/bos/meetings',
      matchPaths: ['/bos/meetings'],
    },
    {
      label: 'TA/DA Claims',
      icon: 'Receipt',
      href: '/bos/ta-da',
      matchPaths: ['/bos/ta-da'],
    },
    {
      label: 'Reports',
      icon: 'BarChart3',
      href: '/bos/reports',
      matchPaths: ['/bos/reports'],
    },
  ],
};

export default config;
