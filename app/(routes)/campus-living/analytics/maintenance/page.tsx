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
import { Wrench, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useMaintenanceAnalytics } from '@/hooks/campus-living/use-campus-living-analytics';
import { PreviewBanner } from '../../_components/preview-banner';

function periodToDateRange(period: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === '7d') from.setDate(to.getDate() - 7);
  else if (period === '90d') from.setDate(to.getDate() - 90);
  else from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 220 70% 50%))',
  'hsl(var(--chart-3, 142 71% 45%))',
  'hsl(var(--chart-4, 38 92% 50%))',
  'hsl(var(--chart-5, 280 65% 60%))',
];

export default function MaintenanceAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  const { from, to } = useMemo(() => periodToDateRange(period), [period]);
  const { data: maintenance, isLoading, error } = useMaintenanceAnalytics(institutionId, from, to);

  const categoryData = useMemo(() => {
    if (!maintenance?.by_category) return [];
    return Object.entries(maintenance.by_category).map(([name, value]) => ({
      name,
      value: value as number,
    }));
  }, [maintenance]);

  const priorityData = useMemo(() => {
    if (!maintenance?.by_priority) return [];
    return [
      { priority: 'Critical', count: maintenance.by_priority.critical },
      { priority: 'High', count: maintenance.by_priority.high },
      { priority: 'Medium', count: maintenance.by_priority.medium },
      { priority: 'Low', count: maintenance.by_priority.low },
    ];
  }, [maintenance]);

  // permsLoading: the query stays disabled until the viewer's scope resolves, and
  // a disabled query reports isLoading:false (BUG-005831 — see useCampusLivingScope).
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Maintenance Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Maintenance Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load maintenance analytics: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const total = maintenance?.total ?? 0;
  const slaCompliance = maintenance?.sla_compliance.compliance_percentage ?? 100;
  const slaBreached = maintenance?.sla_compliance.breached ?? 0;
  const avgResolutionHours = maintenance?.average_resolution_hours ?? 0;

  return (
    <ContentLayout title="Maintenance Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="maintenance analytics"
          note="Request totals, SLA compliance, category and priority breakdowns are now live. Block-wise distribution stays a placeholder pending a block_id join."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Maintenance SLA Performance</h1>
            <p className="text-muted-foreground">Resolution times, SLA compliance, and category analysis</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last Quarter</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Requests</CardTitle><Wrench className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
              <p className="text-xs text-muted-foreground">in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Avg Resolution</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgResolutionHours}h</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">SLA Compliance</CardTitle><CheckCircle2 className={`h-4 w-4 ${slaCompliance >= 90 ? 'text-green-600' : 'text-amber-600'}`} /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${slaCompliance >= 90 ? 'text-green-600' : 'text-amber-600'}`}>{slaCompliance}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">SLA Breaches</CardTitle><AlertTriangle className={`h-4 w-4 ${slaBreached > 0 ? 'text-red-600' : 'text-muted-foreground'}`} /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${slaBreached > 0 ? 'text-red-600' : 'text-green-600'}`}>{slaBreached}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Requests by Priority</CardTitle></CardHeader>
          <CardContent>
            {total === 0 ? (
              <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No maintenance requests in this period.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={priorityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="priority" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Requests by Category</CardTitle></CardHeader>
            <CardContent>
              {categoryData.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">No category data.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--popover-foreground))',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Block-wise Requests</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground text-sm">
                  Block-wise breakdown requires a block_id grouping in getMaintenanceAnalytics — queued.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>SLA Compliance Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                <p className="text-xs text-muted-foreground">On Track</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {maintenance?.sla_compliance.on_track ?? 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <p className="text-xs text-muted-foreground">At Risk</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  {maintenance?.sla_compliance.at_risk ?? 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
                <p className="text-xs text-muted-foreground">Breached</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {maintenance?.sla_compliance.breached ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
