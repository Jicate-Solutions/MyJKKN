// app/student-form/layout.tsx
// Minimal layout for the public QR self-fill student form — no sidebar,
// no auth required (token-gated route, see proxy.ts PUBLIC_PATH_PREFIXES).
//
// CRITICAL: this layout exists primarily to mount the react-hot-toast
// <Toaster />. The wizard (wizard-shell.tsx and every step component)
// surfaces ALL feedback — required-field validation, save failures, token
// expiry — via toast(). The root app/layout.tsx mounts no Toaster (the
// authenticated app gets one in app/(routes)/layout.tsx), so without this
// file every toast on this route is a silent no-op and the form appears
// "stuck" with no error shown. Mirrors app/apply/layout.tsx (2026-04-08).

import type { Metadata } from 'next';
import { Toaster as HotToaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Student Form - JKKN',
  description: 'JKKN admission self-fill form',
};

export default function StudentFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
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
