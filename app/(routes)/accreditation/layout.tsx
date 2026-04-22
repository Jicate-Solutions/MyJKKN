/**
 * Accreditation Module Layout (Compliance Unification Program)
 *
 * Renders top-level tab bar (AccreditationNav) above every Accreditation
 * page. Mirrors the Campus Living / Learners Council pattern.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This
 * avoids double getEnhancedUserProfile() calls which fail in Next.js 16
 * Turbopack.
 *
 * Child routes keep their existing page-level ContentLayout wrappers;
 * this layout inserts AccreditationNav between the page title and main
 * content without duplicating ContentLayout.
 */

import { Suspense } from 'react';
import { AccreditationNav } from './_components/accreditation-nav';

interface AccreditationLayoutProps {
  children: React.ReactNode;
}

export default function AccreditationLayout({ children }: AccreditationLayoutProps) {
  return (
    <div className='accreditation-module'>
      <div className='px-4 md:px-8 pt-2'>
        <AccreditationNav />
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
