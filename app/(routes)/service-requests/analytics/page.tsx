'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServiceRequestAnalytics } from '@/hooks/service-requests/use-service-requests';
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';

export default function ServiceRequestAnalyticsPage() {
  const { data: analytics, isLoading } = useServiceRequestAnalytics();

  if (isLoading) {
    return (
      <ContentLayout title="Service Request Analytics">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </ContentLayout>
    );
  }

  const overview = analytics?.overview;
  const trends = analytics?.trends || [];
  const bottlenecks = analytics?.approval_bottlenecks || [];

  return (
    <ContentLayout title="Service Request Analytics">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Analytics</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of service request metrics and trends
          </p>
        </div>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Total Requests"
              value={overview.total_requests}
              icon={<FileText className="h-6 w-6 text-blue-500" />}
            />
            <StatCard
              title="Pending"
              value={(overview.by_status?.submitted || 0) + (overview.by_status?.in_review || 0)}
              icon={<Clock className="h-6 w-6 text-yellow-500" />}
            />
            <StatCard
              title="Approved"
              value={overview.by_status?.approved || 0}
              icon={<CheckCircle className="h-6 w-6 text-green-500" />}
            />
            <StatCard
              title="Rejected"
              value={overview.by_status?.rejected || 0}
              icon={<XCircle className="h-6 w-6 text-red-500" />}
            />
          </div>
        )}

        {/* Timing Metrics */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg. Approval Time</p>
                    <p className="text-2xl font-bold">
                      {overview.avg_approval_time_hours
                        ? `${overview.avg_approval_time_hours.toFixed(1)}h`
                        : '-'}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg. Fulfillment Time</p>
                    <p className="text-2xl font-bold">
                      {overview.avg_fulfillment_time_hours
                        ? `${overview.avg_fulfillment_time_hours.toFixed(1)}h`
                        : '-'}
                    </p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* By Service Type */}
        {overview?.by_service_type && overview.by_service_type.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requests by Service Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overview.by_service_type.map((item) => {
                  const maxCount = Math.max(...overview.by_service_type.map((i) => i.count));
                  const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={item.type_id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{item.type_name}</span>
                        <span className="text-sm text-muted-foreground">{item.count}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2 transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Status Distribution */}
        {overview?.by_status && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Object.entries(overview.by_status).map(([status, count]) => (
                  <div
                    key={status}
                    className="text-center p-3 rounded-lg border"
                  >
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {status.replace(/_/g, ' ')}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Priority */}
        {overview?.by_priority && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Priority Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(overview.by_priority).map(([priority, count]) => (
                  <div
                    key={priority}
                    className="text-center p-3 rounded-lg border"
                  >
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground capitalize">{priority}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trends */}
        {trends.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Submitted</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Approved</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.slice(-10).map((row) => (
                      <tr key={row.date} className="border-b last:border-0">
                        <td className="p-2">{row.date}</td>
                        <td className="p-2 text-right">{row.submitted}</td>
                        <td className="p-2 text-right text-green-600">{row.approved}</td>
                        <td className="p-2 text-right text-red-600">{row.rejected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approval Bottlenecks */}
        {bottlenecks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Approval Bottlenecks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium text-muted-foreground">Step</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Role</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Avg. Wait (hrs)</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottlenecks.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 font-medium">{item.step_name}</td>
                        <td className="p-2 capitalize">{item.approver_role.replace(/_/g, ' ')}</td>
                        <td className="p-2 text-right">
                          {item.avg_wait_hours.toFixed(1)}
                        </td>
                        <td className="p-2 text-right">
                          {item.pending_count > 0 ? (
                            <span className="text-yellow-600 font-medium">{item.pending_count}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!analytics && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                No analytics data available yet
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
