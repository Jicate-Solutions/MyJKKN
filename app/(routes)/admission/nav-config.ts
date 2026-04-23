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
      // Tier-3 sub-groups (renders when Marketing is active). Replaces the
      // flat 12-chip manifest rendering with 5 logical buckets. Tier-4 still
      // drills from the manifest — e.g. on /admission/marketing/campaigns/*
      // the user sees a Campaigns-active Tier-3 + Monitor/ROI/Segments Tier-4.
      children: [
        {
          label: 'Campaigns',
          icon: 'BarChart3',
          href: '/admission/marketing/campaigns/monitoring',
          matchPaths: ['/admission/marketing/campaigns'],
        },
        {
          label: 'Messaging',
          icon: 'MessageSquare',
          href: '/admission/marketing/chat',
          matchPaths: [
            '/admission/marketing/chat',
            '/admission/marketing/chatbot',
            '/admission/marketing/parent-communication',
            '/admission/marketing/re-engagement',
            '/admission/marketing/remarketing',
            '/admission/marketing/whatsapp-broadcast',
          ],
        },
        {
          label: 'Voice',
          icon: 'Mic',
          href: '/admission/marketing/voice-agents',
          matchPaths: [
            '/admission/marketing/voice-agents',
            '/admission/marketing/voice-broadcast',
          ],
        },
        {
          label: 'Media',
          icon: 'Database',
          href: '/admission/marketing/database',
          matchPaths: [
            '/admission/marketing/database',
            '/admission/marketing/publishers',
          ],
        },
        {
          label: 'Expos',
          icon: 'CalendarClock',
          href: '/admission/marketing/expos',
          matchPaths: ['/admission/marketing/expos'],
        },
      ],
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
