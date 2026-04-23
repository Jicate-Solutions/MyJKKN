import { Suspense } from 'react';

/**
 * Academic Management Module Layout
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/academic/nav-config.ts and
 * renders the 9 module tabs + section sub-tabs from the route manifest.
 * No per-module <AcademicNav /> needed.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 *
 * HIGH-TRAFFIC MODULE: timetables, attendance, periods are used daily by
 * faculty. URLs are UNCHANGED.
 */

interface AcademicLayoutProps {
  children: React.ReactNode;
}

export default function AcademicLayout({ children }: AcademicLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className='flex items-center justify-center py-8'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
