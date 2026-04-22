import {
  Users,
  CalendarDays,
  Phone,
  Bell,
  AlertTriangle,
  Coffee,
  Gauge,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const counselorTabs: SectionTab[] = [
  { href: '/admission/counselors', icon: Users, label: 'All Counselors', exact: true },
  {
    href: '/admission/counselors/daily-view',
    icon: CalendarDays,
    label: 'Daily View',
  },
  { href: '/admission/counselors/calls', icon: Phone, label: 'Call Logs' },
  { href: '/admission/counselors/reminders', icon: Bell, label: 'Reminders' },
  {
    href: '/admission/counselors/alerts',
    icon: AlertTriangle,
    label: 'Activity Alerts',
  },
  { href: '/admission/counselors/briefing', icon: Coffee, label: 'Daily Briefing' },
  { href: '/admission/counselors/productivity', icon: Gauge, label: 'Productivity' },
];

export default function CounselorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={counselorTabs} />
      {children}
    </>
  );
}
