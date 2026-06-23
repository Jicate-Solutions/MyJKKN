// app/(public)/meet/[handle]/_components/not-bookable.tsx
//
// Shown when a /meet/<handle> page resolves a REAL, public, Google-connected
// host who simply hasn't created any meeting types yet. Without this the page
// 404s (host.meetingTypes.length === 0 → notFound) — a confusing dead-end for
// the host testing their own freshly-generated link, and an unhelpful raw 404
// for any visitor. Explicit state instead of a silent 404 (BUG-004267).

import Link from 'next/link';
import { CalendarClock } from 'lucide-react';

interface NotBookableProps {
  handle: string;
  name: string;
}

export function NotBookable({ handle, name }: NotBookableProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <CalendarClock className="h-6 w-6 text-amber-700" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-neutral-900">
          Not accepting bookings yet
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {name}
          {' '}
          hasn&apos;t set up any meeting types, so there&apos;s nothing to book
          on{' '}
          <span className="font-medium text-neutral-700">/meet/{handle}</span>{' '}
          right now.
        </p>
        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-left text-xs text-neutral-500">
          <p className="font-medium text-neutral-700">Is this your booking page?</p>
          <p className="mt-1">
            Your link goes live as soon as you add at least one meeting type.
          </p>
          <Link
            href="/meetings/manage"
            className="mt-2 inline-flex items-center font-medium text-blue-600 hover:text-blue-700"
          >
            Set up meeting types →
          </Link>
        </div>
      </div>
    </main>
  );
}
