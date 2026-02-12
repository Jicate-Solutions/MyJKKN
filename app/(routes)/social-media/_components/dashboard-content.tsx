'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Share2,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Instagram,
  Youtube,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_COLORS,
  type SmDashboardOverview,
  type SmHealthStatus,
  type SmPlatform,
  type SmAccount,
  type SmSnapshot,
} from '@/types/social-media';


// ─── Types ──────────────────────────────────────────────────────────────────

type PeriodFilter = '7d' | '30d' | '90d';
type SortField = 'account' | 'posts' | 'avgLikes' | 'engagementRate';
type SortDir = 'asc' | 'desc';

interface DashboardContentProps {
  institutionId: string;
}


// ─── Constants ──────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<PeriodFilter, number> = { '7d': 7, '30d': 30, '90d': 90 };
const CHART_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];


// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}


// ─── Main Component ─────────────────────────────────────────────────────────

export function DashboardContent({ institutionId }: DashboardContentProps) {
  const [data, setData] = useState<SmDashboardOverview | null>(null);
  const [accounts, setAccounts] = useState<SmAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Sort state for engagement table
  const [sortField, setSortField] = useState<SortField>('engagementRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    async function fetchData() {
      try {
        const [dashRes, accRes] = await Promise.all([
          fetch(`/api/social-media/dashboard?institution_id=${encodeURIComponent(institutionId)}`),
          fetch(`/api/social-media/accounts?institution_id=${encodeURIComponent(institutionId)}&limit=100`),
        ]);
        if (!dashRes.ok) throw new Error('Failed to load dashboard');
        const dashJson = await dashRes.json();
        setData(dashJson);

        if (accRes.ok) {
          const accJson = await accRes.json();
          setAccounts(accJson.data || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [institutionId]);


  // ─── Derived / Filtered Data ──────────────────────────────────────────────

  const cutoffDate = useMemo(() => daysAgo(PERIOD_DAYS[period]), [period]);

  const filteredSnapshots = useMemo(() => {
    if (!data) return [];
    return data.recentSnapshots.filter(s => new Date(s.snapshot_date) >= cutoffDate);
  }, [data, cutoffDate]);

  const filteredAccounts = useMemo(() => {
    if (platformFilter === 'all') return accounts;
    return accounts.filter(a => a.platform === platformFilter);
  }, [accounts, platformFilter]);

  const filteredAccountIds = useMemo(
    () => new Set(filteredAccounts.map(a => a.id)),
    [filteredAccounts],
  );

  // Snapshots filtered by both period and platform
  const activeSnapshots = useMemo(() => {
    if (platformFilter === 'all') return filteredSnapshots;
    return filteredSnapshots.filter(s => filteredAccountIds.has(s.account_id));
  }, [filteredSnapshots, platformFilter, filteredAccountIds]);

  // Account lookup
  const accountMap = useMemo(() => {
    const m = new Map<string, SmAccount>();
    accounts.forEach(a => m.set(a.id, a));
    return m;
  }, [accounts]);


  // ─── Engagement Table Data ────────────────────────────────────────────────

  const heatmapRows = useMemo(() => {
    const grouped = new Map<string, { posts: number; totalLikes: number; totalEngagement: number; count: number }>();

    activeSnapshots.forEach(s => {
      const existing = grouped.get(s.account_id) || { posts: 0, totalLikes: 0, totalEngagement: 0, count: 0 };
      existing.posts += s.posts_count || 0;
      existing.totalLikes += s.total_likes || 0;
      existing.totalEngagement += Number(s.engagement_rate) || 0;
      existing.count += 1;
      grouped.set(s.account_id, existing);
    });

    const rows = Array.from(grouped.entries()).map(([accountId, agg]) => {
      const account = accountMap.get(accountId);
      return {
        accountId,
        account: account ? `@${account.username}` : accountId.slice(0, 8),
        platform: account?.platform || ('unknown' as string),
        posts: agg.posts,
        avgLikes: agg.count > 0 ? Math.round(agg.totalLikes / agg.count) : 0,
        engagementRate: agg.count > 0 ? agg.totalEngagement / agg.count : 0,
      };
    });

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'account': cmp = a.account.localeCompare(b.account); break;
        case 'posts': cmp = a.posts - b.posts; break;
        case 'avgLikes': cmp = a.avgLikes - b.avgLikes; break;
        case 'engagementRate': cmp = a.engagementRate - b.engagementRate; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [activeSnapshots, accountMap, sortField, sortDir]);


  // ─── Follower Growth Chart Data ───────────────────────────────────────────

  const chartData = useMemo(() => {
    if (activeSnapshots.length === 0) return [];

    // Find top accounts by latest follower count
    const latestByAccount = new Map<string, SmSnapshot>();
    activeSnapshots.forEach(s => {
      const existing = latestByAccount.get(s.account_id);
      if (!existing || new Date(s.snapshot_date) > new Date(existing.snapshot_date)) {
        latestByAccount.set(s.account_id, s);
      }
    });

    const topAccountIds = Array.from(latestByAccount.entries())
      .sort((a, b) => (b[1].followers_count || 0) - (a[1].followers_count || 0))
      .slice(0, 8)
      .map(([id]) => id);

    // Group by date
    const dateMap = new Map<string, Record<string, number>>();
    activeSnapshots
      .filter(s => topAccountIds.includes(s.account_id))
      .forEach(s => {
        const date = s.snapshot_date.split('T')[0];
        const entry = dateMap.get(date) || {};
        entry[s.account_id] = s.followers_count || 0;
        dateMap.set(date, entry);
      });

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [activeSnapshots]);

  const chartAccountIds = useMemo(() => {
    if (chartData.length === 0) return [];
    const keys = new Set<string>();
    chartData.forEach(d => {
      Object.keys(d).forEach(k => { if (k !== 'date') keys.add(k); });
    });
    return Array.from(keys);
  }, [chartData]);

  // Available platforms for filter
  const availablePlatforms = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.platformBreakdown).filter(
      p => data.platformBreakdown[p as SmPlatform] > 0,
    );
  }, [data]);


  // ─── Sort handler ─────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }


  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return null; // Server skeleton handles loading state
  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!data) return null;

  const healthTotal = Object.values(data.healthBreakdown).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* ── Filters Bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {(['7d', '30d', '90d'] as PeriodFilter[]).map(p => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>

        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {availablePlatforms.map(p => (
              <SelectItem key={p} value={p}>
                {PLATFORM_LABELS[p as SmPlatform] || p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Accounts"
          value={data.totalAccounts}
          description={`${data.connectedAccounts} connected via API`}
          icon={<Share2 className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsCard
          title="Healthy"
          value={data.healthBreakdown.green}
          description="Active & posting regularly"
          icon={<ShieldCheck className="h-4 w-4 text-green-500" />}
          valueClassName="text-green-600"
        />
        <StatsCard
          title="Warning"
          value={data.healthBreakdown.yellow}
          description="Needs attention soon"
          icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
          valueClassName="text-yellow-600"
          alert={data.healthBreakdown.yellow > 0}
        />
        <StatsCard
          title="Critical"
          value={data.healthBreakdown.red + data.healthBreakdown.dormant}
          description={`${data.healthBreakdown.red} critical, ${data.healthBreakdown.dormant} dormant`}
          icon={<AlertCircle className="h-4 w-4 text-red-500" />}
          valueClassName="text-red-600"
          alert={data.healthBreakdown.red + data.healthBreakdown.dormant > 0}
        />
      </div>

      {/* ── Engagement Table ─────────────────────────────────────────────── */}
      {heatmapRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Engagement</CardTitle>
            <CardDescription>
              Performance metrics per account ({period} window)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <SortableHeader label="Account" field="account" current={sortField} dir={sortDir} onClick={handleSort} />
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">Platform</th>
                    <SortableHeader label="Posts" field="posts" current={sortField} dir={sortDir} onClick={handleSort} className="text-right" />
                    <SortableHeader label="Avg Likes" field="avgLikes" current={sortField} dir={sortDir} onClick={handleSort} className="text-right" />
                    <SortableHeader label="Engagement Rate" field="engagementRate" current={sortField} dir={sortDir} onClick={handleSort} className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {heatmapRows.map(row => (
                    <tr key={row.accountId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-3 py-2 font-medium">{row.account}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {PLATFORM_LABELS[row.platform as SmPlatform] || row.platform}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.posts)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.avgLikes)}</td>
                      <td className="px-3 py-2 text-right">
                        <EngagementBadge rate={row.engagementRate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Follower Growth Chart ────────────────────────────────────────── */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follower Growth</CardTitle>
            <CardDescription>
              Follower trends for top accounts ({period} window)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) => formatNumber(v)}
                  />
                  <Tooltip
                    labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                    formatter={(value: number, name: string) => {
                      const acc = accountMap.get(name);
                      return [formatNumber(value), acc ? `@${acc.username}` : name.slice(0, 8)];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const acc = accountMap.get(value);
                      return acc ? `@${acc.username}` : value.slice(0, 8);
                    }}
                  />
                  {chartAccountIds.map((id, i) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Health Overview & Platform Breakdown ─────────────────────────── */}
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

      {/* ── Top Posts ────────────────────────────────────────────────────── */}
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

      {/* ── Empty state ──────────────────────────────────────────────────── */}
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
  valueClassName,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  alert?: boolean;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className={`text-2xl font-bold ${valueClassName || ''}`}>{value}</div>
          {alert && <AlertCircle className="h-4 w-4 text-red-500" />}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function SortableHeader({
  label,
  field,
  current,
  dir,
  onClick,
  className = '',
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
  className?: string;
}) {
  const isActive = current === field;
  return (
    <th className={`px-3 py-2 font-medium text-muted-foreground ${className}`}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onClick(field)}
      >
        {label}
        {isActive ? (
          dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function EngagementBadge({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(2);
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
  if (rate >= 0.05) variant = 'default';
  else if (rate < 0.01) variant = 'destructive';
  return <Badge variant={variant} className="text-xs tabular-nums">{pct}%</Badge>;
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
