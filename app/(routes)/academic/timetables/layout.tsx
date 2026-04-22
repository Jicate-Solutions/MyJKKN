import { CalendarClock, LayoutTemplate, Calendar } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const timetablesTabs: SectionTab[] = [
  {
    href: '/academic/timetables',
    icon: CalendarClock,
    label: 'Manage Timetables',
    exact: true,
  },
  {
    href: '/academic/timetables/templates',
    icon: LayoutTemplate,
    label: 'Template Library',
  },
  {
    href: '/academic/timetables/faculty-calendar',
    icon: Calendar,
    label: 'Timetable Calendar',
  },
];

export default function TimetablesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={timetablesTabs} />
      {children}
    </>
  );
}
