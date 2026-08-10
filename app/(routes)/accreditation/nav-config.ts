import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Accreditation — 13 logical module tabs (Compliance Unification Program).
 *
 * Mirrors the original AccreditationNav (see _components/accreditation-nav.tsx,
 * now deleted) but as data. All 10 accreditation bodies (NAAC, NIRF, NBA, QS,
 * DCI, PCI, INC, NCTE, AICTE, UGC) are peer entities — no grouping, flex-wrap
 * across viewport width.
 *
 * CAC is the 11th body chip and the odd one out: the other ten are outside
 * regulators that rate JKKN, while the Cluster Academic Council is JKKN's own
 * body. It is a peer in this row because the Director asked for it to sit
 * "just like PCI or INC", not because it is a regulator.
 *
 * NAAC has nested `children` for its 5-tab SectionSubNav (previously rendered
 * by naac/layout.tsx — now folded in here). Other bodies rely on manifest
 * auto-discovery for their sub-pages.
 */
const config: ModuleNavConfig = {
  module: 'accreditation',
  groups: [
    {
      label: 'Hub',
      icon: 'Award',
      href: '/accreditation',
      matchPaths: ['/accreditation'],
    },
    // My Gaps — the per-owner worklist. Sits second because it is the only tab
    // scoped to the person reading it: every other tab answers "what does this
    // body want", this one answers "what do I owe". It carries no grade.
    {
      label: 'My Gaps',
      icon: 'ClipboardList',
      href: '/accreditation/my-gaps',
      matchPaths: ['/accreditation/my-gaps'],
    },
    // IQAC — the cell that owns the framework, placed before the report that
    // reads it. The ten body chips below each show one body's slice of
    // sh_accreditation_metrics; this tab shows all 107 rows as one governing
    // list. Like CAC it is JKKN's own body rather than an outside regulator,
    // and like CAC its page carries no grade.
    {
      label: 'IQAC',
      icon: 'ShieldCheck',
      href: '/accreditation/iqac',
      matchPaths: ['/accreditation/iqac'],
    },
    {
      label: 'Coverage',
      icon: 'BarChart3',
      href: '/accreditation/coverage',
      matchPaths: ['/accreditation/coverage'],
    },
    {
      label: 'Manage',
      icon: 'Settings',
      href: '/accreditation/manage/metrics',
      matchPaths: ['/accreditation/manage'],
      children: [
        {
          label: 'Metrics',
          icon: 'Activity',
          href: '/accreditation/manage/metrics',
        },
        {
          label: 'Grievance Categories',
          icon: 'MessageSquareWarning',
          href: '/accreditation/manage/grievance-categories',
        },
        {
          label: 'MoUs & Grants',
          icon: 'Handshake',
          href: '/accreditation/manage/collaborations',
        },
        {
          label: 'Utility Readings',
          icon: 'Leaf',
          href: '/accreditation/manage/utility-readings',
        },
        {
          label: 'Assign Owners',
          icon: 'UserCheck',
          href: '/accreditation/manage/owners',
        },
        // Which bodies exist, and which apply to which campus. Placed after
        // Assign Owners because it is what that page's denominator now depends
        // on: a college is measured only against the bodies mapped here.
        {
          label: 'Awarding Bodies',
          icon: 'Landmark',
          href: '/accreditation/manage/bodies',
        },
      ],
    },
    {
      label: 'NAAC',
      icon: 'ShieldCheck',
      href: '/accreditation/naac',
      matchPaths: ['/accreditation/naac'],
      // Tier-3 sub-groups (folded from the old naac/layout.tsx SectionSubNav).
      children: [
        {
          label: 'Overview',
          icon: 'LayoutDashboard',
          href: '/accreditation/naac',
          exact: true,
        },
        {
          label: 'AI Narratives',
          icon: 'Sparkles',
          href: '/accreditation/naac/narratives',
          matchPaths: ['/accreditation/naac/narratives'],
        },
        {
          label: 'Assign Narrative Owners',
          icon: 'UserCheck',
          href: '/accreditation/naac/narratives/owners',
          matchPaths: ['/accreditation/naac/narratives/owners'],
        },
        {
          label: 'IQAC Committees',
          icon: 'Users',
          href: '/accreditation/naac/committees',
          matchPaths: ['/accreditation/naac/committees'],
        },
        {
          label: 'DCF / AQAR Export',
          icon: 'FileDown',
          href: '/accreditation/naac/dcf-export',
          matchPaths: ['/accreditation/naac/dcf-export'],
        },
        {
          label: 'Grievance',
          icon: 'MessageSquareWarning',
          href: '/accreditation/naac/grievance',
        },
        {
          label: 'Surveys',
          icon: 'ClipboardList',
          href: '/accreditation/naac/surveys',
        },
        {
          label: 'Survey Consent (DPDPA)',
          icon: 'FileCheck2',
          href: '/accreditation/naac/surveys/consent',
          matchPaths: ['/accreditation/naac/surveys/consent'],
        },
        {
          label: '8.4 Survey Export',
          icon: 'FileSpreadsheet',
          href: '/accreditation/naac/surveys/8.4-export',
          matchPaths: ['/accreditation/naac/surveys/8.4-export'],
        },
        {
          label: 'Employer & Alumni Feedback',
          icon: 'Building2',
          href: '/accreditation/naac/surveys/stakeholders',
          matchPaths: ['/accreditation/naac/surveys/stakeholders'],
        },
      ],
    },
    {
      label: 'NIRF',
      icon: 'TrendingUp',
      href: '/accreditation/nirf',
      matchPaths: ['/accreditation/nirf'],
    },
    {
      label: 'NBA',
      icon: 'Briefcase',
      href: '/accreditation/nba',
      matchPaths: ['/accreditation/nba'],
    },
    {
      label: 'QS',
      icon: 'Globe',
      href: '/accreditation/qs',
      matchPaths: ['/accreditation/qs'],
    },
    {
      label: 'DCI',
      icon: 'Stethoscope',
      href: '/accreditation/dci',
      matchPaths: ['/accreditation/dci'],
    },
    {
      label: 'PCI',
      icon: 'ClipboardPlus',
      href: '/accreditation/pci',
      matchPaths: ['/accreditation/pci'],
    },
    {
      label: 'INC',
      icon: 'HeartPulse',
      href: '/accreditation/inc',
      matchPaths: ['/accreditation/inc'],
    },
    {
      label: 'NCTE',
      icon: 'GraduationCap',
      href: '/accreditation/ncte',
      matchPaths: ['/accreditation/ncte'],
    },
    {
      label: 'AICTE',
      icon: 'Rocket',
      href: '/accreditation/aicte',
      matchPaths: ['/accreditation/aicte'],
    },
    {
      label: 'UGC',
      icon: 'Scale',
      href: '/accreditation/ugc',
      matchPaths: ['/accreditation/ugc'],
    },
    // CAC — a peer chip, and the only entry in this row that is not an outside
    // regulator. The ten above judge JKKN; the Cluster Academic Council is
    // JKKN's own body. Placed last so the ten regulators stay contiguous and
    // the one that differs reads as separate without being demoted out of the
    // row. Its page carries no scorecard for the same reason.
    {
      label: 'CAC',
      icon: 'Network',
      href: '/accreditation/cac',
      matchPaths: ['/accreditation/cac'],
    },
  ],
};

export default config;
