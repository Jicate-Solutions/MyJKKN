import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Accreditation — 12 logical module tabs (Compliance Unification Program).
 *
 * Mirrors the original AccreditationNav (see _components/accreditation-nav.tsx,
 * now deleted) but as data. All 10 accreditation bodies (NAAC, NIRF, NBA, QS,
 * DCI, PCI, INC, NCTE, AICTE, UGC) are peer entities — no grouping, flex-wrap
 * across viewport width.
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
  ],
};

export default config;
