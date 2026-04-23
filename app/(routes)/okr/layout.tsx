import { Metadata } from 'next';
import { Suspense } from 'react';

/**
 * OKR & Performance Module Layout
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/okr/nav-config.ts and
 * renders 10 grouped module tabs. No per-module OKRNav needed.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 */
export const metadata: Metadata = {
  title: {
    template: '%s · OKR',
    default: 'OKR & Performance',
  },
  description: 'JKKN OKR & Performance - Objectives, key results, check-ins, and cascading.',
};

interface OKRLayoutProps {
  children: React.ReactNode;
}

export default function OKRLayout({ children }: OKRLayoutProps) {
  return (
    <div className='okr-module'>
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
