'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface EnhancedStatCardProps {
  title: string;
  value: number | string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  additionalInfo?: Array<{ label: string; value: string | number }>;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'gradient' | 'glass' | 'neon';
}

export function EnhancedStatCard({
  title,
  value,
  trend,
  icon: Icon,
  gradient,
  additionalInfo,
  size = 'medium',
  variant = 'default'
}: EnhancedStatCardProps) {
  const sizeClasses = {
    small: 'p-4',
    medium: 'p-5',
    large: 'p-6'
  };

  const titleSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg'
  };

  const valueSizeClasses = {
    small: 'text-2xl',
    medium: 'text-3xl',
    large: 'text-4xl'
  };

  const iconSizeClasses = {
    small: 'h-8 w-8',
    medium: 'h-10 w-10',
    large: 'h-12 w-12'
  };

  const variantClasses = {
    default: 'bg-card',
    gradient: gradient,
    glass: 'bg-card/50 backdrop-blur-sm border-white/10',
    neon: 'bg-card border-2 border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.3)]'
  };

  const TrendIcon = trend?.direction === 'up'
    ? TrendingUp
    : trend?.direction === 'down'
      ? TrendingDown
      : Minus;

  const trendColor = trend?.direction === 'up'
    ? 'text-green-500'
    : trend?.direction === 'down'
      ? 'text-red-500'
      : 'text-muted-foreground';

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300 hover:shadow-lg',
        'group cursor-pointer',
        variantClasses[variant],
        sizeClasses[size]
      )}
    >
      {/* Gradient background overlay */}
      {variant === 'gradient' && (
        <div className={cn('absolute inset-0 opacity-10', gradient)} />
      )}

      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-0">
        <CardTitle className={cn('font-medium text-muted-foreground', titleSizeClasses[size])}>
          {title}
        </CardTitle>
        <div className={cn(
          'rounded-full p-2 transition-transform duration-300 group-hover:scale-110',
          variant === 'gradient' ? 'bg-white/20' : 'bg-primary/10'
        )}>
          <Icon className={cn(iconSizeClasses[size], 'text-primary')} />
        </div>
      </CardHeader>

      <CardContent className="p-0 pt-4">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-bold tracking-tight', valueSizeClasses[size])}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>

          {trend && (
            <div className={cn('flex items-center gap-1 text-sm', trendColor)}>
              <TrendIcon className="h-4 w-4" />
              <span className="font-medium">{trend.percentage}%</span>
            </div>
          )}
        </div>

        {additionalInfo && additionalInfo.length > 0 && (
          <div className={cn(
            'grid gap-2 mt-4 pt-4 border-t border-border/50',
            additionalInfo.length > 2 ? 'grid-cols-2' : 'grid-cols-1'
          )}>
            {additionalInfo.map((info, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{info.label}</span>
                <span className="text-sm font-medium">
                  {typeof info.value === 'number' ? info.value.toLocaleString() : info.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform -skew-x-12 translate-x-full group-hover:translate-x-[-100%]" />
    </Card>
  );
}
