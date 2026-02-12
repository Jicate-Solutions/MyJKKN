'use client';

import { useEffect, useState } from 'react';
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
  const latestSnapshot = snapshots[0];

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
              value={account.last_post_at ? new Date(account.last_post_at).toLocaleDateString() : 'Unknown'}
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
                        <span className={snap.follower_growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {snap.follower_growth >= 0 ? '+' : ''}{snap.follower_growth}
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
