'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Eye, EyeOff, TrendingDown } from 'lucide-react';
import type { COPQIcebergData } from '@/types/billing-copq';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface COPQIcebergProps {
  iceberg?: COPQIcebergData;
  loading: boolean;
}

export function COPQIceberg({ iceberg, loading }: COPQIcebergProps) {
  if (loading) {
    return <COPQIcebergSkeleton />;
  }

  if (!iceberg) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No Data Available</h3>
          <p className='text-muted-foreground text-center max-w-md'>
            Log COPQ incidents to see the iceberg analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { visible_costs, hidden_costs, total_visible, total_hidden, ratio } =
    iceberg;

  const hasData =
    visible_costs.length > 0 ||
    hidden_costs.length > 0 ||
    total_visible > 0 ||
    total_hidden > 0;

  if (!hasData) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <TrendingDown className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No COPQ Data</h3>
          <p className='text-muted-foreground text-center max-w-md'>
            Start logging COPQ incidents to visualize visible vs hidden costs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Iceberg Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <TrendingDown className='h-5 w-5' />
            COPQ Iceberg Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='relative'>
            {/* Water Line Label */}
            <div className='absolute left-0 right-0 top-1/3 flex items-center gap-2 -translate-y-1/2 z-10'>
              <div className='h-px flex-1 bg-blue-400 border-dashed border-t border-blue-500' />
              <span className='text-xs font-medium text-blue-600 bg-white px-2 whitespace-nowrap'>
                WATERLINE - What you see
              </span>
              <div className='h-px flex-1 bg-blue-400 border-dashed border-t border-blue-500' />
            </div>

            {/* Iceberg Visual */}
            <div className='flex flex-col items-center'>
              {/* Above Water - Visible Costs */}
              <div className='w-full max-w-md bg-gradient-to-b from-sky-100 to-sky-200 p-6 rounded-t-3xl border-x border-t'>
                <div className='flex items-center gap-2 mb-4'>
                  <Eye className='h-5 w-5 text-sky-700' />
                  <h3 className='font-semibold text-sky-900'>Visible Costs</h3>
                  <span className='ml-auto text-lg font-bold text-sky-900'>
                    {formatCurrency(total_visible)}
                  </span>
                </div>
                <div className='space-y-2'>
                  {visible_costs.length > 0 ? (
                    visible_costs.slice(0, 4).map((item) => (
                      <div
                        key={item.category}
                        className='flex items-center justify-between text-sm'
                      >
                        <span className='text-sky-800'>{item.label}</span>
                        <span className='font-medium text-sky-900'>
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className='text-sm text-sky-700 text-center py-2'>
                      No visible costs recorded
                    </p>
                  )}
                </div>
              </div>

              {/* Below Water - Hidden Costs */}
              <div className='w-full max-w-lg bg-gradient-to-b from-blue-600 to-blue-900 p-6 rounded-b-3xl border-x border-b border-blue-700'>
                <div className='flex items-center gap-2 mb-4'>
                  <EyeOff className='h-5 w-5 text-blue-200' />
                  <h3 className='font-semibold text-white'>Hidden Costs</h3>
                  <span className='ml-auto text-lg font-bold text-white'>
                    {formatCurrency(total_hidden)}
                  </span>
                </div>
                <div className='space-y-2'>
                  {hidden_costs.length > 0 ? (
                    hidden_costs.slice(0, 5).map((item) => (
                      <div
                        key={item.category}
                        className='flex items-center justify-between text-sm'
                      >
                        <span className='text-blue-200'>{item.label}</span>
                        <span className='font-medium text-white'>
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className='text-sm text-blue-200 text-center py-2'>
                      No hidden costs estimated
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ratio Analysis */}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total Visible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-sky-700'>
              {formatCurrency(total_visible)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Direct financial impact
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total Hidden
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-700'>
              {formatCurrency(total_hidden)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              Estimated indirect costs
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
              {ratio.toFixed(1)}x
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              {ratio > 1
                ? 'Hidden costs exceed visible costs'
                : ratio === 0
                ? 'No hidden costs estimated'
                : 'Visible costs exceed hidden costs'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <div className='grid gap-4 md:grid-cols-2'>
        {/* Visible Costs Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <Eye className='h-4 w-4' />
              Visible Costs Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visible_costs.length === 0 ? (
              <p className='text-muted-foreground text-center py-4'>
                No visible costs recorded
              </p>
            ) : (
              <div className='space-y-3'>
                {visible_costs.map((item) => (
                  <div key={item.category}>
                    <div className='flex justify-between text-sm mb-1'>
                      <span>{item.label}</span>
                      <span className='font-medium'>
                        {formatCurrency(item.amount)} ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className='h-2 bg-muted rounded-full overflow-hidden'>
                      <div
                        className='h-full bg-sky-500 rounded-full'
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hidden Costs Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <EyeOff className='h-4 w-4' />
              Hidden Costs Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hidden_costs.length === 0 ? (
              <p className='text-muted-foreground text-center py-4'>
                No hidden costs estimated
              </p>
            ) : (
              <div className='space-y-3'>
                {hidden_costs.map((item) => (
                  <div key={item.category}>
                    <div className='flex justify-between text-sm mb-1'>
                      <span>{item.label}</span>
                      <span className='font-medium'>
                        {formatCurrency(item.amount)} ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className='h-2 bg-muted rounded-full overflow-hidden'>
                      <div
                        className='h-full bg-blue-600 rounded-full'
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insight Card */}
      <Card className='bg-amber-50 border-amber-200'>
        <CardContent className='pt-6'>
          <div className='flex gap-4'>
            <AlertCircle className='h-6 w-6 text-amber-600 flex-shrink-0' />
            <div>
              <h3 className='font-semibold text-amber-900 mb-1'>
                The Iceberg Effect
              </h3>
              <p className='text-sm text-amber-800'>
                Like an iceberg, only a small portion of quality costs are visible
                on financial statements. The larger portion - hidden costs like
                staff time, reputation damage, and lost opportunities - remains
                underwater. Research suggests hidden costs can be{' '}
                <strong>4-10x</strong> larger than visible costs.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function COPQIcebergSkeleton() {
  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
        </CardHeader>
        <CardContent>
          <div className='flex flex-col items-center gap-0'>
            <Skeleton className='w-64 h-32 rounded-t-3xl' />
            <Skeleton className='w-80 h-48 rounded-b-3xl' />
          </div>
        </CardContent>
      </Card>
      <div className='grid gap-4 md:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
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
    </div>
  );
}
