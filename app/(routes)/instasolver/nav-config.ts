import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * InstaSolver — in-page chip row (AutoTabNav).
 *
 * Only the desk's screens (docs/instasolver/MYJKKN-MODULE-SPEC.md). The older
 * chooser lanes — /instasolver/broken, /complaint and /track — are hidden from
 * navigation (2026-10-01, owner's decision) but still work by direct link, so a
 * tracking code already handed to an anonymous complainant keeps working.
 *
 * Icons match the InstaSolver rows in the sidebar (lib/sidebarMenuLink.ts).
 * Per-chip visibility comes from MENU_PERMISSIONS: Triage / Workload /
 * Administration need instasolver.triage, My work instasolver.work, Analytics
 * instasolver.analytics.
 */
const config: ModuleNavConfig = {
  module: 'instasolver',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutPanelLeft',
      href: '/instasolver/dashboard',
      matchPaths: ['/instasolver/dashboard']
    },
    {
      label: 'Issues',
      icon: 'ListTodo',
      href: '/instasolver/issues',
      matchPaths: ['/instasolver/issues']
    },
    {
      label: 'Requirements',
      icon: 'PackageSearch',
      href: '/instasolver/requirements',
      matchPaths: ['/instasolver/requirements']
    },
    {
      label: 'Triage queue',
      icon: 'ListFilter',
      href: '/instasolver/triage',
      matchPaths: ['/instasolver/triage']
    },
    {
      label: 'My work',
      icon: 'Drill',
      href: '/instasolver/work',
      matchPaths: ['/instasolver/work']
    },
    {
      label: 'Workload',
      icon: 'Weight',
      href: '/instasolver/workload',
      matchPaths: ['/instasolver/workload']
    },
    {
      label: 'Analytics',
      icon: 'ChartPie',
      href: '/instasolver/analytics',
      matchPaths: ['/instasolver/analytics']
    },
    {
      label: 'Administration',
      icon: 'SlidersHorizontal',
      href: '/instasolver/admin',
      matchPaths: ['/instasolver/admin']
    }
  ]
};

export default config;
