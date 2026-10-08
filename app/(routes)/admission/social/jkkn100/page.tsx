'use client';

/**
 * Admission / Social Media / JKKN100 — the Monday scoreboard for the 40-day
 * Founders Day reel countdown (Director's decision 2026-10-08).
 *
 * One anchor reel a day from @jkkninstitutions; every other tracked Instagram
 * account uploads its own copy within the hour, tagged #JKKN100Day40 …
 * #JKKN100Day01, where the tag counts the days left to Founders Day on
 * 18 November 2026 and so fixes each day's date. This page shows, per account
 * and per day tag, YES (with minutes after the anchor), NO, COLLAB (on that
 * day's hand-set collab list, so no own copy is expected) or UNKNOWN (with the
 * reason), plus totals and a CSV of the same data. Days run Day 40 first.
 *
 * Data: GET /api/social/jkkn100/scoreboard (read-only, caller's session).
 * Rules: lib/services/social/jkkn100-scoreboard.ts.
 * Gate: social.view — same as the Governance and Loop chips beside it.
 */

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Jkkn100ScoreboardBody } from './_components/jkkn100-scoreboard-body';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'JKKN100' },
];

export default function Jkkn100ScoreboardPage() {
  return (
    <PermissionGuard
      module="social"
      action="view"
      fallback={
        <ContentLayout title="JKKN100 Reel Scoreboard">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator to grant the Social Media
            permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="JKKN100 Reel Scoreboard">
        <PageBreadcrumb items={breadcrumbItems} />
        {/* useSearchParams() must sit inside a Suspense boundary or the page
            build fails on prerender (Next.js app-router requirement). */}
        <Suspense
          fallback={
            <div className="mt-6 space-y-6">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          }
        >
          <Jkkn100ScoreboardBody />
        </Suspense>
      </ContentLayout>
    </PermissionGuard>
  );
}
