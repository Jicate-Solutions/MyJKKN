// app/(public)/book-interview/_components/booking-closed-notice.tsx
//
// What the link shows when there is nothing to book: the setting is off, the
// host's page is not bookable, or no post is open. A calm sentence, not an
// error — nothing is broken from the visitor's side.

import { CalendarOff } from 'lucide-react';

export function BookingClosedNotice({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          JKKN · Interviews
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Book an interview</h1>
        <div className="mt-6 flex items-start gap-3 rounded-md border border-border bg-muted px-4 py-4">
          <CalendarOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-foreground">{message}</p>
        </div>
      </div>
    </main>
  );
}
