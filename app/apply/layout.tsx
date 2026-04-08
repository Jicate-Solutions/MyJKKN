// app/apply/layout.tsx
// Minimal layout for public admission forms — no sidebar, no auth required
// Added: 2026-04-08

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apply - JKKN',
  description: 'Admission application form',
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 dark:bg-gray-950">{children}</div>;
}
