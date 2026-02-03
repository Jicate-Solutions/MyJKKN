import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Solutions Hub',
    default: 'Solutions Hub',
  },
  description: 'JKKN Solutions Hub - Managing software, training, and content solutions',
};

interface SolutionsLayoutProps {
  children: React.ReactNode;
}

export default function SolutionsLayout({ children }: SolutionsLayoutProps) {
  return <>{children}</>;
}
