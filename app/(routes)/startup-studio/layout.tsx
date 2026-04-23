import { Metadata } from 'next';
import { Suspense } from 'react';
import { StartupStudioNav } from './_components/startup-studio-nav';

/**
 * Startup Studio module metadata.
 *
 * Title template is `'%s · Startup Studio'` — NOT `'%s · Startup Studio · MyJKKN'`.
 * Root layout adds the `· MyJKKN` suffix; embedding it here caused the
 * `'Page · Startup Studio · MyJKKN · MyJKKN'` triple-suffix bug.
 * See #371 for the admission equivalent fix.
 */
export const metadata: Metadata = {
  title: {
    template: '%s · Startup Studio',
    default: 'Startup Studio',
  },
  description: 'JKKN Startup Studio - Innovation cycles, mentorship, and portfolio',
};

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
