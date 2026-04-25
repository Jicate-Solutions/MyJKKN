import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Startup Studio — 13 logical module tabs.
 *
 * Mirrors the original StartupStudioNav design (previously at
 * _components/startup-studio-nav.tsx) but as data. Solve-for-100 carries
 * nested children (formerly rendered by solve-for-100/layout.tsx's
 * SectionSubNav) so the 5 sub-tabs surface as tier-3.
 *
 * Event-specific 15-tab subnav is NOT in this config — it renders
 * dynamically per eventId via events/[id]/layout.tsx using useParams().
 * AutoTabNav cannot replicate dynamic-URL-parameterized tabs.
 *
 * Extended to cover 6 orphan pages (/analytics, /cycles, /cycles/new,
 * /nif, /problem-bank, /submissions) that existed at module root but
 * were unreachable from nav before this config was fleshed out.
 */
const config: ModuleNavConfig = {
  module: 'startup-studio',
  groups: [
    {
      label: 'Portfolio',
      icon: 'Gauge',
      href: '/startup-studio/portfolio',
      matchPaths: ['/startup-studio/portfolio'],
    },
    {
      label: 'Cycles',
      icon: 'RefreshCw',
      href: '/startup-studio/cycles',
      // Covers /cycles, /cycles/new, and /cycles/[id] via startsWith.
      matchPaths: ['/startup-studio/cycles'],
    },
    {
      label: 'Analytics',
      icon: 'BarChart3',
      href: '/startup-studio/analytics',
      matchPaths: ['/startup-studio/analytics'],
    },
    {
      label: 'Mentors',
      icon: 'Users',
      href: '/startup-studio/mentors',
      matchPaths: ['/startup-studio/mentors'],
    },
    {
      label: 'Alumni',
      icon: 'Award',
      href: '/startup-studio/alumni',
      matchPaths: ['/startup-studio/alumni'],
    },
    {
      label: 'KPI',
      icon: 'PieChart',
      href: '/startup-studio/kpi',
      matchPaths: ['/startup-studio/kpi'],
      children: [
        {
          label: 'Overview',
          icon: 'PieChart',
          href: '/startup-studio/kpi',
          exact: true,
        },
        {
          label: 'Reports',
          icon: 'FileBarChart',
          href: '/startup-studio/kpi/reports',
        },
      ],
    },
    {
      label: 'Marketing',
      icon: 'Megaphone',
      href: '/startup-studio/marketing',
      matchPaths: ['/startup-studio/marketing'],
    },
    {
      label: 'Finance',
      icon: 'Wallet',
      href: '/startup-studio/finance',
      matchPaths: ['/startup-studio/finance'],
    },
    {
      label: 'Governance',
      icon: 'Scale',
      href: '/startup-studio/governance',
      matchPaths: ['/startup-studio/governance'],
    },
    {
      label: 'Solve for 100',
      icon: 'Target',
      href: '/startup-studio/solve-for-100',
      matchPaths: ['/startup-studio/solve-for-100'],
      // Tier-3 sub-tabs (renders when Solve for 100 is active). Replaces
      // the SectionSubNav previously rendered by solve-for-100/layout.tsx.
      children: [
        {
          label: 'My Team',
          icon: 'Users',
          href: '/startup-studio/solve-for-100/dashboard',
          matchPaths: ['/startup-studio/solve-for-100/dashboard'],
        },
        {
          label: 'Check-In',
          icon: 'CheckCircle2',
          href: '/startup-studio/solve-for-100/dashboard/checkin',
        },
        {
          label: 'Exercises',
          icon: 'BookOpen',
          href: '/startup-studio/solve-for-100/exercises',
        },
        {
          label: 'Leaderboard',
          icon: 'Trophy',
          href: '/startup-studio/solve-for-100/leaderboard',
          matchPaths: ['/startup-studio/solve-for-100/leaderboard'],
        },
        {
          label: 'Admin',
          icon: 'Shield',
          href: '/startup-studio/solve-for-100/admin',
          matchPaths: ['/startup-studio/solve-for-100/admin'],
        },
        {
          label: 'My Mentees',
          icon: 'UserCheck',
          href: '/startup-studio/solve-for-100/mentor',
          matchPaths: ['/startup-studio/solve-for-100/mentor'],
        },
        {
          label: 'Programs',
          icon: 'BookOpen',
          href: '/startup-studio/solve-for-100/programs',
          matchPaths: ['/startup-studio/solve-for-100/programs'],
        },
      ],
    },
    {
      label: 'Problem Bank',
      icon: 'Lightbulb',
      href: '/startup-studio/problem-bank',
      // Groups the problems-to-solve catalog with the submissions pipeline
      // that flows from it. One tier-2 tab activates for both paths.
      matchPaths: [
        '/startup-studio/problem-bank',
        '/startup-studio/submissions',
      ],
      children: [
        {
          label: 'Catalog',
          icon: 'Lightbulb',
          href: '/startup-studio/problem-bank',
          exact: true,
        },
        {
          label: 'Submissions',
          icon: 'Inbox',
          href: '/startup-studio/submissions',
        },
      ],
    },
    {
      label: 'NIF',
      icon: 'Sprout',
      href: '/startup-studio/nif',
      // National Innovation Foundation tracking — distinct pipeline from
      // Solve-for-100 and Events; stands alone.
      matchPaths: ['/startup-studio/nif'],
    },
    {
      label: 'Events',
      icon: 'Rocket',
      href: '/startup-studio/events',
      matchPaths: ['/startup-studio/events'],
    },
  ],
};

export default config;
