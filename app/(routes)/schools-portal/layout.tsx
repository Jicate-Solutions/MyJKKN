// app/(routes)/schools-portal/layout.tsx
// Layout for the Schools Network HM Portal.
//
// Mirrors the canonical /consultant-portal layout shape (sidebar + main pane,
// mobile-friendly), with one structural difference: there is NO useAuth() here
// because HMs are not Supabase auth.users. The dashboard pulls its session
// metadata from GET /api/schools-portal/me, which uses the school_portal_session
// cookie under the hood.

import { ReactNode } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

export const metadata = {
  title: 'School Portal — JKKN',
  description: 'JKKN Schools Network — Headmaster portal',
};

export default function SchoolsPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4">
          <div className="rounded-md bg-[#0b6d41]/10 p-2 text-[#0b6d41]">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <Link
              href="/schools-portal/dashboard"
              className="block text-base font-semibold leading-tight text-[#11243a] hover:text-[#0b6d41]"
            >
              JKKN Schools Network
            </Link>
            <p className="text-xs text-muted-foreground">
              Headmaster / Principal portal
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
