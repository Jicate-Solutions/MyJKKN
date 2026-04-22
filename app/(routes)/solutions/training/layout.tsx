import { LayoutGrid, BookOpen, CalendarClock, Users } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const trainingTabs: SectionTab[] = [
  {
    href: '/solutions/training',
    icon: LayoutGrid,
    label: 'Overview',
    exact: true,
  },
  {
    href: '/solutions/training/programs',
    icon: BookOpen,
    label: 'Programs',
  },
  {
    href: '/solutions/training/sessions',
    icon: CalendarClock,
    label: 'Sessions',
  },
  {
    href: '/solutions/training/cohort',
    icon: Users,
    label: 'Cohort',
  },
];

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={trainingTabs} />
      {children}
    </>
  );
}
