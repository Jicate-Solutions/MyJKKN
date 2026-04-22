'use client';

import { Users, FileText } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const privilegesTabs: SectionTab[] = [
  { href: '/academic/privileges', icon: Users, label: 'Manage Groups', exact: true },
  {
    href: '/academic/privileges/templates',
    icon: FileText,
    label: 'Templates',
  },
];

export default function PrivilegesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={privilegesTabs} />
      {children}
    </>
  );
}
