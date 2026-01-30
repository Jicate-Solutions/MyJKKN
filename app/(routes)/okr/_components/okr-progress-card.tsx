'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface OKRProgressCardProps {
  title: string;
  description?: string;
  progress: number;
  current?: number;
  target?: number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  badge?: string;
  variant?: 'default' | 'compact' | 'large';
  className?: string;
}

export function OKRProgressCard({
  title,
  description,
  progress,
  current,
  target,
  unit,
  trend,
  trendValue,
  badge,
  variant = 'default',
  className
}: OKRProgressCardProps) {
  const getProgressColor = (value: number) => {
    if (value >= 75) return 'bg-emerald-500';
    if (value >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-slate-500';

  if (variant === 'compact') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{title}</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    );
  }

  if (variant === 'large') {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {badge && <Badge variant="secondary">{badge}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold" style={{ color: '#0b6d41' }}>
                {progress}%
              </span>
              {trend && (
                <div className={cn('flex items-center gap-1 mb-1', trendColor)}>
                  <TrendIcon className="h-4 w-4" />
                  {trendValue && <span className="text-sm">{trendValue}%</span>}
                </div>
              )}
            </div>
            <Progress value={progress} className="h-3" />
            {current !== undefined && target !== undefined && (
              <p className="text-sm text-muted-foreground">
                {current} / {target} {unit}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-2xl font-bold">{progress}%</span>
            {trend && (
              <div className={cn('flex items-center gap-1', trendColor)}>
                <TrendIcon className="h-4 w-4" />
                {trendValue && <span className="text-xs">{trendValue}%</span>}
              </div>
            )}
          </div>
          <Progress value={progress} className="h-2" />
          {current !== undefined && target !== undefined && (
            <p className="text-xs text-muted-foreground">
              {current} / {target} {unit}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Stat card for dashboard
interface OKRStatCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  iconBgColor?: string;
  className?: string;
}

export function OKRStatCard({
  title,
  value,
  icon,
  description,
  trend,
  trendValue,
  iconBgColor = 'bg-slate-100',
  className
}: OKRStatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-slate-500';

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {icon && (
            <div className={cn(iconBgColor, 'p-3 rounded-full')}>
              {icon}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{value}</span>
              {trend && (
                <div className={cn('flex items-center gap-0.5 mb-0.5', trendColor)}>
                  <TrendIcon className="h-3 w-3" />
                  {trendValue && <span className="text-xs">{trendValue}%</span>}
                </div>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
