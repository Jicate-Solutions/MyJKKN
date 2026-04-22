'use client';

import { Users, UserPlus } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const leadTabs: SectionTab[] = [
  { href: '/admission/leads', icon: Users, label: 'All Leads', exact: true },
  { href: '/admission/leads/new', icon: UserPlus, label: 'New Lead' },
];

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={leadTabs} />
      {children}
    </>
  );
}
