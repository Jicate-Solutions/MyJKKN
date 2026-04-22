/**
 * OKR Objectives Section Layout
 *
 * Tier-2 SectionSubNav rendered below the module-level OKRNav. Collapses the
 * old sidebar submenu (All Objectives + Create Objective) into in-page tabs,
 * preserving URLs /okr/objectives and /okr/objectives/new (+ /create alias).
 */

import { List, Plus } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const objectiveTabs: SectionTab[] = [
  {
    href: '/okr/objectives',
    icon: List,
    label: 'All Objectives',
    exact: true,
  },
  {
    href: '/okr/objectives/new',
    icon: Plus,
    label: 'Create Objective',
    matchPaths: ['/okr/objectives/create'],
  },
];

export default function ObjectivesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={objectiveTabs} />
      {children}
    </>
  );
}
