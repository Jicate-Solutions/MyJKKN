'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Download, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  type SmDashboardOverview,
  type SmAccount,
  type SmSnapshot,
  HEALTH_STATUS_COLORS,
} from '@/types/social-media';

type Period = '7d' | '30d' | '90d' | 'all';

interface AnalyticsContentProps {
  institutionId: string;
}

interface WeeklyTrend {
  week: string;
  avgEngagementRate: number;
}

interface DepartmentScore {
  department_id: string;
  department_name: string;
  healthScore: number;
  followers: number;
  engagementRate: number;
  accountCount: number;
}

export function AnalyticsContent({ institutionId }: AnalyticsContentProps) {
  const [period, setPeriod] = useState<Period>('30d');
  const [dashboard, setDashboard] = useState<SmDashboardOverview | null>(null);
  const [accounts, setAccounts] = useState<SmAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [dashRes, accRes] = await Promise.all([
          fetch(`/api/social-media/dashboard?institution_id=${encodeURIComponent(institutionId)}`),
          fetch(`/api/social-media/accounts?institution_id=${encodeURIComponent(institutionId)}&limit=100`),
        ]);
        if (!dashRes.ok) throw new Error('Failed to load dashboard data');
        if (!accRes.ok) throw new Error('Failed to load accounts data');

        const dashJson = await dashRes.json();
        const accJson = await accRes.json();

        setDashboard(dashJson);
        setAccounts(accJson.data || accJson || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [institutionId]);

  // Filter snapshots by period
  const filteredSnapshots = useMemo(() => {
    if (!dashboard?.recentSnapshots) return [];
    if (period === 'all') return dashboard.recentSnapshots;

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return dashboard.recentSnapshots.filter(
      (s) => new Date(s.snapshot_date) >= cutoff
    );
  }, [dashboard, period]);

  // Compute weekly engagement trend from snapshots
  const engagementTrend = useMemo((): WeeklyTrend[] => {
    if (filteredSnapshots.length === 0) return [];

    const weekMap = new Map<string, { total: number; count: number }>();

    filteredSnapshots.forEach((s: SmSnapshot) => {
      const d = new Date(s.snapshot_date);
      // Get ISO week start (Monday)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      const weekKey = weekStart.toISOString().slice(0, 10);

      const existing = weekMap.get(weekKey) || { total: 0, count: 0 };
      existing.total += Number(s.engagement_rate) || 0;
      existing.count += 1;
      weekMap.set(weekKey, existing);
    });

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, { total, count }]) => ({
        week: formatWeekLabel(week),
        avgEngagementRate: count > 0 ? (total / count) * 100 : 0,
      }));
  }, [filteredSnapshots]);

  // Compute department scores from accounts
  const departmentScores = useMemo((): DepartmentScore[] => {
    if (accounts.length === 0) return [];

    const deptMap = new Map<string, {
      totalScore: number;
      totalFollowers: number;
      totalEngagement: number;
      engagementCount: number;
      count: number;
    }>();

    accounts.forEach((acc) => {
      const deptId = acc.department_id || 'unassigned';
      const existing = deptMap.get(deptId) || {
        totalScore: 0, totalFollowers: 0, totalEngagement: 0,
        engagementCount: 0, count: 0,
      };
      existing.totalScore += acc.health_score || 0;
      existing.count += 1;
      deptMap.set(deptId, existing);
    });

    // Enrich with snapshot data if available
    if (dashboard?.recentSnapshots) {
      const latestByAccount = new Map<string, SmSnapshot>();
      dashboard.recentSnapshots.forEach((s: SmSnapshot) => {
        if (!latestByAccount.has(s.account_id)) {
          latestByAccount.set(s.account_id, s);
        }
      });

      accounts.forEach((acc) => {
        const snap = latestByAccount.get(acc.id);
        if (snap) {
          const deptId = acc.department_id || 'unassigned';
          const existing = deptMap.get(deptId);
          if (existing) {
            existing.totalFollowers += snap.followers_count || 0;
            if (snap.engagement_rate > 0) {
              existing.totalEngagement += Number(snap.engagement_rate);
              existing.engagementCount += 1;
            }
          }
        }
      });
    }

    return Array.from(deptMap.entries())
      .map(([deptId, data]) => ({
        department_id: deptId,
        department_name: deptId === 'unassigned' ? 'Unassigned' : truncateId(deptId),
        healthScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
        followers: data.totalFollowers,
        engagementRate: data.engagementCount > 0
          ? data.totalEngagement / data.engagementCount
          : 0,
        accountCount: data.count,
      }))
      .sort((a, b) => b.healthScore - a.healthScore);
  }, [accounts, dashboard]);

  // CSV export
  const handleExportCSV = useCallback(() => {
    if (departmentScores.length === 0) return;

    const headers = ['Rank', 'Department', 'Health Score', 'Engagement Rate (%)', 'Followers', 'Accounts'];
    const rows = departmentScores.map((dept, i) => [
      i + 1,
      dept.department_name,
      dept.healthScore,
      (dept.engagementRate * 100).toFixed(2),
      dept.followers,
      dept.accountCount,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-leaderboard-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [departmentScores, period]);

  if (loading) return null; // Server skeleton handles this
  if (error) return <div className="text-red-500">Error: {error}</div>;

  // Empty state
  if (!dashboard || (accounts.length === 0 && !dashboard.totalAccounts)) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-semibold">No analytics data available</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Add social media accounts and collect snapshots to see analytics here.
              Data will populate once monitoring is active.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const BAR_COLORS = ['#22C55E', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-2">
        {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === 'all' ? 'All Time' : p}
          </Button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Engagement Trend Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Trend</CardTitle>
            <CardDescription>
              Weekly average engagement rate across all accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {engagementTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={engagementTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'Avg Engagement']}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgEngagementRate"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No snapshot data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Comparison Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department Comparison</CardTitle>
            <CardDescription>
              Average health score by department
            </CardDescription>
          </CardHeader>
          <CardContent>
            {departmentScores.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={departmentScores.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="department_name"
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, 'Health Score']}
                  />
                  <Bar dataKey="healthScore" radius={[0, 4, 4, 0]}>
                    {departmentScores.slice(0, 10).map((_, index) => (
                      <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No department data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Department Leaderboard</CardTitle>
            <CardDescription>
              Departments ranked by average health score
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={departmentScores.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {departmentScores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Rank</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Department</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Health Score</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Engagement Rate</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground text-right">Followers</th>
                    <th className="pb-3 font-medium text-muted-foreground text-center">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentScores.map((dept, i) => (
                    <tr key={dept.department_id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-bold text-muted-foreground">#{i + 1}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{dept.department_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {dept.accountCount} {dept.accountCount === 1 ? 'account' : 'accounts'}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: getScoreColor(dept.healthScore),
                            color: getScoreColor(dept.healthScore),
                          }}
                        >
                          {dept.healthScore}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {dept.engagementRate > 0
                          ? `${(dept.engagementRate * 100).toFixed(2)}%`
                          : '--'}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {formatNumber(dept.followers)}
                      </td>
                      <td className="py-3 text-center">
                        <TrendIndicator score={dept.healthScore} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[100px] text-muted-foreground text-sm">
              No department data to display
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ─── Helper Components ───────────────────────────────────────────────────────

function TrendIndicator({ score }: { score: number }) {
  if (score >= 70) {
    return <TrendingUp className="h-4 w-4 text-green-500 mx-auto" />;
  }
  if (score >= 40) {
    return <Minus className="h-4 w-4 text-yellow-500 mx-auto" />;
  }
  return <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />;
}


// ─── Helper Functions ────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 70) return HEALTH_STATUS_COLORS.green;
  if (score >= 40) return HEALTH_STATUS_COLORS.yellow;
  return HEALTH_STATUS_COLORS.red;
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncateId(id: string): string {
  // Show first 8 chars of UUID for department display
  if (id.length > 12) return id.slice(0, 8) + '...';
  return id;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
