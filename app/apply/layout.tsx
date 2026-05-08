// app/apply/layout.tsx
// Minimal layout for public admission forms — no sidebar, no auth required
// Added: 2026-04-08

import type { Metadata } from 'next';
import { Toaster as HotToaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Apply - JKKN',
  description: 'Admission application form',
  openGraph: {
    type: 'website',
    siteName: 'JKKN Admissions',
    title: 'Apply for JKKN Admissions',
    description: 'Start your admission journey with JKKN Educational Institutions',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Apply for JKKN Admissions',
    description: 'Start your admission journey with JKKN Educational Institutions',
  },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {children}
      <HotToaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1f2937',
            color: '#fff',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </div>
  );
}
