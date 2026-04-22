'use client';

import {
  LayoutGrid,
  Clock,
  ClipboardCheck,
  FileBarChart,
  FileStack,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const attendanceTabs: SectionTab[] = [
  {
    href: '/academic/attendance/dashboard',
    icon: LayoutGrid,
    label: 'Dashboard',
  },
  {
    href: '/academic/attendance/pending',
    icon: Clock,
    label: 'Pending',
  },
  {
    href: '/academic/attendance',
    icon: ClipboardCheck,
    label: 'Mark Attendance',
    exact: true,
  },
  {
    href: '/academic/attendance/reports',
    icon: FileBarChart,
    label: 'Reports',
  },
  {
    href: '/academic/attendance/consolidation',
    icon: FileStack,
    label: 'Consolidation',
  },
];

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={attendanceTabs} />
      {children}
    </>
  );
}
