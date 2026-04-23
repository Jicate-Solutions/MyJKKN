/**
 * Campus Living Module Layout
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/campus-living/nav-config.ts
 * and renders 8 grouped module tabs. No per-module CLNav needed.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 */

import { Suspense } from 'react';

interface CLLayoutProps {
  children: React.ReactNode;
}

export default function CampusLivingLayout({ children }: CLLayoutProps) {
  return (
    <div className='campus-living-module'>
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
