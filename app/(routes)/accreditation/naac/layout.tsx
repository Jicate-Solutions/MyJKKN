'use client';

/**
 * NAAC (IQAC) Section Layout
 *
 * Tier-2 navigation for the NAAC body of the Compliance Unification
 * Program. Renders SectionSubNav with 5 peer tabs:
 *   - Overview (body root)
 *   - IQAC Committees
 *   - DCF / AQAR Export
 *   - Survey Consent (DPDPA)
 *   - 8.4 Survey Export
 *
 * Mirrors admission/marketing/layout.tsx pattern.
 */

import {
  LayoutDashboard,
  Users,
  FileDown,
  FileCheck2,
  FileSpreadsheet,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const naacTabs: SectionTab[] = [
  {
    href: '/accreditation/naac',
    icon: LayoutDashboard,
    label: 'Overview',
    exact: true,
  },
  {
    href: '/accreditation/naac/committees',
    icon: Users,
    label: 'IQAC Committees',
  },
  {
    href: '/accreditation/naac/dcf-export',
    icon: FileDown,
    label: 'DCF / AQAR Export',
  },
  {
    href: '/accreditation/naac/surveys/consent',
    icon: FileCheck2,
    label: 'Survey Consent (DPDPA)',
  },
  {
    href: '/accreditation/naac/surveys/8.4-export',
    icon: FileSpreadsheet,
    label: '8.4 Survey Export',
  },
];

export default function NAACLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={naacTabs} />
      {children}
    </>
  );
}
