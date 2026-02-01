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

interface MaturityStageBadgeProps {
  stage: MaturityStage;
  showLabel?: boolean;
  showDescription?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const stageColors: Record<MaturityStage, string> = {
  1: 'bg-red-100 text-red-800 border-red-200',
  2: 'bg-orange-100 text-orange-800 border-orange-200',
  3: 'bg-blue-100 text-blue-800 border-blue-200',
  4: 'bg-green-100 text-green-800 border-green-200'
};

const stageBgColors: Record<MaturityStage, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-blue-500',
  4: 'bg-green-500'
};

export function MaturityStageBadge({
  stage,
  showLabel = true,
  showDescription = false,
  size = 'md',
  className
}: MaturityStageBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        stageColors[stage],
        sizeClasses[size],
        className
      )}
    >
      <span
        className={cn(
          'rounded-full',
          stageBgColors[stage],
          size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2'
        )}
      />
      {showLabel && (
        <span>
          Stage {stage}: {MATURITY_STAGE_NAMES[stage]}
        </span>
      )}
      {!showLabel && <span>Stage {stage}</span>}
    </span>
  );

  if (showDescription) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>{MATURITY_STAGE_DESCRIPTIONS[stage]}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

interface MaturityStageIndicatorProps {
  stage: MaturityStage;
  targetStage?: MaturityStage | null;
  className?: string;
}

export function MaturityStageIndicator({
  stage,
  targetStage,
  className
}: MaturityStageIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {[1, 2, 3, 4].map((s) => (
        <div
          key={s}
          className={cn(
            'h-2 w-6 rounded-sm transition-colors',
            s <= stage
              ? stageBgColors[stage]
              : 'bg-gray-200',
            targetStage && s <= targetStage && s > stage
              ? 'bg-gray-400 border border-dashed border-gray-500'
              : ''
          )}
        />
      ))}
    </div>
  );
}

interface MaturityScoreCircleProps {
  stage: MaturityStage;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MaturityScoreCircle({
  stage,
  size = 'md',
  className
}: MaturityScoreCircleProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-2xl'
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white',
        stageBgColors[stage],
        sizeClasses[size],
        className
      )}
    >
      {stage}
    </div>
  );
}
