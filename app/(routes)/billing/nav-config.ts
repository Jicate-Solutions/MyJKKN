import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Billing — 3 domain buckets + tier-3 chips per bucket.
 *
 * Mirrors the sidebar split of 2026-08-25 (lib/sidebarMenuLink.ts, group
 * 'Billing & Accounts'). Before this config AutoTabNav rendered billing's
 * ~20 top-level children flat in a single row, well past the 12-chip
 * threshold warnOnCrowdedTier() warns about.
 *
 * MATCHING: findActiveGroup() is longest-match-wins, so 'Colleges' can hold
 * the bare '/billing' catch-all while the two longer prefixes below still
 * claim their own pages. That is what keeps the three mutually exclusive —
 * the same job the three `active` predicates do in the sidebar, expressed
 * as data. It also means a NEW billing route lands under Colleges by
 * default, which is the right home for anything that isn't school or
 * transport.
 *
 * The six chips after Late Charges are group-wide rather than college-only
 * and deliberately have no second row under Schools: one href in two groups
 * would activate both. Categories IS the school fee-head master
 * (school-fee-head-service reads billing_categories), and the school counter
 * writes billing_receipt_items, so Receipts lists school payments too.
 */
const config: ModuleNavConfig = {
  module: 'billing',
  groups: [
    {
      label: 'Colleges',
      icon: 'GraduationCap',
      href: '/billing/schedule',
      matchPaths: ['/billing'],
      children: [
        // exact + an explicit list, not a startsWith: '/billing/schedule' is a
        // prefix of the Student Search chip below, so plain prefix matching
        // would light both at once. The listed paths are every static page
        // under /billing/schedule that has no chip of its own.
        {
          label: 'Schedule · All Bills',
          icon: 'CalendarDays',
          href: '/billing/schedule',
          matchPaths: [
            '/billing/schedule/new',
            '/billing/schedule/bulk-create',
            '/billing/schedule/bulk-create/upload',
            '/billing/schedule/bulk-edit',
          ],
          exact: true,
        },
        { label: 'Schedule · Student Search', icon: 'UserSearch', href: '/billing/schedule/students' },
        { label: 'Bill Coverage', icon: 'ShieldCheck', href: '/billing/coverage' },
        { label: 'Learner Onboarding', icon: 'UserPlus', href: '/billing/onboarding' },
        { label: 'Scholarships', icon: 'Award', href: '/billing/discounts' },
        { label: 'Refunds', icon: 'Undo2', href: '/billing/refunds' },
        { label: 'Refund Approvals', icon: 'CheckCheck', href: '/billing/refund-approvals' },
        { label: 'Receipt Cancellations', icon: 'FileX', href: '/billing/receipt-cancellations' },
        { label: 'Apportionment', icon: 'Split', href: '/billing/apportionment' },
        { label: 'Invoices', icon: 'FileText', href: '/billing/invoices' },
        { label: 'Late Charges', icon: 'AlarmClock', href: '/billing/late-charges' },
        // ── Group-wide (colleges + schools) ──────────────────────────────
        { label: 'Categories', icon: 'Tags', href: '/billing/categories' },
        { label: 'Receipts', icon: 'Receipt', href: '/billing/receipts', exact: true },
        // Gets its own chip because NOTHING links to it — unlike the /new pages
        // (button-invoked from their list page and NAV_EXCLUDE'd), this one had
        // no entry point other than the flat chip this config replaced.
        { label: 'Receipt Templates', icon: 'FileText', href: '/billing/receipts/templates' },
        { label: 'Reports', icon: 'FileBarChart', href: '/billing/reports' },
        { label: 'Analytics', icon: 'BarChart3', href: '/billing/analytics' },
        { label: 'Activities', icon: 'Activity', href: '/billing/activities' },
        { label: 'Payment Gateway Accounts', icon: 'CreditCard', href: '/billing/payment-accounts' },
      ],
    },
    {
      // Single page — no children[], so tier-3 stays empty and the group chip
      // is the whole navigation, matching the sidebar's direct link.
      label: 'Transport Fees',
      icon: 'Bus',
      href: '/billing/transport',
      matchPaths: ['/billing/transport'],
    },
    {
      label: 'Schools',
      icon: 'School',
      href: '/billing/school-fees',
      matchPaths: ['/billing/school-fees'],
      children: [
        // 'School Fee Plans' owns /billing/school-fees and its plan sub-routes
        // (/new, /[id]) but NOT the four siblings below, which have their own
        // chips — hence exact, otherwise two chips highlight at once.
        {
          label: 'School Fee Plans',
          icon: 'ClipboardList',
          href: '/billing/school-fees',
          matchPaths: ['/billing/school-fees/new'],
          exact: true,
        },
        { label: 'School Term Calendar', icon: 'CalendarRange', href: '/billing/school-fees/term-calendar' },
        { label: 'School Fee Concessions', icon: 'BadgePercent', href: '/billing/school-fees/concessions' },
        { label: 'Generate School Fees', icon: 'Wand2', href: '/billing/school-fees/generate' },
        // Sits after Generate because that is the order of the work: raise the
        // year's bills, then take money against them.
        { label: 'School Bill Payment', icon: 'HandCoins', href: '/billing/school-fees/collect' },
      ],
    },
  ],
};

export default config;
