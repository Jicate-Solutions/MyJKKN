import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Procurement — in-page tab bar (AutoTabNav).
 *
 * Three working tabs, in the order the work happens
 * (docs/procurement/simplified-flow-spec.md):
 *   Requests — what someone needs
 *   Purchase — vendor quotations, AI comparison, Super Admin approval
 *   Receive  — approved orders waiting for delivery, then goods receipts
 *
 * The URLs are unchanged (/rfqs, /purchase-orders, /grn) so bookmarks, the
 * permission map in lib/sidebarMenuLink.ts and deep links keep working; only the
 * grouping a user sees changed. Receive covers two routes, so it lists both in
 * matchPaths and the pages share a ReceiveSwitcher.
 *
 * Per-tab visibility is NOT declared here — AutoTabNav.canShowChip() gates each tab
 * by its MENU_PERMISSIONS entry (lib/sidebarMenuLink.ts).
 */
const config: ModuleNavConfig = {
  module: 'procurement',
  groups: [
    {
      label: 'Overview',
      icon: 'Workflow',
      href: '/procurement',
      matchPaths: ['/procurement'],
    },
    {
      label: 'Requests',
      icon: 'FileText',
      href: '/procurement/requests',
      matchPaths: ['/procurement/requests'],
    },
    {
      label: 'Purchase',
      icon: 'FileSearch',
      href: '/procurement/rfqs',
      matchPaths: ['/procurement/rfqs'],
    },
    {
      label: 'Receive',
      icon: 'PackageCheck',
      href: '/procurement/purchase-orders',
      matchPaths: ['/procurement/purchase-orders', '/procurement/grn'],
    },
  ],
};

export default config;
