'use client';

import { use } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Users,
  Image as ImageIcon,
  Activity,
  Heart,
  MessageCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
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
import { Progress } from '@/components/ui/progress';

import { useInstagramAccountDetail } from '@/hooks/use-instagram-account-detail';
import type { IgAccountStatus } from '@/services/instagram-service';

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

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

function healthColor(score: number): string {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  if (score >= 25) return 'text-orange-600';
  return 'text-red-600';
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InstagramAccountDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: account, isLoading, error, refetch } = useInstagramAccountDetail(id);

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Administration' },
    { label: 'Social Media', href: '/admin/social' },
    { label: 'Instagram', href: '/admin/social/instagram' },
    { label: account?.username ? `@${account.username}` : 'Account Detail' },
  ];

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ContentLayout title="Instagram Account">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </ContentLayout>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !account) {
    return (
      <ContentLayout title="Instagram Account">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-6 space-y-4">
          <Link href="/admin/social/instagram">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to accounts
            </Button>
          </Link>
          <Alert variant="destructive">
            <AlertDescription>
              {error?.message.includes('404')
                ? 'Account detail API route not yet deployed (Agent γ PR pending).'
                : `Failed to load account: ${error?.message ?? 'Unknown error'}`}
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  const status = STATUS_BADGE[account.status] ?? STATUS_BADGE.error;

  // Prepare trendline data (last 30 snapshots, oldest first)
  const trendData = [...(account.metric_snapshots ?? [])]
    .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())
    .slice(-30)
    .map((s) => ({
      date: format(new Date(s.captured_at), 'MMM d'),
      followers: s.followers_count,
    }));

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Instagram Account">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title={`@${account.username}`}>
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        {/* Back + Refresh */}
        <div className="flex items-center justify-between">
          <Link href="/admin/social/instagram">
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

        {/* Account header card */}
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
                  <Badge variant={status.variant}>{status.label}</Badge>
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

        {/* KPI row */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Followers
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className="text-2xl font-bold">{fmt(account.followers_count)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" /> Posts
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className="text-2xl font-bold">{fmt(account.media_count)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" /> Health Score
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className={`text-2xl font-bold ${healthColor(account.health_score)}`}>
                {account.health_score}/100
              </p>
              <Progress value={account.health_score} className="h-1.5 mt-1" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
                Last Polled
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <p className="text-sm font-medium">{relativeTime(account.last_polled_at)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last post: {relativeTime(account.last_post_at)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Followers trendline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follower Trend (last 30 polls)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No metric history yet. Data will populate after the first poll cycle.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmt(v as number)}
                  />
                  <Tooltip
                    formatter={(value: number) => [fmt(value), 'Followers']}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="followers"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Posts */}
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
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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

        {/* Audit Log */}
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
                      <TableCell className="font-mono text-xs">
                        {log.event_type}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        <span className="line-clamp-1">
                          {JSON.stringify(log.details)}
                        </span>
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
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
