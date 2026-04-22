import { Metadata } from 'next';
import { Suspense } from 'react';
import { SolutionsNav } from './_components/solutions-nav';

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
  return (
    <div className='solutions-module'>
      <div className='px-4 md:px-8 pt-2'>
        <SolutionsNav />
      </div>
      <Suspense
        fallback={
          <div className='flex items-center justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
