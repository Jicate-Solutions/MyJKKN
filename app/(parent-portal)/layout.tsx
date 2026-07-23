import type { Metadata, Viewport } from 'next';
import { ParentSWRegister } from '@/components/parent/parent-sw-register';

// Isolated route group for the Parent Portal. It still sits under the root
// app/layout.tsx (which supplies React Query + Theme providers), but renders
// none of the staff sidebar/chrome — just a mobile-first surface.
export const metadata: Metadata = {
  title: 'MyJKKN Parent Portal',
  description: 'MyJKKN Parent Portal — attendance, fees, homework and more for your child.',
  manifest: '/manifest-parent.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0b6d41',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function ParentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mobile-first surface. White app column; soft branded backdrop on wide
  // screens (web) so the centered column reads as intentional, not blank.
  return (
    <div className="min-h-dvh bg-white dark:bg-neutral-950 md:bg-gradient-to-br md:from-[#0b6d41]/10 md:via-white md:to-[#0b6d41]/5">
      <ParentSWRegister />
      {children}
    </div>
  );
}
