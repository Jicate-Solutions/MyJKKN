import { ClipboardCheck, Copy, Phone } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const dataQualityTabs: SectionTab[] = [
  {
    href: '/admission/data-quality/data-profiling',
    icon: ClipboardCheck,
    label: 'Data Profiling',
  },
  {
    href: '/admission/data-quality/deduplication',
    icon: Copy,
    label: 'Deduplication',
  },
  {
    href: '/admission/data-quality/phone-validation',
    icon: Phone,
    label: 'Phone Validation',
  },
];

export default function DataQualityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={dataQualityTabs} />
      {children}
    </>
  );
}
