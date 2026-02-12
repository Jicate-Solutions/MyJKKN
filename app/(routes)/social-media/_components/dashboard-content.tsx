'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, Users, Activity, TrendingUp, AlertCircle, Instagram, Youtube } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_COLORS,
  type SmDashboardOverview,
  type SmHealthStatus,
} from '@/types/social-media';

interface DashboardContentProps {
  institutionId: string;
}

export function DashboardContent({ institutionId }: DashboardContentProps) {
  const [data, setData] = useState<SmDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(`/api/social-media/dashboard?institution_id=${encodeURIComponent(institutionId)}`);
        if (!res.ok) throw new Error('Failed to load dashboard');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [institutionId]);

  if (loading) return null; // Server skeleton handles loading state
  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!data) return null;

  const healthTotal = Object.values(data.healthBreakdown).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Accounts"
          value={data.totalAccounts}
          description={`${data.connectedAccounts} connected via API`}
          icon={<Share2 className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Total Followers"
          value={formatNumber(data.totalFollowers)}
          description="Across all platforms"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Avg Engagement Rate"
          value={data.avgEngagementRate > 0 ? `${(data.avgEngagementRate * 100).toFixed(2)}%` : 'No data'}
          description="Likes + comments / followers"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Active Accounts"
          value={data.healthBreakdown.green}
          description={`${data.healthBreakdown.red + data.healthBreakdown.dormant} need attention`}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          alert={data.healthBreakdown.red + data.healthBreakdown.dormant > 0}
        />
      </div>

      {/* Health Overview & Platform Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Health Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Health</CardTitle>
            <CardDescription>Current status of all {data.totalAccounts} accounts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(['green', 'yellow', 'red', 'dormant'] as SmHealthStatus[]).map(status => {
              const count = data.healthBreakdown[status];
              const pct = healthTotal > 0 ? (count / healthTotal) * 100 : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: HEALTH_STATUS_COLORS[status] }}
                      />
                      <span>{HEALTH_STATUS_LABELS[status]}</span>
                    </div>
                    <span className="font-medium">{count}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Platform Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platforms</CardTitle>
            <CardDescription>Accounts by platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data.platformBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={platform} />
                      <span className="text-sm">
                        {PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] || platform}
                      </span>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Posts */}
      {data.topPosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Performing Posts</CardTitle>
            <CardDescription>Highest engagement rate posts across all accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topPosts.slice(0, 5).map((post, i) => (
                <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg border">
                  <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{post.caption || 'No caption'}</p>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{post.likes_count} likes</span>
                      <span>{post.comments_count} comments</span>
                      {post.views_count > 0 && <span>{formatNumber(post.views_count)} views</span>}
                      <span>ER: {(Number(post.engagement_rate) * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline shrink-0"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when no snapshots */}
      {data.topPosts.length === 0 && data.recentSnapshots.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-semibold">No monitoring data yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Social media accounts are registered but no snapshots have been collected.
                Data will appear here once monitoring starts.
              </p>
            </div>
            <Link href="/social-media/accounts">
              <button className="text-sm text-blue-500 hover:underline">
                View registered accounts
              </button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ─── Helper Components ───────────────────────────────────────────────────────

function StatsCard({
  title,
  value,
  description,
  icon,
  alert,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold">{value}</div>
          {alert && <AlertCircle className="h-4 w-4 text-red-500" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS] || '#6B7280';
  const size = 'h-5 w-5';

  switch (platform) {
    case 'instagram':
      return <Instagram className={size} style={{ color }} />;
    case 'youtube':
      return <Youtube className={size} style={{ color }} />;
    default:
      return (
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
          style={{ backgroundColor: color }}
        >
          {platform.charAt(0).toUpperCase()}
        </div>
      );
  }
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
