'use client';

/**
 * Instagram account drilldown — full insights view.
 *
 * Composes per-section client components, each consuming one locked insights
 * contract (C1–C6 with account_id = the route param):
 *   InsightTiles        C1 growth (+C7 summary for engagement rate) + detail route
 *   GrowthChart         C1 growth
 *   HashtagsTable       C2 hashtags
 *   ActiveHoursChart    C3 active-hours
 *   ReelsSection        C4 reels
 *   StoriesSection      C5 stories
 *   DemographicsSection C6 demographics
 *
 * Every section owns its useQuery + skeleton + error alert, so one failing
 * endpoint never blanks the page. The header / recent-posts / audit-log block
 * still comes from the existing detail route via useInstagramAccountDetail;
 * if THAT fails, only the detail block degrades to an alert — the insight
 * sections render regardless (they need only the route param).
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Heart,
  MessageCircle,
  CalendarRange,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useInstagramAccountDetail } from '@/hooks/use-instagram-account-detail';
import type { IgAccountStatus } from '@/services/instagram-service';

import { InsightTiles } from './_components/insight-tiles';
import { GrowthChart } from './_components/growth-chart';
import { HashtagsTable } from './_components/hashtags-table';
import { ActiveHoursChart } from './_components/active-hours-chart';
import { ReelsSection } from './_components/reels-section';
import { StoriesSection } from './_components/stories-section';
import { DemographicsSection } from './_components/demographics-section';

// ─── Status badge helper ────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  IgAccountStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  dormant: { label: 'Dormant', variant: 'secondary' },
  disconnected: { label: 'Disconnected', variant: 'destructive' },
  error: { label: 'Error', variant: 'destructive' },
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

const DATE_RANGES = [7, 30, 90] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InstagramAccountDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [days, setDays] = useState<number>(30);
  const { data: account, isLoading, error, refetch } = useInstagramAccountDetail(id);

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Admission', href: '/admission' },
    { label: 'Social Media', href: '/admission/social' },
    { label: 'Instagram', href: '/admission/social/instagram' },
    { label: account?.username ? `@${account.username}` : 'Account Detail' },
  ];

  const status = account ? (STATUS_BADGE[account.status] ?? STATUS_BADGE.error) : null;

  // Optional new snapshot columns — present only once the detail route exposes
  // them; read defensively so tiles degrade to '—' instead of crashing.
  const accountExtras = account as
    | (typeof account & {
        accounts_engaged?: number | null;
        total_interactions?: number | null;
      })
    | null
    | undefined;

  return (
    <PermissionGuard
      module="social.instagram"
      action="view"
      fallback={
        <ContentLayout title="Instagram Account">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title={account?.username ? `@${account.username}` : 'Instagram Account'}>
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-6 space-y-6">
          {/* Back + Refresh */}
          <div className="flex items-center justify-between">
            <Link href="/admission/social/instagram">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to accounts
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          {/* Account header card (detail route — degrades independently) */}
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : error || !account ? (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load account header: {error?.message ?? 'Account not found'}. Insight
                sections below load independently.
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Avatar placeholder */}
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xl font-bold">
                      {account.username.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-bold">@{account.username}</h1>
                      {status && <Badge variant={status.variant}>{status.label}</Badge>}
                      <Badge variant="outline" className="capitalize text-xs">
                        {account.account_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {account.institution_name}
                      {account.department_name ? ` · ${account.department_name}` : ''}
                    </p>
                    {account.bio && (
                      <p className="text-sm mt-1 text-muted-foreground line-clamp-2">
                        {account.bio}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Health score {account.health_score}/100 · Last polled{' '}
                      {relativeTime(account.last_polled_at)} · Last post{' '}
                      {relativeTime(account.last_post_at)}
                    </p>
                  </div>

                  <a
                    href={`https://instagram.com/${account.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0"
                  >
                    <Button variant="outline" size="sm" className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Open on Instagram
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Date range selector (applies to growth, hashtags, reels, stories) */}
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

          {/* KPI tiles (C1 + C7 + detail payload) */}
          <InsightTiles
            accountId={id}
            days={days}
            followingCount={account?.following_count ?? null}
            postsCount={account?.media_count ?? null}
            accountsEngaged={accountExtras?.accounts_engaged ?? null}
            totalInteractions={accountExtras?.total_interactions ?? null}
          />

          {/* Growth chart (C1) */}
          <GrowthChart accountId={id} days={days} />

          {/* Active hours (C3) + Demographics (C6) */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ActiveHoursChart accountId={id} />
            <DemographicsSection accountId={id} />
          </div>

          {/* Reels (C4) */}
          <ReelsSection accountId={id} days={days} />

          {/* Stories (C5) */}
          <StoriesSection accountId={id} days={days} />

          {/* Hashtags (C2) */}
          <HashtagsTable accountId={id} days={days} />

          {/* Recent Posts (detail route) */}
          {account && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Posts</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!account.recent_posts || account.recent_posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No posts synced yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Caption</TableHead>
                        <TableHead className="w-[90px]">Type</TableHead>
                        <TableHead className="text-right w-[80px]">
                          <Heart className="h-3.5 w-3.5 inline mr-1" />
                          Likes
                        </TableHead>
                        <TableHead className="text-right w-[90px]">
                          <MessageCircle className="h-3.5 w-3.5 inline mr-1" />
                          Comments
                        </TableHead>
                        <TableHead className="w-[90px] text-right">Eng %</TableHead>
                        <TableHead className="w-[130px]">Published</TableHead>
                        <TableHead className="w-[50px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {account.recent_posts.map((post) => (
                        <TableRow key={post.id}>
                          <TableCell className="text-sm max-w-[260px]">
                            <span className="line-clamp-1 text-muted-foreground">
                              {post.caption ?? '(no caption)'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {post.media_type.toLowerCase().replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {post.like_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {post.comments_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {post.engagement_rate != null
                              ? `${post.engagement_rate.toFixed(2)}%`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {relativeTime(post.published_at)}
                          </TableCell>
                          <TableCell>
                            <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Log (detail route) */}
          {account && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audit Log (last 20 events)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!account.audit_logs || account.audit_logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No audit events recorded yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="w-[160px]">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {account.audit_logs.slice(0, 20).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">{log.event_type}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs">
                            <span className="line-clamp-1">{JSON.stringify(log.details)}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {relativeTime(log.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
