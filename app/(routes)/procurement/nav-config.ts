import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Procurement — in-page tab bar (AutoTabNav).
 *
 * WHY THIS CONFIG EXISTS: without one, AutoTabNav renders the module's children
 * flat from the route manifest, which orders them by folder name. For procurement
 * that produced "Grn · Purchase Orders · Requests · Rfqs" — alphabetical, which puts
 * the LAST step of the chain first and the FIRST step third, and mis-cases two
 * acronyms into "Grn" and "Rfqs".
 *
 * Procurement is a strict sequence: a request precedes an RFQ, which precedes a
 * purchase order, which precedes a goods receipt. The tab order below is that
 * sequence, so the nav teaches the workflow instead of contradicting it.
 *
 * Per-tab visibility is NOT declared here — AutoTabNav.canShowChip() gates each tab
 * by its MENU_PERMISSIONS entry (lib/sidebarMenuLink.ts), so a user without a given
 * procurement permission simply does not see that chip.
 *
 * Active-state: 'Overview' matches the bare '/procurement'; every other tab has a
 * more specific path, so the most-specific match wins on deeper routes (the same
 * Dashboard-vs-siblings pattern the calendar and audit modules use). Each stage
 * path also covers its own children — '/procurement/rfqs' stays active on
 * '/procurement/rfqs/[id]/quotations', and '/procurement/purchase-orders' stays
 * active on the PO format editors.
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
      label: 'RFQs',
      icon: 'FileSearch',
      href: '/procurement/rfqs',
      matchPaths: ['/procurement/rfqs'],
    },
    {
      label: 'Purchase Orders',
      icon: 'ScrollText',
      href: '/procurement/purchase-orders',
      matchPaths: ['/procurement/purchase-orders'],
    },
    {
      label: 'Goods Receipt',
      icon: 'PackageCheck',
      href: '/procurement/grn',
      matchPaths: ['/procurement/grn'],
    },
  ],
};

export default config;
