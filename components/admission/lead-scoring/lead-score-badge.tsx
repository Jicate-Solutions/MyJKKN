'use client';

import { cn } from '@/lib/utils';
import { Flame, Thermometer, Snowflake, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============================================
// TYPES
// ============================================

export type ScoreCategory = 'hot' | 'warm' | 'qualified' | 'nurture' | 'cold';
export type TrendDirection = 'up' | 'down' | 'stable';

export interface LeadScoreBadgeProps {
  score: number;
  previousScore?: number;
  showTrend?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get score category based on score value
 * Ranges: Hot (80+), Warm (60-79), Qualified (40-59), Nurture (20-39), Cold (<20)
 */
export function getScoreCategory(score: number): ScoreCategory {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 40) return 'qualified';
  if (score >= 20) return 'nurture';
  return 'cold';
}

/**
 * Get display label for score category
 */
export function getCategoryLabel(category: ScoreCategory): string {
  const labels: Record<ScoreCategory, string> = {
    hot: 'Hot',
    warm: 'Warm',
    qualified: 'Qualified',
    nurture: 'Nurture',
    cold: 'Cold',
  };
  return labels[category];
}

/**
 * Get color classes for score category
 */
export function getCategoryColors(category: ScoreCategory): {
  bg: string;
  text: string;
  border: string;
  icon: string;
} {
  const colors: Record<ScoreCategory, { bg: string; text: string; border: string; icon: string }> = {
    hot: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-500',
    },
    warm: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-700 dark:text-orange-400',
      border: 'border-orange-200 dark:border-orange-800',
      icon: 'text-orange-500',
    },
    qualified: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-400',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: 'text-yellow-600',
    },
    nurture: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
      icon: 'text-blue-500',
    },
    cold: {
      bg: 'bg-slate-100 dark:bg-slate-800/50',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-700',
      icon: 'text-slate-400',
    },
  };
  return colors[category];
}

/**
 * Get the appropriate icon for score category
 */
function getCategoryIcon(category: ScoreCategory, className?: string) {
  const iconClass = cn('shrink-0', className);

  switch (category) {
    case 'hot':
      return <Flame className={iconClass} />;
    case 'warm':
    case 'qualified':
      return <Thermometer className={iconClass} />;
    case 'nurture':
    case 'cold':
      return <Snowflake className={iconClass} />;
    default:
      return null;
  }
}

/**
 * Determine trend direction from score change
 */
function getTrendDirection(score: number, previousScore?: number): TrendDirection {
  if (previousScore === undefined) return 'stable';
  if (score > previousScore) return 'up';
  if (score < previousScore) return 'down';
  return 'stable';
}

/**
 * Get trend icon component
 */
function getTrendIcon(direction: TrendDirection, className?: string) {
  const iconClass = cn('shrink-0', className);

  switch (direction) {
    case 'up':
      return <TrendingUp className={cn(iconClass, 'text-green-500')} />;
    case 'down':
      return <TrendingDown className={cn(iconClass, 'text-red-500')} />;
    default:
      return <Minus className={cn(iconClass, 'text-slate-400')} />;
  }
}

// ============================================
// COMPONENT
// ============================================

/**
 * LeadScoreBadge - Compact badge showing lead score 0-100
 *
 * Features:
 * - Color-coded by score category (Hot, Warm, Qualified, Nurture, Cold)
 * - Optional trend arrow showing score change
 * - Three sizes: sm, md, lg
 * - Tooltip with category label
 *
 * @example
 * <LeadScoreBadge score={85} />
 * <LeadScoreBadge score={75} previousScore={65} showTrend />
 * <LeadScoreBadge score={45} size="lg" showLabel />
 */
export function LeadScoreBadge({
  score,
  previousScore,
  showTrend = false,
  size = 'md',
  showLabel = false,
  className,
}: LeadScoreBadgeProps) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const category = getScoreCategory(normalizedScore);
  const colors = getCategoryColors(category);
  const label = getCategoryLabel(category);
  const trendDirection = getTrendDirection(normalizedScore, previousScore);

  // Size configurations
  const sizeConfig = {
    sm: {
      container: 'px-1.5 py-0.5 text-xs gap-0.5',
      icon: 'h-3 w-3',
      trend: 'h-2.5 w-2.5',
    },
    md: {
      container: 'px-2 py-1 text-sm gap-1',
      icon: 'h-3.5 w-3.5',
      trend: 'h-3 w-3',
    },
    lg: {
      container: 'px-3 py-1.5 text-base gap-1.5',
      icon: 'h-4 w-4',
      trend: 'h-3.5 w-3.5',
    },
  };

  const config = sizeConfig[size];

  const badge = (
    <div
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        colors.bg,
        colors.text,
        colors.border,
        config.container,
        className
      )}
    >
      {getCategoryIcon(category, cn(config.icon, colors.icon))}
      <span className="font-semibold tabular-nums">{normalizedScore}</span>
      {showLabel && (
        <span className="font-normal opacity-80">{label}</span>
      )}
      {showTrend && previousScore !== undefined && trendDirection !== 'stable' && (
        getTrendIcon(trendDirection, config.trend)
      )}
    </div>
  );

  // Wrap with tooltip showing category info
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="font-medium">{label} Lead</p>
            <p className="text-xs text-muted-foreground">Score: {normalizedScore}/100</p>
            {showTrend && previousScore !== undefined && (
              <p className="text-xs text-muted-foreground">
                {trendDirection === 'up' && `+${normalizedScore - previousScore} from ${previousScore}`}
                {trendDirection === 'down' && `${normalizedScore - previousScore} from ${previousScore}`}
                {trendDirection === 'stable' && 'No change'}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
