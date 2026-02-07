'use client';

import { useProcessExcellenceDashboard } from '@/hooks/process-excellence';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  XCircle
} from 'lucide-react';
import {
  WASTE_LABELS,
  WASTE_COLORS,
  ABCD_RATING_LABELS,
  ABCD_RATING_COLORS,
  SLA_STATUS_LABELS
} from '@/types/process-excellence';
import type { ABCDRating, WasteCategory } from '@/types/process-excellence';
import { AdmissionQualityCard } from './admission-quality-card';

export function ProcessExcellenceDashboardContent() {
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const { data: dashboard, isLoading, error } = useProcessExcellenceDashboard(
    selectedInstitutionId || ''
  );

  if (!selectedInstitutionId) {
    return (
      <Card>
        <CardContent className='py-10 text-center text-muted-foreground'>
          Please select an institution to view process excellence data.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className='text-center py-10 text-muted-foreground'>
        Loading dashboard data...
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className='py-10 text-center text-destructive'>
          Failed to load dashboard data. Please try again.
        </CardContent>
      </Card>
    );
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className='py-10 text-center text-muted-foreground'>
          No data available. Start by defining some processes.
        </CardContent>
      </Card>
    );
  }

  const { summary, process_metrics, waste_breakdown, sla_distribution, recent_audits } = dashboard;

  return (
    <div className='space-y-6'>
      {/* Summary Metrics */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>SLA Compliance</CardTitle>
            <CheckCircle2 className='h-4 w-4 text-green-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {summary.sla_compliance_rate.toFixed(1)}%
            </div>
            <Progress
              value={summary.sla_compliance_rate}
              className='mt-2'
            />
            <p className='text-xs text-muted-foreground mt-1'>
              {summary.active_instances} active processes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Value-Add Ratio</CardTitle>
            <TrendingUp className='h-4 w-4 text-blue-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {summary.avg_value_add_ratio.toFixed(1)}%
            </div>
            <Progress
              value={summary.avg_value_add_ratio}
              className='mt-2'
            />
            <p className='text-xs text-muted-foreground mt-1'>
              Average across all processes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Waste Incidents</CardTitle>
            <AlertTriangle className='h-4 w-4 text-amber-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{summary.open_waste_incidents}</div>
            <p className='text-xs text-muted-foreground'>
              Open incidents of {summary.total_waste_incidents} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Defined Processes</CardTitle>
            <Activity className='h-4 w-4 text-purple-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{summary.total_processes}</div>
            <p className='text-xs text-muted-foreground'>
              Active process definitions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SLA Distribution & Waste Breakdown */}
      <div className='grid gap-6 lg:grid-cols-2'>
        {/* SLA Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>SLA Status Distribution</CardTitle>
            <CardDescription>
              Current status of active process instances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <CheckCircle2 className='h-4 w-4 text-green-500' />
                  <span>On Track</span>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-bold'>{sla_distribution.on_track}</span>
                  <Badge variant='outline' className='bg-green-50 text-green-700'>
                    {summary.active_instances > 0
                      ? ((sla_distribution.on_track / summary.active_instances) * 100).toFixed(0)
                      : 0}%
                  </Badge>
                </div>
              </div>

              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <Clock className='h-4 w-4 text-amber-500' />
                  <span>At Risk</span>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-bold'>{sla_distribution.at_risk}</span>
                  <Badge variant='outline' className='bg-amber-50 text-amber-700'>
                    {summary.active_instances > 0
                      ? ((sla_distribution.at_risk / summary.active_instances) * 100).toFixed(0)
                      : 0}%
                  </Badge>
                </div>
              </div>

              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <XCircle className='h-4 w-4 text-red-500' />
                  <span>Breached</span>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-bold'>{sla_distribution.breached}</span>
                  <Badge variant='outline' className='bg-red-50 text-red-700'>
                    {summary.active_instances > 0
                      ? ((sla_distribution.breached / summary.active_instances) * 100).toFixed(0)
                      : 0}%
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Waste Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>TIMWOOD Waste Breakdown</CardTitle>
            <CardDescription>
              Waste incidents by category
            </CardDescription>
          </CardHeader>
          <CardContent>
            {waste_breakdown.length === 0 ? (
              <p className='text-center text-muted-foreground py-8'>
                No waste incidents reported yet.
              </p>
            ) : (
              <div className='space-y-3'>
                {waste_breakdown.map((item) => (
                  <div key={item.category} className='flex items-center gap-3'>
                    <div
                      className='w-3 h-3 rounded-full flex-shrink-0'
                      style={{ backgroundColor: WASTE_COLORS[item.category as WasteCategory] }}
                    />
                    <div className='flex-1 min-w-0'>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm font-medium truncate'>
                          {item.label}
                        </span>
                        <span className='text-sm text-muted-foreground'>
                          {item.count}
                        </span>
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {item.total_hours_lost.toFixed(1)}h lost |
                        Rs.{item.total_cost_impact.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Process Metrics & Recent Audits */}
      <div className='grid gap-6 lg:grid-cols-2'>
        {/* Process Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Process Performance</CardTitle>
            <CardDescription>
              Key metrics by process definition
            </CardDescription>
          </CardHeader>
          <CardContent>
            {process_metrics.length === 0 ? (
              <p className='text-center text-muted-foreground py-8'>
                No process metrics available. Complete some process instances to see data.
              </p>
            ) : (
              <div className='space-y-4'>
                {process_metrics.slice(0, 5).map((metric) => (
                  <div key={metric.process_id} className='border-b pb-3 last:border-0'>
                    <div className='flex justify-between items-start mb-2'>
                      <div>
                        <span className='font-medium'>{metric.process_name}</span>
                        <Badge variant='outline' className='ml-2 capitalize'>
                          {metric.category}
                        </Badge>
                      </div>
                      <span className='text-sm text-muted-foreground'>
                        {metric.completed_instances} completed
                      </span>
                    </div>
                    <div className='grid grid-cols-3 gap-2 text-sm'>
                      <div>
                        <span className='text-muted-foreground'>Cycle Time:</span>
                        <span className='ml-1 font-medium'>{metric.avg_cycle_time.toFixed(1)}h</span>
                      </div>
                      <div>
                        <span className='text-muted-foreground'>Value-Add:</span>
                        <span className='ml-1 font-medium'>{metric.value_add_ratio.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className='text-muted-foreground'>SLA:</span>
                        <span className='ml-1 font-medium'>{metric.sla_compliance.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Audits */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Audits</CardTitle>
            <CardDescription>
              Latest process audit reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recent_audits.length === 0 ? (
              <p className='text-center text-muted-foreground py-8'>
                No audits created yet. Create an audit to evaluate process performance.
              </p>
            ) : (
              <div className='space-y-4'>
                {recent_audits.map((audit) => (
                  <div key={audit.id} className='flex items-center justify-between border-b pb-3 last:border-0'>
                    <div>
                      <div className='font-medium'>
                        {(audit as any).process?.name || 'Unknown Process'}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        {new Date(audit.audit_period_start).toLocaleDateString()} -
                        {new Date(audit.audit_period_end).toLocaleDateString()}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      {audit.abcd_rating && (
                        <Badge
                          style={{
                            backgroundColor: ABCD_RATING_COLORS[audit.abcd_rating as ABCDRating],
                            color: 'white'
                          }}
                        >
                          {audit.abcd_rating}
                        </Badge>
                      )}
                      <Badge variant='outline' className='capitalize'>
                        {audit.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
