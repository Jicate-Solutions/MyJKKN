/**
 * Accreditation Module Layout (Compliance Unification Program)
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/accreditation/nav-config.ts
 * and renders 12 module tabs (Hub + Coverage + 10 bodies) + NAAC's 5
 * nested sub-tabs when NAAC is active. No per-module <AccreditationNav />
 * needed.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 */

import { Suspense } from 'react';

interface AccreditationLayoutProps {
  children: React.ReactNode;
}

export default function AccreditationLayout({ children }: AccreditationLayoutProps) {
  return (
    <div className='accreditation-module'>
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
