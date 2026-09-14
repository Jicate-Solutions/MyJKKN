// app/(routes)/meetings/slate/page.tsx
//
// "Review the proposed month" — piece 4a of the Monthly Slate spec
// (artifacts/monthly-slate-spec-2026-08-25.html).
//
// Pieces 1 and 2 gave the EAO somewhere to define the meetings that repeat and
// the rules they are laid out against. Piece 3 gave a pure engine that turns
// those into a proposed month, and the storage for it shipped alongside. This
// screen is where a human finally SEES that month.
//
// Scope: VIEW ONLY, plus the button that proposes the month. There is no
// Approve, no Reschedule, no Drop and no Try-again here — those are piece 4b —
// and nothing on this route can create a booking or invite anybody.
//
// Auth: explicit signed-out and explicit could-not-load cards, never a silent
// redirect (CLAUDE.md rule #27) — the same pattern as /meetings/series.
//
// Permissions: reuses meetings.series.view / meetings.series.manage. No new
// permission key is invented: an invented key would be ungrantable until
// somebody added it to the catalogue, and scripts/ci/check-ungrantable-
// permissions.mjs would reject it anyway.

import Link from 'next/link';
import { AlertCircle, CalendarRange } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

import { SeriesTabBar } from '../series/_components/series-tab-bar';
import { loadSlateContext } from './actions';
import { SlateReview } from './_components/slate-review';

export const dynamic = 'force-dynamic';

// Chip label + icon for the meetings tier strip (scripts/generate-route-manifest.ts).
export const navMeta = { label: 'Proposed Month', icon: 'CalendarRange' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Proposed Month">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Recurring Series', href: '/meetings/series' },
          { label: 'Proposed Month' },
        ]}
      />
      <div className="mt-4 space-y-4">
        <PageHeader
          title="Proposed Month"
          description="A month of recurring meetings, laid against the real availability of everyone required. Nothing here is booked — it is a draft to read before anyone is invited."
        />
        <SeriesTabBar active="slate" />
        {children}
      </div>
    </ContentLayout>
  );
}

export default async function MeetingsSlatePage() {
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
              Please sign in to MyJKKN to review a proposed month.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const context = await loadSlateContext();

  // A load failure here is almost always "your role cannot see this surface".
  // Say so, name who to ask, and never bounce the user to a landing page.
  if (!context.success || !context.data) {
    return (
      <Shell>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarRange className="h-8 w-8 text-destructive/60" aria-hidden />
            <h3 className="text-sm font-medium">Could not load the proposed month</h3>
            <p className="max-w-md text-xs text-muted-foreground">{context.error}</p>
            <p className="text-[11px] text-muted-foreground">
              If you should have access, ask your MyJKKN administrator for the
              &ldquo;View Recurring Series&rdquo; permission.
            </p>
            <Link href="/meetings/series" className="mt-2 inline-flex">
              <Button variant="outline" size="sm">
                Back to series
              </Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <SlateReview initial={context.data} />
    </Shell>
  );
}
