'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Calendar, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { useMatlabStats, useMatlabSnapshots } from '@/hooks/solutions/use-matlab-analytics';
import { AdoptionKPICards } from './_components/adoption-kpi-cards';

export default function MatlabDashboardPage() {
  const { data: statsRaw, isLoading: statsLoading } = useMatlabStats();
  const { data: snapshotsRaw, isLoading: snapshotsLoading } = useMatlabSnapshots();

  const stats = (statsRaw as any)?.data ?? statsRaw ?? null;
  const snapshots = (snapshotsRaw as any)?.data ?? snapshotsRaw ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MATLAB Adoption Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Campus-Wide License adoption tracking across Startup Studio and Solution Hub
          </p>
        </div>
        {stats?.last_snapshot_date && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Last import: {format(new Date(stats.last_snapshot_date), 'MMM d, yyyy')}
          </Badge>
        )}
      </div>

      {/* KPI Cards */}
      <AdoptionKPICards stats={stats} isLoading={statsLoading} />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="startup-studio">Startup Studio</TabsTrigger>
          <TabsTrigger value="solution-hub">Solution Hub</TabsTrigger>
          <TabsTrigger value="roi">ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                Adoption History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {snapshotsLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded" />
              ) : (snapshots as any[]).length > 0 ? (
                <div className="space-y-3">
                  {(snapshots as any[]).map((snapshot: any) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {format(new Date(snapshot.snapshot_date), 'MMMM yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {snapshot.total_registered_users} registered users
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        {snapshot.courses_completed != null && (
                          <p>{snapshot.courses_completed} courses completed</p>
                        )}
                        {snapshot.total_active_users != null && (
                          <p className="text-muted-foreground">
                            {snapshot.total_active_users} active
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No adoption data imported yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Import monthly data from MathWorks License Center to track adoption.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="startup-studio">
          <Card>
            <CardHeader>
              <CardTitle>MATLAB in Startup Studio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Shows projects built with MATLAB in Startup Studio cycles.
                Data is automatically collected when Learners select MATLAB as their build tool.
              </p>
              {stats?.ss_projects === 0 && (
                <p className="text-sm text-muted-foreground mt-4 text-center py-4">
                  No MATLAB projects in Startup Studio yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="solution-hub">
          <Card>
            <CardHeader>
              <CardTitle>MATLAB in Solution Hub</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Shows products that use MATLAB in their technology stack.
                Data is automatically collected from product creation forms.
              </p>
              {stats?.sh_products === 0 && (
                <p className="text-sm text-muted-foreground mt-4 text-center py-4">
                  No MATLAB products in Solution Hub yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roi">
          <Card>
            <CardHeader>
              <CardTitle>License ROI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">License Cost</p>
                  <p className="text-2xl font-bold">₹11,80,350</p>
                  <p className="text-xs text-muted-foreground">Annual (2026)</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Cost Per User</p>
                  <p className="text-2xl font-bold">
                    ₹{stats?.registered_users
                      ? Math.round(1180350 / stats.registered_users).toLocaleString()
                      : '16,86,183'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Target: ₹118 ({'>'}10,000 users)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
