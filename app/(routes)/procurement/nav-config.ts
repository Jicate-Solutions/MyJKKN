import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Procurement — in-page tab bar (AutoTabNav).
 *
 * One purchase = one page (/procurement/requests/[id]); the tabs are just the ways in:
 *   Overview   — what is waiting at each step, per college
 *   Requests   — every request and the stage it is at; people who only raise
 *                requests open on their own, to follow what happened to each
 *   Quotations — requests at the quoting / comparing / final-approval stage
 * Orders and deliveries open from the purchase page, so /purchase-orders and /grn
 * count as the Quotations tab. Per-tab visibility is gated by AutoTabNav.canShowChip()
 * from MENU_PERMISSIONS (lib/sidebarMenuLink.ts), not here.
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
      label: 'Quotations',
      icon: 'FileSearch',
      href: '/procurement/rfqs',
      matchPaths: ['/procurement/rfqs', '/procurement/purchase-orders', '/procurement/grn'],
    },
    {
      label: 'Approval flows',
      icon: 'GitBranch',
      href: '/procurement/approval-flows',
      matchPaths: ['/procurement/approval-flows'],
    },
  ],
};

export default config;
