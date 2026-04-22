import { Suspense } from 'react';
import { StartupStudioNav } from './_components/startup-studio-nav';

interface StartupStudioLayoutProps {
  children: React.ReactNode;
}

export default function StartupStudioLayout({ children }: StartupStudioLayoutProps) {
  return (
    <div className='startup-studio-module'>
      <div className='px-4 md:px-8 pt-2'>
        <StartupStudioNav />
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
