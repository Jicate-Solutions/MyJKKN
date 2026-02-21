'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';

export default function AnalyticsDashboardPage() {
  const metrics = [
    { label: 'Occupancy Rate', value: '94%', trend: '+2%', trendUp: true, icon: Building2 },
    { label: 'Attendance Today', value: '89%', trend: '-1%', trendUp: false, icon: Users },
    { label: 'Mess Rating', value: '3.8/5', trend: '+0.2', trendUp: true, icon: UtensilsCrossed },
    { label: 'Open Maintenance', value: '12', trend: '-3', trendUp: true, icon: Wrench },
    { label: 'Safety Score', value: '92%', trend: '+1%', trendUp: true, icon: Shield },
    { label: 'Fee Collection', value: '82%', trend: '+5%', trendUp: true, icon: IndianRupee },
  ];

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
                <p className={`text-xs ${metric.trendUp ? 'text-green-600' : 'text-red-600'}`}>
                  {metric.trend} vs last month
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>Overall Trends (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Multi-line trend chart showing Occupancy, Attendance, Safety Score over time</p>
            </div>
          </CardContent>
        </Card>

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
