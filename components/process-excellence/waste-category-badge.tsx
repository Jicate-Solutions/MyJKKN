/**
 * Waste Category Badge Component
 *
 * Color-coded badge for TIMWOOD categories with tooltips
 */

'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { WASTE_LABELS, WASTE_DESCRIPTIONS, WASTE_COLORS } from '@/types/process-excellence';
import type { WasteCategory } from '@/types/process-excellence';
import { cn } from '@/lib/utils';

interface WasteCategoryBadgeProps {
  category: WasteCategory;
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
}

export function WasteCategoryBadge({
  category,
  showLabel = false,
  showTooltip = true,
  className
}: WasteCategoryBadgeProps) {
  const label = WASTE_LABELS[category];
  const description = WASTE_DESCRIPTIONS[category];
  const color = WASTE_COLORS[category];

  const badgeContent = (
    <Badge
      variant="outline"
      className={cn('font-mono font-bold', className)}
      style={{
        borderColor: color,
        color: color,
        backgroundColor: `${color}15`
      }}
    >
      {category}
      {showLabel && ` - ${label}`}
    </Badge>
  );

  if (!showTooltip) {
    return badgeContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badgeContent}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-semibold mb-1">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
