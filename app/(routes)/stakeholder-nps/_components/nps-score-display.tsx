'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface NPSScoreDisplayProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showTrend?: boolean;
  previousScore?: number;
  className?: string;
}

export function NPSScoreDisplay({
  score,
  size = 'md',
  showTrend = false,
  previousScore,
  className
}: NPSScoreDisplayProps) {
  const getScoreColor = (s: number) => {
    if (s >= 50) return 'text-green-600';
    if (s >= 0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (s: number) => {
    if (s >= 50) return 'bg-green-100';
    if (s >= 0) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const sizeClasses = {
    sm: 'text-2xl font-bold',
    md: 'text-4xl font-bold',
    lg: 'text-6xl font-bold'
  };

  const trend = previousScore !== undefined ? score - previousScore : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'rounded-lg px-4 py-2',
          getScoreBgColor(score)
        )}
      >
        <span className={cn(sizeClasses[size], getScoreColor(score))}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>

      {showTrend && trend !== null && (
        <div className={cn(
          'flex items-center gap-1 text-sm',
          trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'
        )}>
          {trend > 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : trend < 0 ? (
            <TrendingDown className="h-4 w-4" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
          <span>{trend > 0 ? '+' : ''}{trend}</span>
        </div>
      )}
    </div>
  );
}

interface NPSCategoryBadgeProps {
  category: 'promoter' | 'passive' | 'detractor';
  showLabel?: boolean;
  className?: string;
}

export function NPSCategoryBadge({
  category,
  showLabel = true,
  className
}: NPSCategoryBadgeProps) {
  const config = {
    promoter: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Promoter'
    },
    passive: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Passive'
    },
    detractor: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      label: 'Detractor'
    }
  };

  const { bg, text, label } = config[category];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        bg,
        text,
        className
      )}
    >
      {showLabel ? label : category.charAt(0).toUpperCase()}
    </span>
  );
}

interface NPSDistributionBarProps {
  promoters: number;
  passives: number;
  detractors: number;
  className?: string;
}

export function NPSDistributionBar({
  promoters,
  passives,
  detractors,
  className
}: NPSDistributionBarProps) {
  const total = promoters + passives + detractors;

  if (total === 0) {
    return (
      <div className={cn('h-4 bg-gray-200 rounded-full', className)}>
        <span className="sr-only">No responses yet</span>
      </div>
    );
  }

  const promoterPct = total > 0 ? (promoters / total) * 100 : 0;
  const passivePct = total > 0 ? (passives / total) * 100 : 0;
  const detractorPct = total > 0 ? (detractors / total) * 100 : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-4 rounded-full overflow-hidden">
        <div
          className="bg-green-500 transition-all duration-300"
          style={{ width: `${promoterPct}%` }}
          title={`Promoters: ${promoters} (${promoterPct.toFixed(1)}%)`}
        />
        <div
          className="bg-yellow-500 transition-all duration-300"
          style={{ width: `${passivePct}%` }}
          title={`Passives: ${passives} (${passivePct.toFixed(1)}%)`}
        />
        <div
          className="bg-red-500 transition-all duration-300"
          style={{ width: `${detractorPct}%` }}
          title={`Detractors: ${detractors} (${detractorPct.toFixed(1)}%)`}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Promoters ({promoters})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span>Passives ({passives})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Detractors ({detractors})</span>
        </div>
      </div>
    </div>
  );
}
