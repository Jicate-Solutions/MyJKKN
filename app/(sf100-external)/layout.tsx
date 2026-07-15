import type { Metadata, Viewport } from 'next';

// Isolated route group for the SF100 external mentor/investor portal. It sits
// under the root app/layout.tsx (React Query + Theme providers) but renders none
// of the staff sidebar/chrome — a clean, self-contained surface for external
// contacts who have no JKKN account.
export const metadata: Metadata = {
  title: 'Solve for 100 — Mentor & Investor Portal',
  description: 'JKKN Solve for 100 — mentor and investor access to your assigned teams.',
};

export const viewport: Viewport = {
  themeColor: '#0b6d41',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function ExternalPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh">{children}</div>;
}
