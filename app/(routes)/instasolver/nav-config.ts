import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * InstaSolver — in-page chip row (AutoTabNav).
 *
 * ONE report path (Director, 5–6 Oct 2026): the two InstaSolvers merge into
 * one. The row is the chooser and its lanes again: report a problem (broken /
 * complaint / buy), track a report, and your own reports and complaints.
 *
 * The desk ported in #4191 is not a second way in. Its dashboard, issues,
 * requirements, triage, work, workload and analytics screens are hidden from
 * everyone but the CAO: they are tier-3 chips under Administration, whose chip
 * (and every child but Dashboard / Issues / Requirements) needs
 * instasolver.triage via MENU_PERMISSIONS. They stay reachable so the
 * reachability gate passes and the CAO can still read what is in them.
 *
 * Icons match the InstaSolver rows in the sidebar (lib/sidebarMenuLink.ts).
 */
const config: ModuleNavConfig = {
  module: 'instasolver',
  groups: [
    {
      label: 'Report a problem',
      icon: 'Siren',
      href: '/instasolver',
      // The QR sticker page is a way of reporting, so it lights this chip.
      matchPaths: ['/instasolver', '/instasolver/r']
    },
    {
      label: 'Something broken',
      icon: 'Wrench',
      href: '/instasolver/broken',
      matchPaths: ['/instasolver/broken']
    },
    {
      label: 'Complaint',
      icon: 'MessageSquareWarning',
      href: '/instasolver/complaint',
      matchPaths: ['/instasolver/complaint']
    },
    {
      label: 'Track a report',
      icon: 'Search',
      href: '/instasolver/track',
      matchPaths: ['/instasolver/track']
    },
    {
      label: 'My reports',
      icon: 'ListTodo',
      href: '/instasolver/my-reports',
      matchPaths: ['/instasolver/my-reports']
    },
    {
      label: 'My complaints',
      icon: 'PackageSearch',
      href: '/instasolver/my-complaints',
      matchPaths: ['/instasolver/my-complaints']
    },
    {
      label: 'Administration',
      icon: 'SlidersHorizontal',
      href: '/instasolver/admin',
      matchPaths: [
        '/instasolver/admin',
        '/instasolver/dashboard',
        '/instasolver/issues',
        '/instasolver/requirements',
        '/instasolver/triage',
        '/instasolver/work',
        '/instasolver/workload',
        '/instasolver/analytics'
      ],
      children: [
        { label: 'Settings', icon: 'SlidersHorizontal', href: '/instasolver/admin', exact: true },
        { label: 'Maintenance teams', icon: 'HardHat', href: '/instasolver/admin/teams' },
        { label: 'Categories', icon: 'Tags', href: '/instasolver/admin/categories' },
        { label: 'Old desk: dashboard', icon: 'LayoutPanelLeft', href: '/instasolver/dashboard' },
        { label: 'Old desk: issues', icon: 'ListChecks', href: '/instasolver/issues' },
        { label: 'Old desk: requests', icon: 'ShoppingBasket', href: '/instasolver/requirements' },
        { label: 'Triage queue', icon: 'ListFilter', href: '/instasolver/triage' },
        { label: 'Team work', icon: 'Drill', href: '/instasolver/work' },
        { label: 'Workload', icon: 'Weight', href: '/instasolver/workload' },
        { label: 'Analytics', icon: 'ChartPie', href: '/instasolver/analytics' }
      ]
    }
  ]
};

export default config;
