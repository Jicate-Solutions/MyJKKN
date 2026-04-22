import { Compass, Newspaper } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const discoveryTabs: SectionTab[] = [
  {
    href: '/solutions/discovery',
    icon: Compass,
    label: 'Visits',
  },
  {
    href: '/solutions/publications',
    icon: Newspaper,
    label: 'Publications',
  },
];

export default function PublicationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={discoveryTabs} />
      {children}
    </>
  );
}
