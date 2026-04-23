import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Admission CRM — 9 logical module tabs.
 *
 * Mirrors the original AdmissionNav design (see _components/admission-nav.tsx)
 * but as data. Groups where multiple URL prefixes share a concept (e.g.
 * Leads + Applications, Counselors + Consultants, Analytics + Group Dashboard).
 */
const config: ModuleNavConfig = {
  module: 'admission',
  groups: [
    {
      label: 'Dashboard',
      icon: 'LayoutGrid',
      href: '/admission/dashboard',
      matchPaths: ['/admission/dashboard', '/admission'],
    },
    {
      label: 'Analytics',
      icon: 'LineChart',
      href: '/admission/analytics',
      matchPaths: ['/admission/analytics', '/admission/group-dashboard'],
    },
    {
      label: 'Leads',
      icon: 'UserPlus',
      href: '/admission/leads',
      matchPaths: ['/admission/leads', '/admission/applications'],
    },
    {
      label: 'GD-PI',
      icon: 'Award',
      href: '/admission/gd-pi',
      matchPaths: ['/admission/gd-pi'],
    },
    {
      label: 'Counselors',
      icon: 'HeadphonesIcon',
      href: '/admission/counselors',
      matchPaths: ['/admission/counselors', '/admission/consultants'],
    },
    {
      label: 'Marketing',
      icon: 'Megaphone',
      href: '/admission/marketing',
      matchPaths: ['/admission/marketing'],
    },
    {
      label: 'AI Insights',
      icon: 'Sparkles',
      href: '/admission/insights',
      matchPaths: ['/admission/insights'],
    },
    {
      label: 'Data Quality',
      icon: 'SearchCheck',
      href: '/admission/data-quality',
      matchPaths: ['/admission/data-quality'],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/admission/settings',
      matchPaths: ['/admission/settings'],
    },
  ],
};

export default config;
