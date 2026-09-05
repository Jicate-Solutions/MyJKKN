// app/auth/connect-calendar/page.tsx
//
// The calendar-connect lock screen (Director decision 2026-08-18).
//
// A person lands here because proxy.ts saw `profiles.calendar_lock_active`. They
// hold a booking page, have no active Google Calendar connection, and their
// 3-day grace has run out. Until they connect, this is the only page they get.
//
// TWO THINGS THIS SCREEN MUST NEVER DO
//   1. Leave them stranded. The escape hatch (3 failed attempts → auto-release)
//      is REAL, and the screen says so plainly — a person whose Google flow is
//      broken has to be able to see that persisting will let them back in, or
//      they will simply believe MyJKKN is down for them.
//   2. Trap them signed in. Sign out is always reachable, and /auth/* is on the
//      gate's allow-list precisely so this link cannot be blocked.
//
// Rule #27: this is an explicit, self-explaining wall — never a silent bounce.

import Link from 'next/link';
import { CalendarCheck, LifeBuoy, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ConnectCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string; failed?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let attemptsLeft: number | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('calendar_lock_failures')
      .eq('id', user.id)
      .maybeSingle();
    const used = ((data as { calendar_lock_failures?: number } | null)?.calendar_lock_failures) ?? 0;
    attemptsLeft = Math.max(0, 3 - used);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Card>
        <CardContent className="space-y-5 py-8">
          <div className="flex flex-col items-center text-center">
            <CalendarCheck className="h-10 w-10 text-[#0E4D34]" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold">Connect your Google Calendar</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You have a booking page on MyJKKN, so people can be scheduled with
              you — but without your calendar we cannot see when you are free, and
              we will not put a meeting on your day blind.
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">It takes about 20 seconds</p>
            <p className="mt-1 text-muted-foreground">
              You will be sent to Google, asked to allow calendar access, and
              brought straight back here. We only read when you are busy and write
              the meetings you agree to — never the contents of your events.
            </p>
          </div>

          {params.failed && (
            <p
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              That attempt did not go through.
              {attemptsLeft !== null && attemptsLeft > 0 ? (
                <>
                  {' '}
                  Try once more — and if it keeps failing, MyJKKN will let you back
                  in by itself after <strong>{attemptsLeft}</strong> more{' '}
                  {attemptsLeft === 1 ? 'attempt' : 'attempts'}. You will not be
                  stuck here.
                </>
              ) : (
                <> You should be released automatically — reload this page.</>
              )}
            </p>
          )}

          <Button asChild className="w-full">
            <a href="/api/integrations/google-calendar/connect">
              <CalendarCheck className="mr-2 h-4 w-4" aria-hidden />
              Connect Google Calendar
            </a>
          </Button>

          <div className="flex items-center justify-between pt-1 text-xs">
            <Link
              href="/meetings/availability"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
              Manage my availability instead
            </Link>
            <Link
              href="/auth/login?reason=signout"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </Link>
          </div>

          {params.redirectedFrom && (
            <p className="text-center text-xs text-muted-foreground">
              We will take you back to{' '}
              <span className="font-mono">{params.redirectedFrom}</span> once you
              are connected.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
