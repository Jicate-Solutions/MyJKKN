import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Learners Council — 9 tabs, mirroring the original LCNav.
 * Activities bucket groups Communication + Events + OD under one tab.
 */
const config: ModuleNavConfig = {
  module: 'learners-council',
  groups: [
    {
      label: 'Dashboard',
      icon: 'Crown',
      href: '/learners-council',
      matchPaths: ['/learners-council'],
    },
    {
      label: 'Structure',
      icon: 'Network',
      href: '/learners-council/structure',
      matchPaths: ['/learners-council/structure'],
    },
    {
      label: 'YUVA Chapters',
      icon: 'Building2',
      href: '/learners-council/yuva',
      matchPaths: ['/learners-council/yuva'],
    },
    {
      label: 'Activities',
      icon: 'CalendarDays',
      href: '/learners-council/communication',
      matchPaths: [
        '/learners-council/communication',
        '/learners-council/events',
        '/learners-council/od',
      ],
    },
    {
      label: 'Selection',
      icon: 'Vote',
      href: '/learners-council/selection',
      matchPaths: ['/learners-council/selection'],
    },
    {
      label: 'Issues',
      icon: 'Kanban',
      href: '/learners-council/issues',
      matchPaths: ['/learners-council/issues'],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/learners-council/settings',
      matchPaths: ['/learners-council/settings'],
    },
  ],
};

export default config;
