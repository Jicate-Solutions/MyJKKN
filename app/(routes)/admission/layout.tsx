import { Metadata } from 'next';
import { Suspense } from 'react';
import { AdmissionLayoutClient } from './_layout-client';
import { AdmissionNav } from './_components/admission-nav';

export const metadata: Metadata = {
  title: {
    template: '%s | Admission',
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
      <div className='admission-module'>
        <div className='px-4 md:px-8 pt-2'>
          <AdmissionNav />
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
    </AdmissionLayoutClient>
  );
}
