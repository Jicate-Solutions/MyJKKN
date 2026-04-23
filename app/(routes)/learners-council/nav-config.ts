import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Learners Council — 9 tabs, mirroring the original LCNav.
 * Activities bucket groups Communication + Events + OD under one tab.
 *
 * Tier-3 `children` mirror the SectionSubNav tabs rendered by each sub-section
 * layout (communication/layout.tsx, events/layout.tsx, od/layout.tsx,
 * selection/layout.tsx, structure/layout.tsx, yuva/layout.tsx). Adding them
 * here makes the sub-pages discoverable via the nav-coverage gate without
 * changing UX — SectionSubNav still renders the visible chip row.
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
      children: [
        {
          label: 'Overview',
          icon: 'Network',
          href: '/learners-council/structure',
          exact: true,
        },
        {
          label: 'Members',
          icon: 'Users',
          href: '/learners-council/structure/members',
        },
        {
          label: 'Positions',
          icon: 'Briefcase',
          href: '/learners-council/structure/positions',
        },
        {
          label: 'Portfolio Committees',
          icon: 'Layers',
          href: '/learners-council/structure/committees',
        },
        {
          label: 'Terms',
          icon: 'Calendar',
          href: '/learners-council/structure/terms',
        },
        {
          label: 'Verticals',
          icon: 'Grid3x3',
          href: '/learners-council/structure/verticals',
        },
      ],
    },
    {
      label: 'YUVA Chapters',
      icon: 'Building2',
      href: '/learners-council/yuva',
      matchPaths: ['/learners-council/yuva'],
      children: [
        {
          label: 'Chapters',
          icon: 'Building2',
          href: '/learners-council/yuva',
          exact: true,
        },
        {
          label: 'Members',
          icon: 'Users',
          href: '/learners-council/yuva/members',
        },
      ],
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
      children: [
        {
          label: 'Announcements',
          icon: 'Megaphone',
          href: '/learners-council/communication',
          exact: true,
        },
        {
          label: 'Polls',
          icon: 'BarChart3',
          href: '/learners-council/communication/polls',
        },
        {
          label: 'Forums',
          icon: 'MessagesSquare',
          href: '/learners-council/communication/forums',
        },
        {
          label: 'Chat',
          icon: 'MessageCircle',
          href: '/learners-council/communication/chat',
        },
        {
          label: 'Events',
          icon: 'CalendarCheck',
          href: '/learners-council/events',
        },
        {
          label: 'Events Calendar',
          icon: 'CalendarDays',
          href: '/learners-council/events/calendar',
        },
        {
          label: 'Event Proposals',
          icon: 'FileText',
          href: '/learners-council/events/proposals',
        },
        {
          label: 'OD Requests',
          icon: 'ClipboardSignature',
          href: '/learners-council/od',
        },
        {
          label: 'OD Approvals',
          icon: 'CheckSquare',
          href: '/learners-council/od/approvals',
        },
        {
          label: 'OD Chains',
          icon: 'Workflow',
          href: '/learners-council/od/chains',
        },
      ],
    },
    {
      label: 'Selection',
      icon: 'Vote',
      href: '/learners-council/selection',
      matchPaths: ['/learners-council/selection'],
      children: [
        {
          label: 'Overview',
          icon: 'Vote',
          href: '/learners-council/selection',
          exact: true,
        },
        {
          label: 'Nominations',
          icon: 'UserPlus',
          href: '/learners-council/selection/nominations',
        },
        {
          label: 'Interviews',
          icon: 'MessageSquare',
          href: '/learners-council/selection/interviews',
        },
        {
          label: 'Elections',
          icon: 'Users',
          href: '/learners-council/selection/elections',
        },
      ],
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
