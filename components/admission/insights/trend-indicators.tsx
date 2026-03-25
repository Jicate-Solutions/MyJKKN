'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrendData } from '@/lib/services/admission/ai-insights-service';

interface TrendIndicatorsProps {
  trends: TrendData[];
  isLoading?: boolean;
}

export function TrendIndicators({ trends, isLoading }: TrendIndicatorsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-500" />
            Key Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-lg border">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (trends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-500" />
            Key Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <LineChart className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No trend data available</p>
            <p className="text-sm mt-1">
              Generate insights to see key metrics trends
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-blue-500" />
          Key Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {trends.map((trend, index) => (
            <TrendCard key={index} trend={trend} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface TrendCardProps {
  trend: TrendData;
}

function TrendCard({ trend }: TrendCardProps) {
  const getDirectionIcon = () => {
    switch (trend.direction) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getChangeColor = () => {
    if (trend.direction === 'up') return 'text-green-600';
    if (trend.direction === 'down') return 'text-red-600';
    return 'text-gray-500';
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-colors hover:bg-muted/50',
        trend.direction === 'up' && 'border-green-200 bg-green-50/50',
        trend.direction === 'down' && 'border-red-200 bg-red-50/50',
        trend.direction === 'stable' && 'border-gray-200'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{trend.label}</span>
        {getDirectionIcon()}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{trend.current}</span>
        {trend.changePercent !== 0 && (
          <span className={cn('text-sm font-medium', getChangeColor())}>
            {trend.changePercent > 0 ? '+' : ''}
            {trend.changePercent.toFixed(1)}%
          </span>
        )}
      </div>
      {trend.previous > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Previous: {trend.previous}
        </p>
      )}
    </div>
  );
}

// Mini trend indicator for inline use
interface MiniTrendProps {
  value: number;
  change: number;
  label?: string;
}

export function MiniTrend({ value, change, label }: MiniTrendProps) {
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-muted-foreground">{label}:</span>}
      <span className="font-medium">{value}</span>
      {change !== 0 && (
        <span
          className={cn(
            'flex items-center text-xs font-medium',
            direction === 'up' && 'text-green-600',
            direction === 'down' && 'text-red-600'
          )}
        >
          {direction === 'up' ? (
            <TrendingUp className="h-3 w-3 mr-0.5" />
          ) : (
            <TrendingDown className="h-3 w-3 mr-0.5" />
          )}
          {change > 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
