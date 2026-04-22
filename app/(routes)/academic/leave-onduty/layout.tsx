'use client';

import { CheckCircle2, Settings, BarChart3 } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const leaveOnDutyTabs: SectionTab[] = [
  {
    href: '/academic/leave-onduty/approvals',
    icon: CheckCircle2,
    label: 'Approvals',
  },
  {
    href: '/academic/leave-onduty/settings',
    icon: Settings,
    label: 'Workflow Settings',
  },
  {
    href: '/academic/leave-onduty/reports',
    icon: BarChart3,
    label: 'Reports',
  },
];

export default function LeaveOnDutyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={leaveOnDutyTabs} />
      {children}
    </>
  );
}
