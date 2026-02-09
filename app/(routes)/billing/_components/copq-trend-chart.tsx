'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface TrendData {
  month: string;
  copq: number;
  visible: number;
  hidden: number;
}

interface COPQTrendChartProps {
  trend: TrendData[];
  loading: boolean;
}

export function COPQTrendChart({ trend, loading }: COPQTrendChartProps) {
  if (loading) {
    return <COPQTrendChartSkeleton />;
  }

  if (!trend || trend.length === 0) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-16'>
          <AlertCircle className='h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No Trend Data</h3>
          <p className='text-muted-foreground text-center max-w-md'>
            Log COPQ incidents across multiple months to see trends over time.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxCopq = Math.max(...trend.map((t) => t.copq), 1);
  const totalCopq = trend.reduce((sum, t) => sum + t.copq, 0);
  const avgCopq = trend.length > 0 ? totalCopq / trend.length : 0;

  // Calculate month-over-month changes
  const monthlyChanges = trend.map((t, i) => {
    if (i === 0) return { ...t, change: 0, changePercent: 0 };
    const prev = trend[i - 1].copq;
    const change = t.copq - prev;
    const changePercent = prev > 0 ? (change / prev) * 100 : 0;
    return { ...t, change, changePercent };
  });

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <div className='space-y-6'>
      {/* Summary Stats */}
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total COPQ (Period)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(totalCopq)}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Across {trend.length} months
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Monthly Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(avgCopq)}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              Per month average
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Peak Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length > 0 && (
              <>
                <div className='text-2xl font-bold'>
                  {formatCurrency(maxCopq)}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  {formatMonth(
                    trend.find((t) => t.copq === maxCopq)?.month || ''
                  )}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <TrendingUp className='h-5 w-5' />
            Monthly COPQ Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {/* Simple Bar Chart */}
            <div className='flex items-end gap-2 h-64 border-b border-l p-4'>
              {trend.map((item, index) => {
                const height = maxCopq > 0 ? (item.copq / maxCopq) * 100 : 0;
                const visibleHeight =
                  item.copq > 0 ? (item.visible / item.copq) * 100 : 0;

                return (
                  <div
                    key={item.month}
                    className='flex-1 flex flex-col items-center gap-1'
                  >
                    <div
                      className='w-full max-w-[60px] relative group cursor-pointer'
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    >
                      {/* Hidden cost portion */}
                      <div
                        className='absolute bottom-0 left-0 right-0 bg-blue-600 rounded-t transition-all group-hover:opacity-80'
                        style={{ height: `${100 - visibleHeight}%` }}
                      />
                      {/* Visible cost portion */}
                      <div
                        className='absolute bottom-0 left-0 right-0 bg-sky-400 transition-all group-hover:opacity-80'
                        style={{ height: `${visibleHeight}%` }}
                      />

                      {/* Tooltip */}
                      <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10'>
                        <div className='bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg border whitespace-nowrap'>
                          <div className='font-semibold'>
                            {formatMonth(item.month)}
                          </div>
                          <div>Total: {formatCurrency(item.copq)}</div>
                          <div className='text-sky-600'>
                            Visible: {formatCurrency(item.visible)}
                          </div>
                          <div className='text-blue-600'>
                            Hidden: {formatCurrency(item.hidden)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className='text-xs text-muted-foreground rotate-[-45deg] origin-top-left mt-2 whitespace-nowrap'>
                      {formatMonth(item.month)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className='flex items-center justify-center gap-6'>
              <div className='flex items-center gap-2'>
                <div className='w-4 h-4 bg-sky-400 rounded' />
                <span className='text-sm text-muted-foreground'>
                  Visible Costs
                </span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='w-4 h-4 bg-blue-600 rounded' />
                <span className='text-sm text-muted-foreground'>
                  Hidden Costs
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b'>
                  <th className='text-left py-3 px-2 font-medium'>Month</th>
                  <th className='text-right py-3 px-2 font-medium'>
                    Visible Cost
                  </th>
                  <th className='text-right py-3 px-2 font-medium'>
                    Hidden Cost
                  </th>
                  <th className='text-right py-3 px-2 font-medium'>
                    Total COPQ
                  </th>
                  <th className='text-right py-3 px-2 font-medium'>
                    vs Prev Month
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyChanges.map((item, index) => (
                  <tr
                    key={item.month}
                    className='border-b last:border-0 hover:bg-muted/50'
                  >
                    <td className='py-3 px-2 font-medium'>
                      {formatMonth(item.month)}
                    </td>
                    <td className='py-3 px-2 text-right text-sky-700'>
                      {formatCurrency(item.visible)}
                    </td>
                    <td className='py-3 px-2 text-right text-blue-700'>
                      {formatCurrency(item.hidden)}
                    </td>
                    <td className='py-3 px-2 text-right font-medium'>
                      {formatCurrency(item.copq)}
                    </td>
                    <td className='py-3 px-2 text-right'>
                      {index === 0 ? (
                        <span className='text-muted-foreground'>-</span>
                      ) : (
                        <span
                          className={
                            item.changePercent > 0
                              ? 'text-red-600'
                              : item.changePercent < 0
                              ? 'text-green-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {item.changePercent > 0 ? '+' : ''}
                          {item.changePercent.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function COPQTrendChartSkeleton() {
  return (
    <div className='space-y-6'>
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
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
        </CardHeader>
        <CardContent>
          <div className='flex items-end gap-2 h-64'>
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className='flex-1'
                style={{ height: `${Math.random() * 80 + 20}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
