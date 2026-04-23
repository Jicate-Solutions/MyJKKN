import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Admission CRM — 9 logical module tabs.
 *
 * Mirrors the original AdmissionNav design (see _components/admission-nav.tsx)
 * but as data. Groups where multiple URL prefixes share a concept (e.g.
 * Leads + Applications, Counselors + Consultants, Analytics + Group Dashboard).
 *
 * Children entries (and their `matchPaths`) double as the orphan-coverage
 * manifest for `scripts/assert-nav-coverage.mjs`. Every URL we want the
 * nav-check to consider "discoverable" must appear here as a literal `href`
 * or an exact `matchPaths` entry.
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
      // Tier-3 chips when Leads is active. "All Leads" is the list view;
      // "My Queue" is the mobile-first per-counselor work queue.
      children: [
        {
          label: 'All Leads',
          icon: 'Users',
          href: '/admission/leads',
          exact: true,
        },
        {
          label: 'My Queue',
          icon: 'ClipboardList',
          href: '/admission/leads/work',
          matchPaths: ['/admission/leads/work'],
        },
        {
          label: 'Applications',
          icon: 'FileText',
          href: '/admission/applications',
          matchPaths: ['/admission/applications'],
        },
      ],
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
      // Tier-3 chips: 7 counselor workspace pages + 5 consultant-partner
      // pages (the group's two URL roots share this tier). Mirrors the
      // in-page SectionSubNav in counselors/layout.tsx + consultants/layout.tsx.
      children: [
        {
          label: 'All Counselors',
          icon: 'Users',
          href: '/admission/counselors',
          exact: true,
        },
        {
          label: 'Daily View',
          icon: 'CalendarDays',
          href: '/admission/counselors/daily-view',
          matchPaths: ['/admission/counselors/daily-view'],
        },
        {
          label: 'Call Logs',
          icon: 'Phone',
          href: '/admission/counselors/calls',
          matchPaths: ['/admission/counselors/calls'],
        },
        {
          label: 'Reminders',
          icon: 'Bell',
          href: '/admission/counselors/reminders',
          matchPaths: ['/admission/counselors/reminders'],
        },
        {
          label: 'Activity Alerts',
          icon: 'AlertTriangle',
          href: '/admission/counselors/alerts',
          matchPaths: ['/admission/counselors/alerts'],
        },
        {
          label: 'Daily Briefing',
          icon: 'Coffee',
          href: '/admission/counselors/briefing',
          matchPaths: ['/admission/counselors/briefing'],
        },
        {
          label: 'Productivity',
          icon: 'Gauge',
          href: '/admission/counselors/productivity',
          matchPaths: ['/admission/counselors/productivity'],
        },
        {
          label: 'Consultants',
          icon: 'Handshake',
          href: '/admission/consultants',
          matchPaths: ['/admission/consultants'],
        },
        {
          label: 'Consultant Analytics',
          icon: 'LineChart',
          href: '/admission/consultants/analytics',
          matchPaths: ['/admission/consultants/analytics'],
        },
        {
          label: 'Commissions',
          icon: 'Wallet',
          href: '/admission/consultants/commissions',
          matchPaths: ['/admission/consultants/commissions'],
        },
        {
          label: 'Referrals',
          icon: 'Share2',
          href: '/admission/consultants/referrals',
          matchPaths: ['/admission/consultants/referrals'],
        },
        {
          label: 'Rewards',
          icon: 'Trophy',
          href: '/admission/consultants/rewards',
          matchPaths: ['/admission/consultants/rewards'],
        },
      ],
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
      //
      // Each bucket's matchPaths doubles as the orphan-coverage manifest for
      // the leaves under it (e.g. Expos owns /expos, /expos/analytics,
      // /expos/masters). This closes the "prefix-covered but undiscoverable"
      // loophole without needing grandchildren.
      children: [
        {
          label: 'Campaigns',
          icon: 'BarChart3',
          href: '/admission/marketing/campaigns/monitoring',
          matchPaths: [
            '/admission/marketing/campaigns',
            '/admission/marketing/campaigns/roi',
            '/admission/marketing/campaigns/segments',
          ],
        },
        {
          label: 'Messaging',
          icon: 'MessageSquare',
          href: '/admission/marketing/chat',
          matchPaths: [
            '/admission/marketing/chat',
            '/admission/marketing/chat/performance',
            '/admission/marketing/chat/settings',
            '/admission/marketing/chatbot',
            '/admission/marketing/chatbot/analytics',
            '/admission/marketing/chatbot/knowledge',
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
          // Analytics + Masters are navigate-to CHILDREN of Expos.
          // Registered here so the orphan check sees them and so the
          // tier-4 manifest crawl renders them as chips under Expos.
          matchPaths: [
            '/admission/marketing/expos',
            '/admission/marketing/expos/analytics',
            '/admission/marketing/expos/masters',
          ],
        },
      ],
    },
    {
      label: 'AI Insights',
      icon: 'Sparkles',
      href: '/admission/insights',
      matchPaths: ['/admission/insights'],
      children: [
        {
          label: 'Overview',
          icon: 'Sparkles',
          href: '/admission/insights',
          exact: true,
        },
        {
          label: 'Application Status',
          icon: 'Activity',
          href: '/admission/insights/status',
          matchPaths: ['/admission/insights/status'],
        },
      ],
    },
    {
      label: 'Data Quality',
      icon: 'SearchCheck',
      href: '/admission/data-quality',
      matchPaths: ['/admission/data-quality'],
      children: [
        {
          label: 'Overview',
          icon: 'SearchCheck',
          href: '/admission/data-quality',
          exact: true,
        },
        {
          label: 'Data Profiling',
          icon: 'ChartBar',
          href: '/admission/data-quality/data-profiling',
          matchPaths: ['/admission/data-quality/data-profiling'],
        },
        {
          label: 'Deduplication',
          icon: 'Copy',
          href: '/admission/data-quality/deduplication',
          matchPaths: ['/admission/data-quality/deduplication'],
        },
        {
          label: 'Phone Validation',
          icon: 'Phone',
          href: '/admission/data-quality/phone-validation',
          matchPaths: ['/admission/data-quality/phone-validation'],
        },
      ],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/admission/settings',
      matchPaths: ['/admission/settings'],
      // Tier-3 chips for Admission CRM settings. Templates owns its
      // three sub-pages (analytics, documents, email-builder) via matchPaths.
      children: [
        {
          label: 'Overview',
          icon: 'Settings',
          href: '/admission/settings',
          exact: true,
        },
        {
          label: 'Assignment Rules',
          icon: 'GitBranch',
          href: '/admission/settings/assignment-rules',
          matchPaths: ['/admission/settings/assignment-rules'],
        },
        {
          label: 'Form Builder',
          icon: 'FormInput',
          href: '/admission/settings/forms',
          matchPaths: ['/admission/settings/forms'],
        },
        {
          label: 'Seat Configuration',
          icon: 'LayoutGrid',
          href: '/admission/settings/seat-config',
          matchPaths: ['/admission/settings/seat-config'],
        },
        {
          label: 'Sources',
          icon: 'Share2',
          href: '/admission/settings/sources',
          matchPaths: ['/admission/settings/sources'],
        },
        {
          label: 'Templates',
          icon: 'FileText',
          href: '/admission/settings/templates',
          matchPaths: [
            '/admission/settings/templates',
            '/admission/settings/templates/analytics',
            '/admission/settings/templates/documents',
            '/admission/settings/templates/email-builder',
          ],
        },
        {
          label: 'WhatsApp Numbers',
          icon: 'MessageSquare',
          href: '/admission/settings/whatsapp-numbers',
          matchPaths: ['/admission/settings/whatsapp-numbers'],
        },
        {
          label: 'Workflow Config',
          icon: 'Workflow',
          href: '/admission/settings/workflow-config',
          matchPaths: ['/admission/settings/workflow-config'],
        },
        {
          label: 'Workflows',
          icon: 'GitFork',
          href: '/admission/settings/workflows',
          matchPaths: ['/admission/settings/workflows'],
        },
        {
          label: 'Admission Years',
          icon: 'Calendar',
          href: '/admission/settings/years',
          matchPaths: ['/admission/settings/years'],
        },
      ],
    },
  ],
};

export default config;
