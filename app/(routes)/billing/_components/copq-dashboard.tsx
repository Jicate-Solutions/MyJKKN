'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  EyeOff
} from 'lucide-react';
import type { COPQDashboard as COPQDashboardType } from '@/types/billing-copq';
import { COPQ_CATEGORY_LABELS, COPQ_STATUS_COLORS } from '@/types/billing-copq';
import { formatCurrency } from '@/lib/utils';
import { ensureNumber, ensureObject, ensureArray } from '@/lib/utils/validation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

interface COPQDashboardProps {
  dashboard?: COPQDashboardType;
  loading: boolean;
  institutionId: string;
  year: number;
}

export function COPQDashboard({
  dashboard,
  loading,
  institutionId,
  year
}: COPQDashboardProps) {
  if (loading) {
    return <COPQDashboardSkeleton />;
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No Data Available</h3>
          <p className='text-muted-foreground text-center max-w-md'>
            No COPQ incidents have been logged for this institution and year.
          </p>
        </CardContent>
      </Card>
    );
  }

  // SAFETY: Validate all dashboard fields with defaults
  const total_copq_ytd = ensureNumber(dashboard.total_copq_ytd, 0);
  const visible_vs_hidden = ensureObject(dashboard.visible_vs_hidden, {
    visible: 0,
    hidden: 0
  });
  const stats = ensureObject(dashboard.stats, {
    total_incidents: 0,
    open_incidents: 0,
    resolved_incidents: 0,
    avg_resolution_time_days: 0
  });
  const by_category = ensureObject(dashboard.by_category, {});
  const top_incidents = ensureArray(dashboard.top_incidents, []);

  // SAFETY: Ensure numeric values in nested objects
  const safeVisibleHidden = {
    visible: ensureNumber(visible_vs_hidden.visible, 0),
    hidden: ensureNumber(visible_vs_hidden.hidden, 0)
  };
  const safeStats = {
    total_incidents: ensureNumber(stats.total_incidents, 0),
    open_incidents: ensureNumber(stats.open_incidents, 0),
    resolved_incidents: ensureNumber(stats.resolved_incidents, 0),
    avg_resolution_time_days: ensureNumber(stats.avg_resolution_time_days, 0)
  };

  return (
    <div className='space-y-6'>
      {/* Key Metrics */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <MetricCard
          title='Total COPQ (YTD)'
          value={formatCurrency(total_copq_ytd)}
          icon={<DollarSign className='h-4 w-4' />}
          description={`${year} total hidden costs`}
          trend={total_copq_ytd > 0 ? 'negative' : 'neutral'}
        />
        <MetricCard
          title='Visible Costs'
          value={formatCurrency(safeVisibleHidden.visible)}
          icon={<Eye className='h-4 w-4' />}
          description='Direct financial impact'
          subValue={`${
            total_copq_ytd > 0
              ? Math.round((safeVisibleHidden.visible / total_copq_ytd) * 100)
              : 0
          }% of total`}
        />
        <MetricCard
          title='Hidden Costs'
          value={formatCurrency(safeVisibleHidden.hidden)}
          icon={<EyeOff className='h-4 w-4' />}
          description='Estimated indirect costs'
          subValue={`${
            total_copq_ytd > 0
              ? Math.round((safeVisibleHidden.hidden / total_copq_ytd) * 100)
              : 0
          }% of total`}
          trend='negative'
        />
        <MetricCard
          title='Open Incidents'
          value={safeStats.open_incidents.toString()}
          icon={<AlertCircle className='h-4 w-4' />}
          description={`${safeStats.resolved_incidents} resolved`}
          subValue={`${safeStats.total_incidents} total`}
        />
      </div>

      {/* Resolution Stats */}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total Incidents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{safeStats.total_incidents}</div>
            <div className='flex gap-2 mt-2'>
              <Badge variant='outline' className='bg-blue-50 text-blue-700'>
                {safeStats.open_incidents} open
              </Badge>
              <Badge variant='outline' className='bg-green-50 text-green-700'>
                {safeStats.resolved_incidents} resolved
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Avg Resolution Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold flex items-center gap-2'>
              <Clock className='h-5 w-5 text-muted-foreground' />
              {safeStats.avg_resolution_time_days} days
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              From logged to resolved
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Hidden/Visible Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {safeVisibleHidden.visible > 0
                ? (safeVisibleHidden.hidden / safeVisibleHidden.visible).toFixed(1)
                : '0'}
              x
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Hidden costs are{' '}
              {safeVisibleHidden.visible > 0
                ? (safeVisibleHidden.hidden / safeVisibleHidden.visible).toFixed(1)
                : '0'}
              x visible costs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>COPQ by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(by_category).length === 0 ? (
            <p className='text-muted-foreground text-center py-8'>
              No category data available
            </p>
          ) : (
            <div className='space-y-3'>
              {Object.entries(by_category)
                .sort(([, a], [, b]) => (b || 0) - (a || 0))
                .map(([category, amount]) => {
                  const percentage =
                    total_copq_ytd > 0
                      ? Math.round(((amount || 0) / total_copq_ytd) * 100)
                      : 0;
                  return (
                    <div key={category} className='flex items-center gap-4'>
                      <div className='w-40 text-sm font-medium'>
                        {COPQ_CATEGORY_LABELS[category as keyof typeof COPQ_CATEGORY_LABELS] ||
                          category}
                      </div>
                      <div className='flex-1'>
                        <div className='h-2 bg-muted rounded-full overflow-hidden'>
                          <div
                            className='h-full bg-destructive rounded-full'
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className='w-24 text-right text-sm font-medium'>
                        {formatCurrency(amount || 0)}
                      </div>
                      <div className='w-12 text-right text-sm text-muted-foreground'>
                        {percentage}%
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Incidents */}
      <Card>
        <CardHeader>
          <CardTitle>Top Incidents by Cost</CardTitle>
        </CardHeader>
        <CardContent>
          {top_incidents.length === 0 ? (
            <p className='text-muted-foreground text-center py-8'>
              No incidents to display
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top_incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className='whitespace-nowrap'>
                      {new Date(incident.incident_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {COPQ_CATEGORY_LABELS[incident.category] || incident.category}
                    </TableCell>
                    <TableCell className='max-w-[300px] truncate'>
                      {incident.description}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant='outline'
                        className={COPQ_STATUS_COLORS[incident.status]}
                      >
                        {incident.status}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right font-medium'>
                      {formatCurrency(
                        incident.visible_cost + incident.hidden_cost_estimate
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  description?: string;
  subValue?: string;
  trend?: 'positive' | 'negative' | 'neutral';
}

function MetricCard({
  title,
  value,
  icon,
  description,
  subValue,
  trend
}: MetricCardProps) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <div className='text-muted-foreground'>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold flex items-center gap-2'>
          {value}
          {trend === 'positive' && (
            <TrendingUp className='h-4 w-4 text-green-500' />
          )}
          {trend === 'negative' && (
            <TrendingDown className='h-4 w-4 text-red-500' />
          )}
        </div>
        {description && (
          <p className='text-xs text-muted-foreground'>{description}</p>
        )}
        {subValue && (
          <p className='text-xs text-muted-foreground mt-1'>{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

function COPQDashboardSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className='pb-2'>
              <Skeleton className='h-4 w-24' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-32' />
              <Skeleton className='h-3 w-20 mt-2' />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-40' />
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className='flex items-center gap-4'>
                <Skeleton className='h-4 w-32' />
                <Skeleton className='h-2 flex-1' />
                <Skeleton className='h-4 w-20' />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
