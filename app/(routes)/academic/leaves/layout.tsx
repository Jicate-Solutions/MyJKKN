import { FileText, Tags, GitBranch } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const leavesTabs: SectionTab[] = [
  { href: '/academic/leaves', icon: FileText, label: 'All Leaves', exact: true },
  {
    href: '/academic/leaves/settings/types',
    icon: Tags,
    label: 'Leave Types',
  },
  {
    href: '/academic/leaves/settings/workflows',
    icon: GitBranch,
    label: 'Approval Workflows',
  },
];

export default function LeavesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={leavesTabs} />
      {children}
    </>
  );
}
