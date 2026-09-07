// app/(routes)/meetings/series/rules/page.tsx
//
// "Scheduling rules" — piece 2 of the Monthly Slate spec. The rules a proposed
// month will be laid out against, set by the EAO rather than baked into code.
//
// Deliberately only two rules live here: blocked periods (public holidays and
// festivals) and the rotation order. There is no cap on meetings per day, by
// decision; and travel does not appear at all, because a travel week turns a
// series online rather than blocking it.
//
// REUSE, not duplication: a host's own weekly working hours and their personal
// closed dates already have shipped editors on /meetings/availability. This
// page links to them instead of growing a second pair that could disagree.
//
// Auth: explicit signed-out / cannot-load cards, never a silent redirect
// (CLAUDE.md rule #27).

import Link from 'next/link';
import { AlertCircle, Clock, SlidersHorizontal } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

import { SeriesTabBar } from '../_components/series-tab-bar';
import { listBlockedPeriods, listRotationOrder, listRuleInstitutions } from './actions';
import { RulesEditor } from './_components/rules-editor';

export const dynamic = 'force-dynamic';

// Chip label + icon for the tier strip (scripts/generate-route-manifest.ts).
export const navMeta = { label: 'Scheduling Rules', icon: 'SlidersHorizontal' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Scheduling Rules">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Recurring Series', href: '/meetings/series' },
          { label: 'Scheduling Rules' },
        ]}
      />
      <div className="mt-4 space-y-4">
        <PageHeader
          title="Scheduling Rules"
          description="What stops a meeting being placed, and who yields when two colleges want the same slot."
        />
        <SeriesTabBar active="rules" />
        {children}
      </div>
    </ContentLayout>
  );
}

export default async function MeetingsSeriesRulesPage() {
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
              Please sign in to MyJKKN to set the scheduling rules.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const [blockedResult, rotationResult, institutionsResult] = await Promise.all([
    listBlockedPeriods(),
    listRotationOrder(),
    listRuleInstitutions(),
  ]);

  if (!blockedResult.success) {
    return (
      <Shell>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <SlidersHorizontal className="h-8 w-8 text-destructive/60" aria-hidden />
            <h3 className="text-sm font-medium">Could not load the scheduling rules</h3>
            <p className="max-w-md text-xs text-muted-foreground">{blockedResult.error}</p>
            <p className="text-[11px] text-muted-foreground">
              If you should have access, ask your MyJKKN administrator for the
              &ldquo;Manage Recurring Series&rdquo; permission.
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
      <RulesEditor
        initialBlockedPeriods={blockedResult.data ?? []}
        initialRotation={
          rotationResult.success ? (rotationResult.data ?? []).map((r) => r.institutionId) : []
        }
        institutions={institutionsResult.success ? institutionsResult.data ?? [] : []}
      />

      {/* Reuse, not duplication — the personal editors already shipped. */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Working hours and your own closed dates</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A host&apos;s weekly hours and personal closed dates are edited on My
              Availability. They are not repeated here so the two can never disagree.
            </p>
          </div>
          <Link href="/meetings/availability" className="inline-flex shrink-0">
            <Button variant="outline" size="sm">
              <Clock className="mr-1.5 h-4 w-4" aria-hidden />
              Open My Availability
            </Button>
          </Link>
        </CardContent>
      </Card>
    </Shell>
  );
}
