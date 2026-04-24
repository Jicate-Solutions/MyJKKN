import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * HR — tier-2 module nav with tier-3 chips for every hidden submenu.
 *
 * Before this config, HR rendered flat: 4 parent menus (/hr, /hr/employees,
 * /hr/policies, /hr/leave, /hr/recruitment) with 12 hidden submenus under
 * Leave + Recruitment that were only reachable via the sidebar. The chip
 * navigation had no way to GET to them.
 *
 * Every child entry here doubles as the reachability manifest for
 * scripts/check-nav-reachability.ts — each `href` (and `matchPaths`) must
 * correspond to a real static page under app/(routes)/hr/**.
 *
 * Grouping mirrors the sidebar's "HR (Sprints 1-3)" section in
 * lib/sidebarMenuLink.ts.
 */
const config: ModuleNavConfig = {
  module: 'hr',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/hr',
      matchPaths: ['/hr'],
    },
    {
      label: 'Employees',
      icon: 'Users',
      href: '/hr/employees',
      matchPaths: ['/hr/employees'],
      // Tier-3 chips: list view + create. Detail/edit pages are dynamic
      // ([id]) so they're reached by clicking a row on the list.
      children: [
        {
          label: 'All Employees',
          icon: 'Users',
          href: '/hr/employees',
          exact: true,
        },
        {
          label: 'Add Employee',
          icon: 'UserPlus',
          href: '/hr/employees/new',
          matchPaths: ['/hr/employees/new'],
        },
      ],
    },
    {
      label: 'Policies',
      icon: 'FileText',
      href: '/hr/policies',
      matchPaths: ['/hr/policies'],
    },
    {
      label: 'Leave',
      icon: 'Calendar',
      href: '/hr/leave',
      matchPaths: ['/hr/leave'],
      // Tier-3 chips: 6 submenus that were hidden without this config.
      // Ordering matches sidebar's "HR (Sprints 1-3)" block.
      children: [
        {
          label: 'Overview',
          icon: 'Calendar',
          href: '/hr/leave',
          exact: true,
        },
        {
          label: 'Apply',
          icon: 'FilePlus',
          href: '/hr/leave/apply',
          matchPaths: ['/hr/leave/apply'],
        },
        {
          label: 'My Applications',
          icon: 'ClipboardList',
          href: '/hr/leave/my-applications',
          matchPaths: ['/hr/leave/my-applications'],
        },
        {
          label: 'Approve Inbox',
          icon: 'CheckCircle2',
          href: '/hr/leave/approve',
          matchPaths: ['/hr/leave/approve'],
        },
        {
          label: 'Calendar',
          icon: 'CalendarDays',
          href: '/hr/leave/calendar',
          matchPaths: ['/hr/leave/calendar'],
        },
        {
          label: 'Balance',
          icon: 'Gauge',
          href: '/hr/leave/balance',
          matchPaths: ['/hr/leave/balance'],
        },
        {
          label: 'Encashment',
          icon: 'Wallet',
          href: '/hr/leave/encashment',
          matchPaths: ['/hr/leave/encashment'],
        },
      ],
    },
    {
      label: 'Recruitment',
      icon: 'UserPlus',
      href: '/hr/recruitment',
      matchPaths: ['/hr/recruitment'],
      // Tier-3 chips: 3 submenus previously hidden.
      children: [
        {
          label: 'Overview',
          icon: 'UserPlus',
          href: '/hr/recruitment',
          exact: true,
        },
        {
          label: 'Submit Candidate',
          icon: 'FilePlus',
          href: '/hr/recruitment/submit',
          matchPaths: ['/hr/recruitment/submit'],
        },
        {
          label: 'My Candidates',
          icon: 'ClipboardList',
          href: '/hr/recruitment/my',
          matchPaths: ['/hr/recruitment/my'],
        },
        {
          label: 'Approvals',
          icon: 'CheckCircle2',
          href: '/hr/recruitment/approvals',
          matchPaths: ['/hr/recruitment/approvals'],
        },
      ],
    },
  ],
};

export default config;
