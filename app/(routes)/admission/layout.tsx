import { Metadata } from 'next';
import { Suspense } from 'react';
import { AdmissionLayoutClient } from './_layout-client';

/**
 * Admission module layout — metadata + client wrapper.
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/admission/nav-config.ts
 * and renders 9 module tabs + Marketing's 5 sub-group tabs + leaves.
 * No per-module <AdmissionNav /> needed.
 */
export const metadata: Metadata = {
  title: {
    template: '%s · Admission',
    default: 'Admission',
  },
  description: 'JKKN Admission CRM - Lead management, WhatsApp chat, and enrollment',
};

interface AdmissionLayoutProps {
  children: React.ReactNode;
}

export default function AdmissionLayout({ children }: AdmissionLayoutProps) {
  return (
    <AdmissionLayoutClient>
      <Suspense
        fallback={
          <div className='flex items-center justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
          </div>
        }
      >
        {children}
      </Suspense>
    </AdmissionLayoutClient>
  );
}
