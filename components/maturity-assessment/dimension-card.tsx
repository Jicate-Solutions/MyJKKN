/**
 * Dimension Card Component
 *
 * Card displaying a maturity dimension score (1-4) with visual progress.
 * Dimensions: Leadership, Strategy, People, Processes, Resources, Results
 */

'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { MaturityDimensionName, MaturityStage } from '@/types/maturity-assessment';
import { MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';
import { StageIndicator } from './stage-indicator';

interface DimensionCardProps {
  dimension: MaturityDimensionName;
  score: MaturityStage;
  targetScore?: MaturityStage | null;
  description?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Icon mapping for each dimension
 */
const dimensionIcons: Record<MaturityDimensionName, string> = {
  Leadership: '👥',
  Strategy: '🎯',
  People: '🧑‍🤝‍🧑',
  Processes: '⚙️',
  Resources: '📊',
  Results: '🏆'
};

/**
 * Color mapping for dimension cards
 */
const dimensionColors: Record<MaturityDimensionName, string> = {
  Leadership: 'border-purple-200 bg-purple-50/50',
  Strategy: 'border-blue-200 bg-blue-50/50',
  People: 'border-green-200 bg-green-50/50',
  Processes: 'border-orange-200 bg-orange-50/50',
  Resources: 'border-cyan-200 bg-cyan-50/50',
  Results: 'border-pink-200 bg-pink-50/50'
};

const dimensionAccentColors: Record<MaturityDimensionName, string> = {
  Leadership: 'text-purple-700',
  Strategy: 'text-blue-700',
  People: 'text-green-700',
  Processes: 'text-orange-700',
  Resources: 'text-cyan-700',
  Results: 'text-pink-700'
};

export function DimensionCard({
  dimension,
  score,
  targetScore,
  description,
  onClick,
  className
}: DimensionCardProps) {
  const progressPercentage = (score / 4) * 100;
  const hasTarget = targetScore && targetScore > score;

  return (
    <Card
      className={cn(
        'transition-all duration-200 border-2',
        dimensionColors[dimension],
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label={dimension}>
              {dimensionIcons[dimension]}
            </span>
            <CardTitle className={cn('text-base', dimensionAccentColors[dimension])}>
              {dimension}
            </CardTitle>
          </div>
          <StageIndicator stage={score} showLabel={false} variant="circle" size="sm" />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Score Display */}
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-bold">{score}/4</div>
            <div className="text-xs text-muted-foreground">
              {MATURITY_STAGE_NAMES[score]}
            </div>
          </div>
          {hasTarget && (
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Target</div>
              <div className="text-lg font-semibold">{targetScore}/4</div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Stage {score}</span>
            {hasTarget ? (
              <span>→ Stage {targetScore}</span>
            ) : (
              <span>{progressPercentage.toFixed(0)}%</span>
            )}
          </div>
        </div>

        {/* Optional Description */}
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact Dimension Card
 * Smaller variant for dashboard or summary views
 */
interface CompactDimensionCardProps {
  dimension: MaturityDimensionName;
  score: MaturityStage;
  onClick?: () => void;
  className?: string;
}

export function CompactDimensionCard({
  dimension,
  score,
  onClick,
  className
}: CompactDimensionCardProps) {
  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 transition-all duration-200',
        dimensionColors[dimension],
        onClick && 'cursor-pointer hover:shadow-md',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl" role="img" aria-label={dimension}>
          {dimensionIcons[dimension]}
        </span>
        <StageIndicator stage={score} showLabel={false} variant="circle" size="sm" />
      </div>
      <div className={cn('font-medium text-sm', dimensionAccentColors[dimension])}>
        {dimension}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {MATURITY_STAGE_NAMES[score]}
      </div>
    </div>
  );
}

/**
 * Dimension Grid
 * Grid layout for multiple dimension cards
 */
interface DimensionGridProps {
  dimensions: Record<MaturityDimensionName, MaturityStage>;
  targetDimensions?: Record<MaturityDimensionName, MaturityStage> | null;
  descriptions?: Partial<Record<MaturityDimensionName, string>>;
  onDimensionClick?: (dimension: MaturityDimensionName) => void;
  variant?: 'default' | 'compact';
  className?: string;
}

export function DimensionGrid({
  dimensions,
  targetDimensions,
  descriptions,
  onDimensionClick,
  variant = 'default',
  className
}: DimensionGridProps) {
  const dimensionNames: MaturityDimensionName[] = [
    'Leadership',
    'Strategy',
    'People',
    'Processes',
    'Resources',
    'Results'
  ];

  if (variant === 'compact') {
    return (
      <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4', className)}>
        {dimensionNames.map((dimension) => (
          <CompactDimensionCard
            key={dimension}
            dimension={dimension}
            score={dimensions[dimension] || 1}
            onClick={onDimensionClick ? () => onDimensionClick(dimension) : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {dimensionNames.map((dimension) => (
        <DimensionCard
          key={dimension}
          dimension={dimension}
          score={dimensions[dimension] || 1}
          targetScore={targetDimensions?.[dimension]}
          description={descriptions?.[dimension]}
          onClick={onDimensionClick ? () => onDimensionClick(dimension) : undefined}
        />
      ))}
    </div>
  );
}
