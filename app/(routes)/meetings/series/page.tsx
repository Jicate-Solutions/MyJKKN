// app/(routes)/meetings/series/page.tsx
//
// "Recurring Series" — the EAO's configuration screen, piece 1 of the Monthly
// Slate spec (artifacts/monthly-slate-spec-2026-08-25.html).
//
// Today JKKN's recurring institutional meetings are typed by hand into the
// Director's Google Calendar. The sample sheet alone held 746 dated slots and
// none of them exist in MyJKKN. This screen is where that list finally lives —
// and, deliberately, the screen IS the interview: rather than hardcode one
// person's reading of the rules, the constraints become data the proposal
// engine (piece 3, not built) will read.
//
// Scope: configuration only. Nothing on this page or its actions proposes a
// month, creates a booking, or approves anything.
//
// Auth: an explicit signed-out / cannot-load card, never a silent redirect to
// /dashboard (CLAUDE.md rule #27) — same pattern as /meetings/manage.

import Link from 'next/link';
import { AlertCircle, CalendarClock } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

import { listInstitutionOptions, listSeries } from './actions';
import { SeriesManager } from './_components/series-manager';
import { SeriesTabBar } from './_components/series-tab-bar';

export const dynamic = 'force-dynamic';

// Chip label + icon for the meetings tier strip (scripts/generate-route-manifest.ts).
// Without it the chip reads "Series", which says nothing next to "Meeting Types".
export const navMeta = { label: 'Recurring Series', icon: 'Repeat' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Recurring Series">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Recurring Series' },
        ]}
      />
      <div className="mt-4 space-y-4">
        <PageHeader
          title="Recurring Series"
          description="The meetings that repeat — IQAC, the reviews, the weekly series. Defined once here, so a month can be proposed from them instead of typed out by hand."
        />
        <SeriesTabBar active="series" />
        {children}
      </div>
    </ContentLayout>
  );
}

export default async function MeetingsSeriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You are not signed in</h3>
            <p className="text-xs text-muted-foreground">
              Please sign in to MyJKKN to configure recurring meeting series.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const [seriesResult, institutionsResult] = await Promise.all([
    listSeries(),
    listInstitutionOptions(),
  ]);

  // A load failure here is almost always "your role cannot see this surface".
  // Say so, name who to ask, and never bounce the user to a generic landing
  // page they will click straight back out of.
  if (!seriesResult.success) {
    return (
      <Shell>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarClock className="h-8 w-8 text-destructive/60" aria-hidden />
            <h3 className="text-sm font-medium">Could not load the recurring series</h3>
            <p className="max-w-md text-xs text-muted-foreground">{seriesResult.error}</p>
            <p className="text-[11px] text-muted-foreground">
              If you should have access, ask your MyJKKN administrator for the
              &ldquo;Manage Recurring Series&rdquo; permission.
            </p>
            <Link href="/meetings/inbox" className="mt-2 inline-flex">
              <Button variant="outline" size="sm">
                Back to meetings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <SeriesManager
        initialSeries={seriesResult.data ?? []}
        institutions={institutionsResult.success ? institutionsResult.data ?? [] : []}
      />
    </Shell>
  );
}
