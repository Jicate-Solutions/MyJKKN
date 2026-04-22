'use client';

import { ClipboardList, Package, Factory, ListTodo } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const contentTabs: SectionTab[] = [
  {
    href: '/solutions/content',
    icon: ClipboardList,
    label: 'Orders',
    exact: true,
  },
  {
    href: '/solutions/content/deliverables',
    icon: Package,
    label: 'Deliverables',
  },
  {
    href: '/solutions/content/production',
    icon: Factory,
    label: 'Production',
  },
  {
    href: '/solutions/content/queue',
    icon: ListTodo,
    label: 'Queue',
  },
];

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={contentTabs} />
      {children}
    </>
  );
}
