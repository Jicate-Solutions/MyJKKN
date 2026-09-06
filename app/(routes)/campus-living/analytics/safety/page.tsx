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
import { Shield, AlertTriangle, ClipboardCheck, TrendingUp, Loader2 } from 'lucide-react';
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
import { useIncidentAnalytics } from '@/hooks/campus-living/use-campus-living-analytics';
import { PreviewBanner } from '../../_components/preview-banner';

function periodToDateRange(period: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (period === '30d') from.setDate(to.getDate() - 30);
  else if (period === '1y') from.setDate(to.getDate() - 365);
  else from.setDate(to.getDate() - 90);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(220 70% 50%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(0 70% 55%)',
];

export default function SafetyAnalyticsPage() {
  const [period, setPeriod] = useState('90d');
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  const { from, to } = useMemo(() => periodToDateRange(period), [period]);
  const { data: incidents, isLoading, error } = useIncidentAnalytics(institutionId, from, to);

  const typeData = useMemo(() => {
    if (!incidents?.by_type) return [];
    return Object.entries(incidents.by_type).map(([name, value]) => ({
      name,
      value: value as number,
    }));
  }, [incidents]);

  const severityData = useMemo(() => {
    if (!incidents?.by_severity) return [];
    return [
      { severity: 'Critical', count: incidents.by_severity.critical },
      { severity: 'Major', count: incidents.by_severity.major },
      { severity: 'Moderate', count: incidents.by_severity.moderate },
      { severity: 'Minor', count: incidents.by_severity.minor },
    ];
  }, [incidents]);

  // permsLoading: the query stays disabled until the viewer's scope resolves, and
  // a disabled query reports isLoading:false (BUG-005831 — see useCampusLivingScope).
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Safety Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Safety Analytics">
        <div className="p-6 text-sm text-destructive">
          Failed to load incident analytics: {(error as Error).message}
        </div>
      </ContentLayout>
    );
  }

  const total = incidents?.total ?? 0;
  const open = incidents?.open_incidents ?? 0;
  const resolved = total - open;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;
  const criticalMajor =
    (incidents?.by_severity.critical ?? 0) + (incidents?.by_severity.major ?? 0);
  // Composite "safety score" — soft heuristic, surfaced as informational
  const safetyScore = Math.max(0, 100 - criticalMajor * 5 - open * 2);

  return (
    <ContentLayout title="Safety Analytics">
      <div className="space-y-6">
        <PreviewBanner
          feature="safety analytics"
          note="Incident totals, severity, type breakdown and resolution rate are now live via useIncidentAnalytics. Composite safety score is a soft heuristic; inspection score history stays a placeholder pending an inspections aggregation."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Score Trends</h1>
            <p className="text-muted-foreground">Incident trends, severity breakdown, and resolution rates</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last Quarter</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Safety Score</CardTitle><Shield className={`h-4 w-4 ${safetyScore >= 80 ? 'text-green-600' : 'text-amber-600'}`} /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${safetyScore >= 80 ? 'text-green-600' : safetyScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {safetyScore}%
              </div>
              <p className="text-xs text-muted-foreground">heuristic</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Incidents</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
              <p className="text-xs text-muted-foreground">in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Open Incidents</CardTitle><ClipboardCheck className={`h-4 w-4 ${open === 0 ? 'text-green-600' : 'text-amber-600'}`} /></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${open === 0 ? 'text-green-600' : open > 5 ? 'text-red-600' : 'text-amber-600'}`}>{open}</div>
              <p className="text-xs text-muted-foreground">unresolved</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Resolution Rate</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resolutionRate}%</div>
              <p className="text-xs text-muted-foreground">{resolved} of {total} closed</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Severity Distribution</CardTitle></CardHeader>
          <CardContent>
            {total === 0 ? (
              <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No incidents recorded in this period.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={severityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="severity" className="text-xs" />
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
            <CardHeader><CardTitle>Incidents by Type</CardTitle></CardHeader>
            <CardContent>
              {typeData.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">No type data.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {typeData.map((_, i) => (
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
            <CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader>
            <CardContent>
              {!incidents?.by_status || Object.keys(incidents.by_status).length === 0 ? (
                <div className="h-[250px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                  <p className="text-muted-foreground">No status data.</p>
                </div>
              ) : (
                <div className="space-y-3 pt-4">
                  {Object.entries(incidents.by_status).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <span className="text-sm capitalize">{status.replace(/_/g, ' ')}</span>
                      <span className="font-semibold">{count as number}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Inspection Scores History</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-sm">
                Inspection-score history requires a separate inspections aggregation (queued).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
