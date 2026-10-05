import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Procurement — in-page tab bar (AutoTabNav).
 *
 * Two tabs. One purchase = one page (/procurement/requests/[id]): the items and
 * their approval, the vendors' quotes and the Super Admin's final approval, the
 * orders and deliveries all sit on that page, so there is nothing to switch tabs for.
 *   Overview  — what is waiting at each step, per college
 *   Purchases — every purchase and the stage it is at
 *
 * The older routes (/rfqs, /purchase-orders, /grn) still work — links, bookmarks and
 * the permission map in lib/sidebarMenuLink.ts keep resolving — and count as the
 * Purchases tab. Per-tab visibility is gated by AutoTabNav.canShowChip() from
 * MENU_PERMISSIONS (lib/sidebarMenuLink.ts), not here.
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
      label: 'Purchases',
      icon: 'ShoppingCart',
      href: '/procurement/requests',
      matchPaths: ['/procurement/requests', '/procurement/rfqs', '/procurement/purchase-orders', '/procurement/grn'],
    },
  ],
};

export default config;
