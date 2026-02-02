/**
 * Process Excellence Metrics Page
 *
 * Displays SLA compliance, value-add breakdown, and TIMWOOD waste totals
 */

'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useProcessMetrics, useProcessExcellenceDashboard } from '@/hooks/process-excellence';
import { ValueAddChart } from '@/app/(routes)/process-excellence/_components/value-add-chart';
import { TimwoodBreakdown } from '@/app/(routes)/process-excellence/_components/timwood-breakdown';
import { PROCESS_CATEGORY_LABELS } from '@/types/process-excellence';
import type { ProcessCategory } from '@/types/process-excellence';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3
} from 'lucide-react';

export default function ProcessMetricsPage() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: dashboardData, isLoading: dashboardLoading } =
    useProcessExcellenceDashboard(selectedInstitutionId || '');

  const { data: metricsData, isLoading: metricsLoading } = useProcessMetrics({
    institution_id: selectedInstitutionId || '',
    category:
      selectedCategory !== 'all' ? (selectedCategory as ProcessCategory) : undefined
  });

  const isLoading = dashboardLoading || metricsLoading;

  if (!selectedInstitutionId) {
    return (
      <ContentLayout title="Process Metrics">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">
            Please select an institution to view process metrics.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (isLoading) {
    return (
      <ContentLayout title="Process Metrics">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </ContentLayout>
    );
  }

  const summary = dashboardData?.summary;
  const wasteBreakdown = dashboardData?.waste_breakdown || [];

  return (
    <ContentLayout title="Process Metrics">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Process Excellence Metrics</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              SLA compliance, value-add analysis, and waste tracking
            </p>
          </div>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(PROCESS_CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary?.sla_compliance_rate
                  ? `${summary.sla_compliance_rate.toFixed(1)}%`
                  : '-'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.total_processes || 0} active processes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Value-Add Ratio</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary?.avg_value_add_ratio
                  ? `${summary.avg_value_add_ratio.toFixed(1)}%`
                  : '-'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Average across all processes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Instances</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.active_instances || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">In progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Waste Incidents</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.open_waste_incidents || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                of {summary?.total_waste_incidents || 0} total
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Different Metrics */}
        <Tabs defaultValue="value-add" className="w-full">
          <TabsList>
            <TabsTrigger value="value-add">Value-Add Analysis</TabsTrigger>
            <TabsTrigger value="waste">TIMWOOD Breakdown</TabsTrigger>
            <TabsTrigger value="sla">SLA Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="value-add" className="space-y-4 mt-4">
            <ValueAddChart
              institutionId={selectedInstitutionId}
              category={
                selectedCategory !== 'all' ? (selectedCategory as ProcessCategory) : undefined
              }
            />
          </TabsContent>

          <TabsContent value="waste" className="space-y-4 mt-4">
            <TimwoodBreakdown wasteBreakdown={wasteBreakdown} />
          </TabsContent>

          <TabsContent value="sla" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>SLA Compliance by Process</CardTitle>
                <CardDescription>
                  Track which processes meet their service level agreements
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!metricsData || metricsData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No process metrics available
                  </p>
                ) : (
                  <div className="space-y-4">
                    {metricsData.map((metric) => (
                      <div
                        key={metric.process_id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{metric.process_name}</h4>
                            <Badge variant="outline" className="capitalize">
                              {metric.category}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span>{metric.completed_instances} completed</span>
                            <span>Avg cycle: {metric.avg_cycle_time.toFixed(1)}h</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-2xl font-bold">
                              {metric.sla_compliance.toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground">SLA compliance</p>
                          </div>
                          {metric.sla_compliance >= 90 ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : metric.sla_compliance >= 70 ? (
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
