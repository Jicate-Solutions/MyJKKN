'use client';

/**
 * Facebook page drilldown — per-page analytics view.
 *
 * Composes per-section client components, each consuming one locked insights
 * contract (F1–F3 with page_id = the route param, a fb_pages UUID):
 *   FbInsightTiles    F1 growth (latest point + fans_gained)
 *   FbGrowthChart     F1 growth (fans + unique impressions lines)
 *   FbPostTypesChart  F3 post-types
 *   FbTopPostsTable   F2 top-posts
 *
 * Every section owns its useQuery + skeleton + error alert, so one failing
 * endpoint never blanks the page.
 *
 * HEADER RESOLUTION CHOICE (documented per lane brief): the existing
 * /api/social/facebook/page-health endpoint keys rows by fb_page_id (the
 * Meta page id) and does NOT expose the internal fb_pages UUID, so it cannot
 * resolve this route's param. F4 summary returns pages keyed by internal
 * UUID with { id, name, institution_name } — one useQuery, zero new
 * endpoints → least-new-code path. If F4 fails, the header degrades to a
 * generic title and the insight sections render regardless.
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarRange, Facebook } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { FbInsightTiles } from './_components/fb-insight-tiles';
import { FbGrowthChart } from './_components/fb-growth-chart';
import { FbTopPostsTable } from './_components/fb-top-posts-table';
import { FbPostTypesChart } from './_components/fb-post-types-chart';

// ─── F4 summary contract (used only to resolve the page header) ─────────────

interface SummaryPage {
  id: string;
  name: string;
  institution_name: string;
  fans: number;
  fans_gained: number;
  impressions_unique: number;
  post_engagements: number;
  posts_in_window: number;
}

interface SummaryData {
  pages: SummaryPage[];
  totals: {
    fans: number;
    impressions_unique: number;
    post_engagements: number;
    posts: number;
  };
}

async function getInsights<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

const DATE_RANGES = [7, 30, 90] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function FacebookPageDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [days, setDays] = useState<number>(30);

  // Header metadata via F4 — fixed 30d window so the header query is stable
  // regardless of the chart selector (we only need name + institution here).
  const summary = useQuery<SummaryData, Error>({
    queryKey: ['fb-insights-summary', 30],
    queryFn: () => getInsights<SummaryData>('/api/social/facebook/insights/summary?days=30'),
    staleTime: 60_000,
    retry: 1,
  });

  const page = summary.data?.pages.find((p) => p.id === id) ?? null;

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Admission', href: '/admission' },
    { label: 'Social Media', href: '/admission/social' },
    { label: 'Facebook', href: '/admission/social/facebook' },
    { label: page?.name ?? 'Page Detail' },
  ];

  return (
    <PermissionGuard
      module="social.facebook"
      action="view"
      fallback={
        <ContentLayout title="Facebook Page">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title={page?.name ?? 'Facebook Page'}>
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-6 space-y-6">
          {/* Back link */}
          <div className="flex items-center justify-between">
            <Link href="/admission/social/facebook">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to pages
              </Button>
            </Link>
          </div>

          {/* Page header card (F4 — degrades independently) */}
          {summary.isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : summary.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load page header: {summary.error.message}. Insight sections below load
                independently.
              </AlertDescription>
            </Alert>
          ) : !page ? (
            <Alert>
              <AlertDescription>
                This page was not found in the insights summary. It may not have metric snapshots
                yet — insight sections below load independently.
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Facebook className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold">{page.name}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {page.institution_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {page.posts_in_window.toLocaleString()} post
                      {page.posts_in_window === 1 ? '' : 's'} in the last 30 days
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Date range selector (applies to tiles, growth, post types, top posts) */}
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground mr-1">Window:</span>
            {DATE_RANGES.map((range) => (
              <Button
                key={range}
                variant={days === range ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDays(range)}
              >
                {range}d
              </Button>
            ))}
          </div>

          {/* KPI tiles (F1) */}
          <FbInsightTiles pageId={id} days={days} />

          {/* Growth chart (F1) */}
          <FbGrowthChart pageId={id} days={days} />

          {/* Post type mix (F3) */}
          <FbPostTypesChart pageId={id} days={days} />

          {/* Top posts (F2) */}
          <FbTopPostsTable pageId={id} days={days} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
