import { LayoutGrid, Hammer, GitBranch } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const softwareTabs: SectionTab[] = [
  {
    href: '/solutions/software',
    icon: LayoutGrid,
    label: 'Overview',
    exact: true,
  },
  {
    href: '/solutions/software/builders',
    icon: Hammer,
    label: 'Builders',
  },
  {
    href: '/solutions/software/phases',
    icon: GitBranch,
    label: 'Phases',
  },
];

export default function SoftwareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={softwareTabs} />
      {children}
    </>
  );
}
