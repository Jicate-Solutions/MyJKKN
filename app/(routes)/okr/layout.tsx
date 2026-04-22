/**
 * OKR & Performance Module Layout
 *
 * Renders top-level tab bar (OKRNav) above every OKR page.
 * Mirrors the Learners Council / Campus Living / Admission CRM pattern.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 *
 * NOTE: Each OKR child page currently has its OWN ContentLayout wrapper.
 * Leaving those in place — this layout adds OKRNav between the sidebar and
 * the page content without duplicating ContentLayout.
 */

import { Suspense } from 'react';
import { OKRNav } from './_components/okr-nav';

interface OKRLayoutProps {
  children: React.ReactNode;
}

export default function OKRLayout({ children }: OKRLayoutProps) {
  return (
    <div className='okr-module'>
      <div className='px-4 md:px-8 pt-2'>
        <OKRNav />
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
