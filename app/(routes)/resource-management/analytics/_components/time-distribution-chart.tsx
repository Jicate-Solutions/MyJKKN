// app/(routes)/resource-management/analytics/_components/time-distribution-chart.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TimeSlot {
  hour: number;
  count: number;
  period: string;
}

interface TimeDistributionChartProps {
  data: TimeSlot[];
  isLoading?: boolean;
}

export function TimeDistributionChart({
  data,
  isLoading = false
}: TimeDistributionChartProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const getTimeLabel = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour} ${period}`;
  };

  const getPeriodColor = (period: string) => {
    switch (period.toLowerCase()) {
      case 'morning':
        return 'bg-amber-500';
      case 'afternoon':
        return 'bg-blue-500';
      case 'evening':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getPeriodBadge = (period: string) => {
    const colors = {
      morning: 'bg-amber-100 text-amber-800 border-amber-300',
      afternoon: 'bg-blue-100 text-blue-800 border-blue-300',
      evening: 'bg-purple-100 text-purple-800 border-purple-300'
    };
    return (
      colors[period.toLowerCase() as keyof typeof colors] ||
      'bg-gray-100 text-gray-800'
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Clock className='h-5 w-5' />
            Usage by Time of Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className='animate-pulse'>
                <div className='h-4 bg-gray-200 rounded w-20 mb-1'></div>
                <div className='h-6 bg-gray-200 rounded'></div>
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
            <Clock className='h-5 w-5' />
            Usage by Time of Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground text-center py-8'>
            No time distribution data available
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by period
  const periods = ['Morning', 'Afternoon', 'Evening'];
  const groupedData = periods.map((period) => ({
    period,
    slots: data.filter(
      (slot) => slot.period.toLowerCase() === period.toLowerCase()
    )
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Clock className='h-5 w-5' />
          Usage by Time of Day
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-6'>
          {groupedData.map(
            ({ period, slots }) =>
              slots.length > 0 && (
                <div key={period} className='space-y-2'>
                  <div className='flex items-center gap-2'>
                    <Badge className={getPeriodBadge(period)}>{period}</Badge>
                    <span className='text-xs text-muted-foreground'>
                      {slots.reduce((sum, slot) => sum + slot.count, 0)}{' '}
                      reservations
                    </span>
                  </div>
                  <div className='space-y-2'>
                    {slots.map((slot) => (
                      <div key={slot.hour} className='space-y-1'>
                        <div className='flex items-center justify-between text-xs'>
                          <span className='text-muted-foreground'>
                            {getTimeLabel(slot.hour)}
                          </span>
                          <span className='font-medium'>{slot.count}</span>
                        </div>
                        <div className='relative h-2 bg-gray-100 rounded-full overflow-hidden'>
                          <div
                            className={`h-full ${getPeriodColor(
                              period
                            )} transition-all duration-500`}
                            style={{
                              width: `${(slot.count / maxCount) * 100}%`,
                              minWidth: slot.count > 0 ? '8px' : '0'
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
