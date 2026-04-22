/**
 * Campus Living Module Layout
 *
 * Renders top-level tab bar (CLNav) above every Campus Living page.
 * Mirrors the Learners Council pattern (see ../learners-council/layout.tsx).
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 *
 * NOTE: Most CL child routes currently have their OWN ContentLayout wrapper
 * in each page.tsx. Leaving those in place — this layout adds the CLNav
 * between the page title and the main content without duplicating ContentLayout.
 */

import { Suspense } from 'react';
import { CLNav } from './_components/cl-nav';

interface CLLayoutProps {
  children: React.ReactNode;
}

export default function CampusLivingLayout({ children }: CLLayoutProps) {
  return (
    <div className='campus-living-module'>
      <div className='px-4 md:px-8 pt-2'>
        <CLNav />
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
