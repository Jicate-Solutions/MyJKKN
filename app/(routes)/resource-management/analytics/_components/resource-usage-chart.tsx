// app/(routes)/resource-management/analytics/_components/resource-usage-chart.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ResourceUsage {
  resource_name: string;
  reservation_count: number;
  total_hours: number;
  utilization_rate: number;
}

interface ResourceUsageChartProps {
  data: ResourceUsage[];
  isLoading?: boolean;
}

export function ResourceUsageChart({
  data,
  isLoading = false
}: ResourceUsageChartProps) {
  const maxCount = Math.max(...data.map((d) => d.reservation_count), 1);

  const getUtilizationColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 60) return 'bg-blue-500';
    if (rate >= 40) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BarChart3 className='h-5 w-5' />
            Top Resources by Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className='animate-pulse'>
                <div className='h-4 bg-gray-200 rounded w-1/2 mb-2'></div>
                <div className='h-8 bg-gray-200 rounded'></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BarChart3 className='h-5 w-5' />
            Top Resources by Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground text-center py-8'>
            No usage data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <BarChart3 className='h-5 w-5' />
          Top Resources by Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {data.slice(0, 10).map((resource, index) => (
            <div key={resource.resource_name} className='space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>
                    {index + 1}. {resource.resource_name}
                  </span>
                  <Badge
                    variant='outline'
                    className={`text-xs ${
                      resource.utilization_rate >= 80
                        ? 'border-green-500 text-green-700'
                        : resource.utilization_rate >= 60
                        ? 'border-blue-500 text-blue-700'
                        : 'border-gray-400 text-gray-600'
                    }`}
                  >
                    {resource.utilization_rate}% utilized
                  </Badge>
                </div>
                <span className='text-muted-foreground'>
                  {resource.reservation_count} bookings
                </span>
              </div>
              <div className='relative h-8 bg-gray-100 rounded-lg overflow-hidden'>
                <div
                  className={`h-full ${getUtilizationColor(
                    resource.utilization_rate
                  )} transition-all duration-500 flex items-center justify-end px-3`}
                  style={{
                    width: `${(resource.reservation_count / maxCount) * 100}%`,
                    minWidth: '30px'
                  }}
                >
                  <span className='text-xs text-white font-medium'>
                    {resource.total_hours.toFixed(1)}h
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {data.length > 10 && (
          <p className='text-xs text-muted-foreground text-center mt-4'>
            Showing top 10 of {data.length} resources
          </p>
        )}
      </CardContent>
    </Card>
  );
}
