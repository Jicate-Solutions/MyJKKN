'use client';

/**
 * Traffic-light dot indicator for signal status.
 * Renders a small colored circle (R/A/G or gray for insufficient data).
 */

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { STATUS_COLORS, INPUT_KEY_LABELS } from './signal-helpers';
import type { SignalStatus, SignalInputKey } from '@/types/hr-recruitment-need';

interface SignalStatusDotProps {
  status: SignalStatus;
  inputKey?: SignalInputKey;
  size?: 'sm' | 'md';
  className?: string;
}

export function SignalStatusDot({ status, inputKey, size = 'sm', className }: SignalStatusDotProps) {
  const colors = STATUS_COLORS[status];
  const sizeClass = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5';
  const label = inputKey ? INPUT_KEY_LABELS[inputKey]?.short : colors.label;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn('inline-block rounded-full shrink-0', sizeClass, colors.dot, className)}
            aria-label={`${label}: ${colors.label}`}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-medium">{inputKey ? INPUT_KEY_LABELS[inputKey].label : 'Status'}</p>
          <p className={colors.text}>{colors.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
