'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/lib/services/solutions/types';
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
} from '@/lib/services/solutions/prospects-service';

interface PipelineStageBadgeProps {
  stage: PipelineStage;
  className?: string;
}

export function PipelineStageBadge({ stage, className }: PipelineStageBadgeProps) {
  const colors = PIPELINE_STAGE_COLORS[stage];
  const label = PIPELINE_STAGE_LABELS[stage];

  return (
    <Badge
      variant="outline"
      className={cn(
        colors.bg,
        colors.border,
        colors.text,
        'border font-medium',
        className
      )}
    >
      {label}
    </Badge>
  );
}
