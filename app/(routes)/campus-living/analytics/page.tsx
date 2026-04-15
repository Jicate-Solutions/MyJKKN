'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useOccupancyAnalytics, useMaintenanceAnalytics, useIncidentAnalytics } from '@/hooks/campus-living/use-campus-living-analytics';
import { useCampusLivingOverview } from '@/hooks/campus-living/use-campus-living-dashboard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Building2,
  Users,
  UtensilsCrossed,
  Wrench,
  Shield,
  IndianRupee,
  Activity,
  Bell,
  Settings,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Loader2,
} from 'lucide-react';

export default function AnalyticsDashboardPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const { data: overview, isLoading: overviewLoading } = useCampusLivingOverview(institutionId);
  const { data: occupancy, isLoading: occupancyLoading } = useOccupancyAnalytics(institutionId);
  const { data: maintenance, isLoading: maintenanceLoading } = useMaintenanceAnalytics(institutionId);
  const { data: incidents, isLoading: incidentsLoading } = useIncidentAnalytics(institutionId);

  const isLoading = overviewLoading || occupancyLoading || maintenanceLoading || incidentsLoading;

  // Build metrics from real data
  const metrics = useMemo(() => {
    const occupancyPct = occupancy?.occupancy_percentage ?? 0;
    const attendancePct = overview?.attendance_today?.percentage ?? 0;
    const openMaintenance = maintenance?.total ?? 0;
    const slaCompliance = maintenance?.sla_compliance?.compliance_percentage ?? 0;
    const activeIncidents = incidents?.open_incidents ?? 0;

    return [
      { label: 'Occupancy Rate', value: `${occupancyPct}%`, trend: '', trendUp: occupancyPct >= 80, icon: Building2 },
      { label: 'Attendance Today', value: `${attendancePct}%`, trend: '', trendUp: attendancePct >= 85, icon: Users },
      { label: 'Open Maintenance', value: `${openMaintenance}`, trend: '', trendUp: openMaintenance < 10, icon: Wrench },
      { label: 'SLA Compliance', value: `${slaCompliance}%`, trend: '', trendUp: slaCompliance >= 90, icon: Shield },
      { label: 'Active Incidents', value: `${activeIncidents}`, trend: '', trendUp: activeIncidents === 0, icon: Activity },
      { label: 'Total Blocks', value: `${occupancy?.total_blocks ?? 0}`, trend: '', trendUp: true, icon: Building2 },
    ];
  }, [occupancy, overview, maintenance, incidents]);

  // Build chart data from block occupancy
  const chartData = useMemo(() => {
    if (!occupancy?.by_block) return [];
    return occupancy.by_block.map((b) => ({
      name: b.code || b.name,
      Capacity: b.capacity,
      Occupied: b.occupancy,
      Available: b.available,
    }));
  }, [occupancy]);

  const analyticsPages = [
    { title: 'Occupancy Trends', desc: 'Room occupancy over time by block, floor, and type', href: '/campus-living/analytics/occupancy', icon: Building2 },
    { title: 'Attendance Patterns', desc: 'Hostel check-in/out patterns and trends', href: '/campus-living/analytics/attendance', icon: Users },
    { title: 'Mess Analytics', desc: 'Waste trends, cost analysis, feedback patterns', href: '/campus-living/analytics/mess', icon: UtensilsCrossed },
    { title: 'Maintenance SLA', desc: 'Resolution time, SLA compliance, category breakdown', href: '/campus-living/analytics/maintenance', icon: Wrench },
    { title: 'Safety Score', desc: 'Incident trends, compliance rates, inspection scores', href: '/campus-living/analytics/safety', icon: Shield },
    { title: 'Fee Collection', desc: 'Revenue tracking, collection rates, defaulters', href: '/campus-living/analytics/fees', icon: IndianRupee },
    { title: 'Cross-Domain Risk', desc: 'Correlation analysis across all domains', href: '/campus-living/analytics/cross-domain', icon: Activity },
    { title: 'Risk Alerts', desc: 'Active alerts and anomaly detection', href: '/campus-living/analytics/alerts', icon: Bell },
    { title: 'Alert Rules', desc: 'Configure alert thresholds and rules', href: '/campus-living/analytics/alert-rules', icon: Settings },
  ];

  if (isLoading) {
    return (
      <ContentLayout title="Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Analytics">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Campus Living Analytics</h1>
          <p className="text-muted-foreground">
            Key performance metrics and trend analysis across all campus living domains
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <metric.icon className="h-4 w-4 text-muted-foreground" />
                  {metric.trendUp ? (
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-600" />
                  )}
                </div>
                <p className="text-2xl font-bold">{metric.value}</p>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Block Occupancy Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Block-wise Occupancy</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
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
                  <Bar dataKey="Occupied" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Available" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
                <p className="text-muted-foreground">No block data available to display chart</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maintenance Breakdown */}
        {maintenance && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{maintenance.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">SLA Compliance</p>
                <p className={`text-2xl font-bold ${maintenance.sla_compliance.compliance_percentage >= 90 ? 'text-green-600' : 'text-amber-600'}`}>
                  {maintenance.sla_compliance.compliance_percentage}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Avg Resolution</p>
                <p className="text-2xl font-bold">{maintenance.average_resolution_hours}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Critical Priority</p>
                <p className={`text-2xl font-bold ${maintenance.by_priority.critical > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {maintenance.by_priority.critical}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Analytics Links */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analyticsPages.map((page) => (
            <Link key={page.href} href={page.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <page.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{page.title}</h3>
                      <p className="text-sm text-muted-foreground">{page.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
