'use client';

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Moon, Sun, Clock, Loader2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAttendanceTrend } from '@/hooks/campus-living/use-campus-living-analytics';
import { PreviewBanner } from '../../_components/preview-banner';

function periodToDateRange(period: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === '7d') from.setDate(to.getDate() - 7);
  else if (period === '90d') from.setDate(to.getDate() - 90);
  else from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function AttendanceAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  const { from, to } = useMemo(() => periodToDateRange(period), [period]);
  const { data: trend, isLoading, error } = useAttendanceTrend(institutionId, from, to);

  const summary = useMemo(() => {
    const rows = trend ?? [];
    if (rows.length === 0) {
      return {
        latestPct: 0,
        latestPresent: 0,
        latestTotal: 0,
        avgPct: 0,
        weekendPct: 0,
        curfewViolations: 0,
      };
    }
    const latest = rows[rows.length - 1];
    const totalPct = rows.reduce((s, r) => s + r.attendance_percentage, 0);
    const avgPct = Math.round(totalPct / rows.length);
    const weekendRows = rows.filter((r) => {
      const day = new Date(r.date).getUTCDay();
      return day === 0 || day === 6;
    });
    const weekendPct =
      weekendRows.length > 0
        ? Math.round(weekendRows.reduce((s, r) => s + r.attendance_percentage, 0) / weekendRows.length)
        : 0;
    const curfewViolations = rows.reduce((s, r) => s + r.curfew_violations, 0);
    return {
      latestPct: latest.attendance_percentage,
      latestPresent: latest.present,
      latestTotal: latest.total,
      avgPct,
      weekendPct,
      curfewViolations,
    };
  }, [trend]);

  // permsLoading: the query stays disabled until the viewer's scope resolves, and
  // a disabled query reports isLoading:false (BUG-005831 — see useCampusLivingScope).
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Attendance Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Attendance Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load attendance trend: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const chartData = (trend ?? []).map((r) => ({
    date: r.date.slice(5), // MM-DD
    Attendance: r.attendance_percentage,
    Present: r.present,
    Absent: r.absent,
  }));

  return (
    <ContentLayout title="Attendance Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="attendance analytics"
          note="Daily attendance trend and curfew violations are now live. Weekday-vs-weekend, check-in-time histogram, and block heatmap remain placeholders pending dedicated aggregations."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Attendance Pattern Analysis</h1>
            <p className="text-muted-foreground">Hostel check-in/out patterns and curfew compliance</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Latest Day</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.latestPct >= 85 ? 'text-green-600' : summary.latestPct >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                {summary.latestPct}%
              </div>
              <p className="text-xs text-muted-foreground">{summary.latestPresent} / {summary.latestTotal}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Period Average</CardTitle><Moon className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.avgPct}%</div>
              <p className="text-xs text-muted-foreground">Across {(trend ?? []).length} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Weekend Avg</CardTitle><Sun className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.weekendPct}%</div>
              <p className="text-xs text-muted-foreground">Sat-Sun only</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Curfew Violations</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.curfewViolations === 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                {summary.curfewViolations}
              </div>
              <p className="text-xs text-muted-foreground">in period</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Daily Attendance Trend</CardTitle></CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No attendance records found in this period.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Attendance" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Weekday vs Weekend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-sm">
                  Block-level weekday-vs-weekend split needs a per-block aggregation (future work).
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Check-in Time Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-sm">
                  Check-in-time histogram requires raw attendance timestamps (column not currently selected).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Block-wise Attendance Heatmap</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-sm">
                Block × day-of-week heatmap is queued behind a per-block aggregation in the analytics service.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
