'use client';

// The panel under the stat cards: what to do next — ported from the standalone
// InstaSolver (dashboard-panels.tsx). A dashboard that only shows counts makes
// the reader hunt for the list the count came from, so each role gets the
// shortcut that matches their job.

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { IssueStatusBadge, PriorityBadge } from '@/components/instasolver/badges';
import { useIssues, useReporterProfile } from '@/hooks/instasolver/use-instasolver';
import type { DashboardRole } from './role';

export function DashboardPanels({ role }: { role: DashboardRole }) {
  // The Principal gets the scoped, read-only panel.
  if (role === 'principal') return <PrincipalPanel />;

  // Full width. The standalone's "Report something" tiles are not repeated
  // here — the page header already carries Report an issue / Request an item.
  return (
    <div className="min-w-0">
      <RecentIssues
        title={
          role === 'cao' || role === 'super_admin'
            ? 'Latest reports'
            : role === 'maintenance'
              ? 'Latest issues'
              : 'Your latest reports'
        }
      />
    </div>
  );
}

function RecentIssues({ title }: { title: string }) {
  const { data, isLoading, error, refetch } = useIssues({ page: 1, limit: 5 });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/instasolver/issues">
            View all
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">
            The latest issues could not be loaded.{' '}
            <button type="button" className="underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium">Nothing reported yet</p>
            <p className="text-sm text-muted-foreground">
              When an issue is reported, it will appear here with its current status.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {data.data.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/instasolver/issues/${issue.id}`}
                  className="-mx-2 flex flex-col gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{issue.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {issue.reference_no} · {issue.location} ·{' '}
                      {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <PriorityBadge priority={issue.priority} />
                    <IssueStatusBadge status={issue.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A Principal sees their own institution. With no institution on their MyJKKN
 * profile every view is legitimately empty — saying so is the difference
 * between asking for it to be set and assuming the system is broken.
 */
function PrincipalPanel() {
  const { data: profile, isLoading } = useReporterProfile();

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!profile?.institution_id) {
    return (
      <Card>
        <CardContent className="space-y-1 py-8 text-center">
          <p className="font-medium">No institution on your profile</p>
          <p className="text-sm text-muted-foreground">
            A Principal sees the issues of their own institution. Ask the MyJKKN administrator to set the institution
            on your profile; until then every list here is empty.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="self-start lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your institution</CardTitle>
          <CardDescription>Every figure and list you see is limited to it.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            {profile.institution_name ?? 'Your institution'}
          </p>
        </CardContent>
      </Card>
      <div className="min-w-0 lg:col-span-2">
        <RecentIssues title="Latest in your institution" />
      </div>
    </div>
  );
}
