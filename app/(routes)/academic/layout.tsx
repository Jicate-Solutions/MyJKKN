/**
 * Academic Management Module Layout
 *
 * Renders top-level tab bar (AcademicNav) above every Academic page.
 * Mirrors the Campus Living pattern (see ../campus-living/layout.tsx).
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 *
 * HIGH-TRAFFIC MODULE: timetables, attendance, periods are used daily by
 * faculty. URLs are UNCHANGED — this layout only adds navigation chrome.
 */

import { Suspense } from 'react';
import { AcademicNav } from './_components/academic-nav';

interface AcademicLayoutProps {
  children: React.ReactNode;
}

export default function AcademicLayout({ children }: AcademicLayoutProps) {
  return (
    <div className='academic-module'>
      <div className='px-4 md:px-8 pt-2'>
        <AcademicNav />
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
