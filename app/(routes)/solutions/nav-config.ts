import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Solutions Hub — 10 logical module tabs.
 *
 * Mirrors the original SolutionsNav design (see _components/solutions-nav.tsx)
 * but as data. Four sections (Pipeline, Training, Content, Software) have
 * their sub-tabs folded in as explicit tier-3 `children` so we can delete
 * their now-redundant per-section layout.tsx files that rendered
 * SectionSubNav.
 *
 * Groups that span multiple URL prefixes use `matchPaths` to stay active
 * across peer routes (e.g. Payments covers /payments + /earnings; Discovery
 * covers /discovery + /publications; Products covers /products + /matlab +
 * /software; More covers /paradigm-shift + /ai-solution-compliance).
 */
const config: ModuleNavConfig = {
  module: 'solutions',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutGrid',
      href: '/solutions',
      matchPaths: ['/solutions', '/solutions/list'],
      children: [
        {
          label: 'Overview',
          icon: 'LayoutGrid',
          href: '/solutions',
          exact: true,
        },
        {
          label: 'All Solutions',
          icon: 'List',
          href: '/solutions/list',
        },
      ],
    },
    {
      label: 'Pipeline',
      icon: 'Workflow',
      href: '/solutions/pipeline',
      matchPaths: ['/solutions/pipeline'],
      children: [
        {
          label: 'Board View',
          icon: 'LayoutGrid',
          href: '/solutions/pipeline',
          exact: true,
        },
        {
          label: 'List View',
          icon: 'List',
          href: '/solutions/pipeline/list',
        },
        {
          label: 'Analytics',
          icon: 'LineChart',
          href: '/solutions/pipeline/analytics',
        },
      ],
    },
    {
      label: 'Clients',
      icon: 'Users',
      href: '/solutions/clients',
      matchPaths: ['/solutions/clients'],
    },
    {
      label: 'Builders',
      icon: 'Hammer',
      href: '/solutions/builders',
      matchPaths: ['/solutions/builders'],
    },
    {
      label: 'Training',
      icon: 'GraduationCap',
      href: '/solutions/training',
      matchPaths: ['/solutions/training'],
      children: [
        {
          label: 'Overview',
          icon: 'LayoutGrid',
          href: '/solutions/training',
          exact: true,
        },
        {
          label: 'Programs',
          icon: 'BookOpen',
          href: '/solutions/training/programs',
        },
        {
          label: 'Sessions',
          icon: 'CalendarClock',
          href: '/solutions/training/sessions',
        },
        {
          label: 'Cohort',
          icon: 'Users',
          href: '/solutions/training/cohort',
        },
      ],
    },
    {
      label: 'Content',
      icon: 'FileText',
      href: '/solutions/content',
      matchPaths: ['/solutions/content'],
      children: [
        {
          label: 'Overview',
          icon: 'FileText',
          href: '/solutions/content',
          exact: true,
        },
        {
          label: 'Orders',
          icon: 'ClipboardList',
          href: '/solutions/content/orders',
        },
        {
          label: 'Deliverables',
          icon: 'Package',
          href: '/solutions/content/deliverables',
        },
        {
          label: 'Production',
          icon: 'Factory',
          href: '/solutions/content/production',
        },
        {
          label: 'Queue',
          icon: 'ListTodo',
          href: '/solutions/content/queue',
        },
      ],
    },
    {
      label: 'Payments',
      icon: 'Wallet',
      href: '/solutions/payments',
      matchPaths: ['/solutions/payments', '/solutions/earnings'],
      children: [
        {
          label: 'Payments',
          icon: 'Wallet',
          href: '/solutions/payments',
        },
        {
          label: 'Earnings',
          icon: 'TrendingUp',
          href: '/solutions/earnings',
        },
      ],
    },
    {
      label: 'Discovery',
      icon: 'Compass',
      href: '/solutions/discovery',
      matchPaths: ['/solutions/discovery', '/solutions/publications'],
      children: [
        {
          label: 'Visits',
          icon: 'Compass',
          href: '/solutions/discovery',
        },
        {
          label: 'Publications',
          icon: 'Newspaper',
          href: '/solutions/publications',
        },
      ],
    },
    {
      label: 'Products',
      icon: 'Package',
      href: '/solutions/products',
      matchPaths: [
        '/solutions/products',
        '/solutions/matlab',
        '/solutions/software',
      ],
      children: [
        {
          label: 'Products',
          icon: 'Package',
          href: '/solutions/products',
        },
        {
          label: 'RDIF',
          icon: 'Microscope',
          href: '/solutions/products/rdif',
        },
        {
          label: 'MATLAB',
          icon: 'Cpu',
          href: '/solutions/matlab',
        },
        {
          label: 'Software',
          icon: 'LayoutGrid',
          href: '/solutions/software',
          exact: true,
        },
        {
          label: 'Software Builders',
          icon: 'Hammer',
          href: '/solutions/software/builders',
        },
        {
          label: 'Phases',
          icon: 'GitBranch',
          href: '/solutions/software/phases',
        },
      ],
    },
    {
      label: 'More',
      icon: 'Lightbulb',
      href: '/solutions/paradigm-shift',
      matchPaths: [
        '/solutions/paradigm-shift',
        '/solutions/ai-solution-compliance',
      ],
      children: [
        {
          label: 'Paradigm Shift',
          icon: 'Lightbulb',
          href: '/solutions/paradigm-shift',
        },
        {
          label: 'Paradigm Leaderboard',
          icon: 'Trophy',
          href: '/solutions/paradigm-shift/leaderboard',
        },
        {
          label: 'AI Compliance',
          icon: 'ShieldCheck',
          href: '/solutions/ai-solution-compliance',
        },
      ],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/solutions/settings',
      matchPaths: ['/solutions/settings'],
      children: [
        {
          label: 'Overview',
          icon: 'Settings',
          href: '/solutions/settings',
          exact: true,
        },
        {
          label: 'Types',
          icon: 'Tag',
          href: '/solutions/settings/types',
        },
      ],
    },
  ],
};

export default config;
