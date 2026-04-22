import { LayoutGrid, List, LineChart } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const pipelineTabs: SectionTab[] = [
  {
    href: '/solutions/pipeline',
    icon: LayoutGrid,
    label: 'Board View',
    exact: true,
  },
  {
    href: '/solutions/pipeline/list',
    icon: List,
    label: 'List View',
  },
  {
    href: '/solutions/pipeline/analytics',
    icon: LineChart,
    label: 'Analytics',
  },
];

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={pipelineTabs} />
      {children}
    </>
  );
}
