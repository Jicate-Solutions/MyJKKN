/**
 * Grievance SLA Dashboard Page - Server Component
 * F004: Grievance Ticketing System
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { DashboardStats, SLAIndicators } from '../_components/dashboard-stats';
import { getDashboardStats } from '../_data/get-tickets';

export default async function GrievanceDashboardPage() {
  // Get user profile
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  const isStaff = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  if (!isStaff) {
    redirect('/grievance');
  }

  // Fetch dashboard stats
  let stats: any;
  let categoryData: any[] | null = null;
  try {
    stats = await getDashboardStats(profile.institution_id);

    // Fetch SLA report data
    const supabase = await createClient();

    // Get tickets by category
    const { data } = await supabase
      .from('grievance_tickets')
      .select(`
        category:grievance_categories(name),
        status,
        sla_status
      `)
      .eq('institution_id', profile.institution_id);
    categoryData = data;
  } catch (error) {
    console.error('[grievance] Error loading dashboard:', error);
    stats = {
      total_open: 0,
      total_in_progress: 0,
      total_pending_info: 0,
      total_resolved: 0,
      total_closed: 0,
      sla_breached: 0,
      sla_at_risk: 0,
      avg_resolution_time_hours: 0,
      avg_satisfaction: 0,
    };
    categoryData = null;
  }

  // Calculate category stats
  const categoryStats = (categoryData || []).reduce((acc: Record<string, { total: number; breached: number }>, ticket: any) => {
    const categoryName = ticket.category?.name || 'Unknown';
    if (!acc[categoryName]) {
      acc[categoryName] = { total: 0, breached: 0 };
    }
    acc[categoryName].total++;
    if (ticket.sla_status === 'breached') {
      acc[categoryName].breached++;
    }
    return acc;
  }, {});

  // Calculate SLA compliance rate
  const totalTickets = stats.total_open + stats.total_in_progress + stats.total_pending_info +
    stats.total_resolved + stats.total_closed;
  const totalResolved = stats.total_resolved + stats.total_closed;
  const slaCompliance = totalResolved > 0
    ? ((totalResolved - stats.sla_breached) / totalResolved * 100).toFixed(1)
    : '100';

  return (
    <ContentLayout title="SLA Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'Dashboard', href: '/grievance/dashboard' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">SLA Compliance Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor grievance resolution performance and SLA compliance
          </p>
        </div>

        {/* Main Stats */}
        <DashboardStats stats={stats} />

        {/* SLA Overview */}
        <div className="grid gap-6 md:grid-cols-2">
          <SLAIndicators stats={stats} />

          {/* Compliance Rate Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Overall SLA Compliance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <div className="text-5xl font-bold text-primary">
                  {slaCompliance}%
                </div>
                <p className="text-muted-foreground mt-2">
                  of resolved tickets met SLA deadline
                </p>
                <div className="mt-4 text-sm">
                  <span className="text-muted-foreground">Target: </span>
                  <span className="font-medium">95%</span>
                  {parseFloat(slaCompliance) >= 95 ? (
                    <Badge className="ml-2 bg-green-100 text-green-700">On Target</Badge>
                  ) : (
                    <Badge className="ml-2 bg-red-100 text-red-700">Below Target</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tickets by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(categoryStats).map(([category, data]) => {
                const breachRate = data.total > 0
                  ? (data.breached / data.total * 100).toFixed(0)
                  : '0';
                return (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{category}</span>
                      <Badge variant="outline">{data.total} tickets</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {data.breached > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {data.breached} breached ({breachRate}%)
                        </Badge>
                      )}
                      {data.breached === 0 && (
                        <Badge className="bg-green-100 text-green-700 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          No breaches
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              {Object.keys(categoryStats).length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No ticket data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-100">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Resolution Time</p>
                  <p className="text-2xl font-bold">
                    {stats.avg_resolution_time_hours.toFixed(1)} hrs
                  </p>
                  <p className="text-xs text-muted-foreground">Target: 48 hrs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-yellow-100">
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">At Risk Tickets</p>
                  <p className="text-2xl font-bold">{stats.sla_at_risk}</p>
                  <p className="text-xs text-muted-foreground">Need immediate attention</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-100">
                  <CheckCircle2 className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Satisfaction</p>
                  <p className="text-2xl font-bold">
                    {stats.avg_satisfaction.toFixed(1)}/5
                  </p>
                  <p className="text-xs text-muted-foreground">From resolved tickets</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
