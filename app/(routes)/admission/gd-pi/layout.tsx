'use client';

import { Award, PlusCircle } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const gdpiTabs: SectionTab[] = [
  { href: '/admission/gd-pi', icon: Award, label: 'All Sessions', exact: true },
  { href: '/admission/gd-pi/new', icon: PlusCircle, label: 'New Session' },
];

export default function GdpiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={gdpiTabs} />
      {children}
    </>
  );
}
