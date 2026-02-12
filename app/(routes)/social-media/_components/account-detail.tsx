'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Instagram, Youtube, Calendar, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type SmAccount,
  type SmSnapshot,
  type SmPostMetric,
  type SmPlatform,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_COLORS,
  CONTENT_TYPE_LABELS,
} from '@/types/social-media';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AccountDetailProps {
  accountId: string;
  institutionId: string;
}

export function AccountDetail({ accountId, institutionId }: AccountDetailProps) {
  const [account, setAccount] = useState<SmAccount | null>(null);
  const [snapshots, setSnapshots] = useState<SmSnapshot[]>([]);
  const [posts, setPosts] = useState<SmPostMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch account, snapshots, and posts in parallel
        const [accRes, snapRes, postsRes] = await Promise.all([
          fetch(`/api/social-media/accounts/${encodeURIComponent(accountId)}`),
          fetch(`/api/social-media/accounts/${encodeURIComponent(accountId)}/snapshots?limit=30`),
          fetch(`/api/social-media/accounts/${encodeURIComponent(accountId)}/posts?limit=20`),
        ]);

        if (!accRes.ok) throw new Error('Failed to load account');

        const acc = await accRes.json();
        setAccount(acc);

        if (snapRes.ok) {
          const snapData = await snapRes.json();
          setSnapshots(snapData.data || []);
        }

        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(postsData.data || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [accountId, institutionId]);

  const latestSnapshot = snapshots[0];

  const chartData = useMemo(() => {
    const now = Date.now();
    const periodMs: Record<string, number> = {
      '7d': 7 * 86400000,
      '30d': 30 * 86400000,
      '90d': 90 * 86400000,
    };
    const filtered = chartPeriod === 'all'
      ? posts
      : posts.filter(p => p.posted_at && now - new Date(p.posted_at).getTime() <= periodMs[chartPeriod]);
    return filtered
      .filter(p => p.posted_at)
      .sort((a, b) => new Date(a.posted_at!).getTime() - new Date(b.posted_at!).getTime())
      .map(p => ({
        date: new Date(p.posted_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        likes: p.likes_count,
        comments: p.comments_count,
      }));
  }, [posts, chartPeriod]);

  const healthBreakdown = useMemo(() => {
    if (!account) return { activity: 0, engagement: 0, growth: 0, profile: 0, total: 0 };
    return computeHealthBreakdown(account, latestSnapshot);
  }, [account, latestSnapshot]);

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="mt-4 text-center text-red-500">
        {error || 'Account not found'}
      </div>
    );
  }

  const healthColor = HEALTH_STATUS_COLORS[account.health_status];

  return (
    <div className="space-y-6 mt-4">
      {/* Back button + Header */}
      <div className="flex items-start gap-4">
        <Link href="/social-media/accounts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <PlatformAvatar platform={account.platform} />
            <div>
              <h1 className="text-xl font-bold">@{account.username}</h1>
              <p className="text-sm text-muted-foreground">
                {account.display_name || PLATFORM_LABELS[account.platform]}
              </p>
            </div>
            <Badge
              className="ml-auto"
              style={{ backgroundColor: healthColor, color: 'white' }}
            >
              {HEALTH_STATUS_LABELS[account.health_status]}
            </Badge>
          </div>
        </div>
        {account.profile_url && (
          <a href={account.profile_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Profile
            </Button>
          </a>
        )}
      </div>

      {/* Stats Cards */}
      {latestSnapshot ? (
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Followers" value={formatNum(latestSnapshot.followers_count)} />
          <StatCard label="Following" value={formatNum(latestSnapshot.following_count)} />
          <StatCard label="Posts" value={formatNum(latestSnapshot.posts_count)} />
          <StatCard
            label="Engagement Rate"
            value={`${(Number(latestSnapshot.engagement_rate) * 100).toFixed(2)}%`}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No snapshot data yet. Monitoring will collect data on the next run.
          </CardContent>
        </Card>
      )}

      {/* Engagement Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Engagement Over Time</CardTitle>
              <div className="flex gap-1">
                {(['7d', '30d', '90d', 'all'] as const).map(period => (
                  <Button
                    key={period}
                    variant={chartPeriod === period ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => setChartPeriod(period)}
                  >
                    {period === 'all' ? 'All' : period}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="likes" stackId="1" stroke="#E1306C" fill="#E1306C" fillOpacity={0.3} name="Likes" />
                <Area type="monotone" dataKey="comments" stackId="1" stroke="#6366F1" fill="#6366F1" fillOpacity={0.3} name="Comments" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Health Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Health Score Breakdown</CardTitle>
          <CardDescription>Score: {account.health_score}/100</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <HealthBar label="Activity" value={healthBreakdown.activity} max={30} />
          <HealthBar label="Engagement" value={healthBreakdown.engagement} max={30} />
          <HealthBar label="Growth" value={healthBreakdown.growth} max={20} />
          <HealthBar label="Profile" value={healthBreakdown.profile} max={20} />
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <InfoRow label="Platform" value={PLATFORM_LABELS[account.platform]} />
            <InfoRow label="Account Type" value={account.account_type || 'Not set'} />
            <InfoRow label="Health Score" value={`${account.health_score}/100`} />
            <InfoRow label="Connected" value={account.is_connected ? 'Yes (API)' : 'No'} />
            <InfoRow
              label="Last Post"
              value={
                account.last_post_at
                  ? `${new Date(account.last_post_at).toLocaleDateString()} (${Math.floor((Date.now() - new Date(account.last_post_at).getTime()) / 86400000)} days ago)`
                  : 'Unknown'
              }
            />
            <InfoRow
              label="Last Snapshot"
              value={account.last_snapshot_at ? new Date(account.last_snapshot_at).toLocaleDateString() : 'Never'}
            />
          </div>
          {account.bio && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-1">Bio</p>
              <p className="text-sm">{account.bio}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snapshot History */}
      {snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshot History</CardTitle>
            <CardDescription>Recent data collection points</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-right py-2 px-2">Followers</th>
                    <th className="text-right py-2 px-2">Growth</th>
                    <th className="text-right py-2 px-2">Posts</th>
                    <th className="text-right py-2 px-2">Engagement</th>
                    <th className="text-right py-2 px-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(snap => (
                    <tr key={snap.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{snap.snapshot_date}</td>
                      <td className="text-right py-2 px-2">{formatNum(snap.followers_count)}</td>
                      <td className="text-right py-2 px-2">
                        <span className={(snap.follower_growth ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {(snap.follower_growth ?? 0) >= 0 ? '+' : ''}{snap.follower_growth ?? 0}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">{snap.posts_count}</td>
                      <td className="text-right py-2 px-2">
                        {(Number(snap.engagement_rate) * 100).toFixed(2)}%
                      </td>
                      <td className="text-right py-2 px-2">
                        <Badge variant="outline" className="text-[10px]">
                          {snap.source === 'auto_api' ? 'API' : 'Manual'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Posts */}
      {posts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Posts</CardTitle>
            <CardDescription>Performance metrics for individual posts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg border">
                  {post.thumbnail_url && (
                    <img
                      src={post.thumbnail_url}
                      alt=""
                      className="h-16 w-16 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{post.caption || 'No caption'}</p>
                    {post.post_type && (
                      <Badge variant="outline" className="text-[10px] mt-1">
                        {CONTENT_TYPE_LABELS[post.post_type] || post.post_type}
                      </Badge>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{post.likes_count} likes</span>
                      <span>{post.comments_count} comments</span>
                      {post.views_count > 0 && <span>{formatNum(post.views_count)} views</span>}
                      <span>ER: {(Number(post.engagement_rate) * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
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
    </div>
  );
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function PlatformAvatar({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform as SmPlatform] || '#6B7280';

  switch (platform) {
    case 'instagram':
      return (
        <div className="h-12 w-12 rounded-full flex items-center justify-center bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
          <Instagram className="h-6 w-6 text-white" />
        </div>
      );
    case 'youtube':
      return (
        <div className="h-12 w-12 rounded-full flex items-center justify-center bg-red-600">
          <Youtube className="h-6 w-6 text-white" />
        </div>
      );
    default:
      return (
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: color }}
        >
          {platform.charAt(0).toUpperCase()}
        </div>
      );
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function HealthBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function computeHealthBreakdown(
  account: SmAccount,
  snapshot: SmSnapshot | undefined
): { activity: number; engagement: number; growth: number; profile: number; total: number } {
  let activity = 0;
  let engagement = 0;
  let growth = 0;
  let profile = 0;

  // Activity: out of 30 (posting recency 20 + consistency 10)
  if (account.last_post_at) {
    const days = Math.floor((Date.now() - new Date(account.last_post_at).getTime()) / 86400000);
    if (days <= 3) activity += 20;
    else if (days <= 7) activity += 15;
    else if (days <= 14) activity += 8;
    else if (days <= 30) activity += 3;
  }
  if (snapshot) {
    if (snapshot.posts_last_30_days >= 12) activity += 10;
    else if (snapshot.posts_last_30_days >= 8) activity += 7;
    else if (snapshot.posts_last_30_days >= 4) activity += 4;
  }

  // Engagement: out of 30
  if (snapshot) {
    const rate = Number(snapshot.engagement_rate);
    if (rate >= 0.06) engagement = 30;
    else if (rate >= 0.03) engagement = 22;
    else if (rate >= 0.01) engagement = 15;
    else if (rate > 0) engagement = 5;
  }

  // Growth: out of 20
  if (snapshot) {
    const pct = Number(snapshot.follower_growth_pct);
    if (pct > 5) growth = 20;
    else if (pct > 2) growth = 14;
    else if (pct > 0) growth = 7;
  }

  // Profile: out of 20 (completeness)
  if (account.display_name) profile += 4;
  if (account.bio) profile += 5;
  if (account.profile_url) profile += 4;
  if (account.website_url) profile += 3;
  if (account.is_verified) profile += 4;

  return { activity, engagement, growth, profile, total: activity + engagement + growth + profile };
}
