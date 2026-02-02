/**
 * Stage Indicator Component
 *
 * Visual indicator for maturity stages 1-4 with colors and descriptions.
 * - Stage 1: Crisis (Red)
 * - Stage 2: Survival (Orange)
 * - Stage 3: Stability (Yellow/Blue)
 * - Stage 4: Excellence (Green)
 */

'use client';

import { cn } from '@/lib/utils';
import type { MaturityStage } from '@/types/maturity-assessment';
import {
  MATURITY_STAGE_NAMES,
  MATURITY_STAGE_DESCRIPTIONS
} from '@/types/maturity-assessment';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface StageIndicatorProps {
  stage: MaturityStage;
  showLabel?: boolean;
  showDescription?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'badge' | 'bar' | 'circle';
  className?: string;
}

const stageColors: Record<MaturityStage, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-blue-500',
  4: 'bg-green-500'
};

const stageTextColors: Record<MaturityStage, string> = {
  1: 'text-red-800',
  2: 'text-orange-800',
  3: 'text-blue-800',
  4: 'text-green-800'
};

const stageBgLightColors: Record<MaturityStage, string> = {
  1: 'bg-red-100',
  2: 'bg-orange-100',
  3: 'bg-blue-100',
  4: 'bg-green-100'
};

const stageBorderColors: Record<MaturityStage, string> = {
  1: 'border-red-200',
  2: 'border-orange-200',
  3: 'border-blue-200',
  4: 'border-green-200'
};

/**
 * Badge variant - Colored badge with optional label
 */
function StageBadge({
  stage,
  showLabel,
  size,
  className
}: Omit<StageIndicatorProps, 'variant' | 'showDescription'>) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        stageBgLightColors[stage],
        stageTextColors[stage],
        stageBorderColors[stage],
        sizeClasses[size || 'md'],
        className
      )}
    >
      <span className={cn('rounded-full', stageColors[stage], dotSize[size || 'md'])} />
      {showLabel ? (
        <span>
          Stage {stage}: {MATURITY_STAGE_NAMES[stage]}
        </span>
      ) : (
        <span>Stage {stage}</span>
      )}
    </span>
  );
}

/**
 * Bar variant - Progress bar showing stage progression
 */
function StageBar({
  stage,
  size,
  className
}: Omit<StageIndicatorProps, 'variant' | 'showLabel' | 'showDescription'>) {
  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3'
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {[1, 2, 3, 4].map((s) => (
        <div
          key={s}
          className={cn(
            'flex-1 rounded-sm transition-colors',
            heightClasses[size || 'md'],
            s <= stage ? stageColors[stage] : 'bg-gray-200'
          )}
        />
      ))}
    </div>
  );
}

/**
 * Circle variant - Circular badge with stage number
 */
function StageCircle({
  stage,
  size,
  className
}: Omit<StageIndicatorProps, 'variant' | 'showLabel' | 'showDescription'>) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-2xl'
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white',
        stageColors[stage],
        sizeClasses[size || 'md'],
        className
      )}
    >
      {stage}
    </div>
  );
}

/**
 * Main Stage Indicator Component
 */
export function StageIndicator({
  stage,
  showLabel = true,
  showDescription = false,
  size = 'md',
  variant = 'badge',
  className
}: StageIndicatorProps) {
  // Render the appropriate variant
  let indicator: React.ReactNode;

  switch (variant) {
    case 'bar':
      indicator = <StageBar stage={stage} size={size} className={className} />;
      break;
    case 'circle':
      indicator = <StageCircle stage={stage} size={size} className={className} />;
      break;
    case 'badge':
    default:
      indicator = (
        <StageBadge
          stage={stage}
          showLabel={showLabel}
          size={size}
          className={className}
        />
      );
  }

  // Wrap with tooltip if description is requested
  if (showDescription) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-block">{indicator}</div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p className="font-semibold">Stage {stage}: {MATURITY_STAGE_NAMES[stage]}</p>
              <p className="text-sm">{MATURITY_STAGE_DESCRIPTIONS[stage]}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <>{indicator}</>;
}

/**
 * Stage Comparison Indicator
 * Shows current and target stages side by side
 */
interface StageComparisonProps {
  currentStage: MaturityStage;
  targetStage?: MaturityStage | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StageComparison({
  currentStage,
  targetStage,
  size = 'md',
  className
}: StageComparisonProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StageIndicator
        stage={currentStage}
        showLabel={false}
        variant="circle"
        size={size}
      />
      {targetStage && targetStage > currentStage && (
        <>
          <span className="text-muted-foreground">→</span>
          <StageIndicator
            stage={targetStage}
            showLabel={false}
            variant="circle"
            size={size}
          />
        </>
      )}
    </div>
  );
}

/**
 * Stage Progress Bar with Labels
 */
interface StageProgressBarProps {
  currentStage: MaturityStage;
  targetStage?: MaturityStage | null;
  showLabels?: boolean;
  className?: string;
}

export function StageProgressBar({
  currentStage,
  targetStage,
  showLabels = true,
  className
}: StageProgressBarProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Stage 1</span>
          <span>Stage 2</span>
          <span>Stage 3</span>
          <span>Stage 4</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={cn(
              'h-2 flex-1 rounded-sm transition-colors',
              s <= currentStage
                ? stageColors[currentStage]
                : targetStage && s <= targetStage
                  ? 'bg-gray-300 border border-dashed border-gray-500'
                  : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      {showLabels && (
        <div className="flex justify-between text-xs">
          <span className={stageTextColors[currentStage]}>
            Current: {MATURITY_STAGE_NAMES[currentStage]}
          </span>
          {targetStage && targetStage > currentStage && (
            <span className="text-muted-foreground">
              Target: {MATURITY_STAGE_NAMES[targetStage]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
