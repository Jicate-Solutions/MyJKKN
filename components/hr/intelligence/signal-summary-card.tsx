'use client';

/**
 * Signal Summary Card — compact, mobile-friendly card for signal data.
 *
 * Shows institution name, composite score, overall R/A/G status dot.
 * Tap to expand: per-input breakdown in a compact list.
 * Touch targets are minimum 48px for accessibility.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  OVERALL_STATUS_COLORS,
  STATUS_COLORS,
  SIGNAL_INPUT_KEYS,
  INPUT_KEY_LABELS,
  formatScore,
} from '@/components/hr/recruitment-need/signal-helpers';
import type { HRRecruitmentSignalCache } from '@/types/hr-recruitment-need';

interface SignalSummaryCardProps {
  signal: HRRecruitmentSignalCache;
  institutionName?: string;
  className?: string;
}

export function SignalSummaryCard({
  signal,
  institutionName,
  className,
}: SignalSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const overallColors = OVERALL_STATUS_COLORS[signal.overall_status];

  return (
    <Card
      className={cn(
        'transition-all border-l-4',
        overallColors.border,
        className
      )}
    >
      <CardContent className="p-0">
        {/* Header row — always visible, tap target = 48px min */}
        <button
          type="button"
          className="w-full flex items-center gap-3 p-3 min-h-[48px] text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* Overall status dot */}
          <div
            className={cn(
              'shrink-0 h-3 w-3 rounded-full',
              signal.overall_status === 'green' && 'bg-green-500',
              signal.overall_status === 'amber' && 'bg-amber-500',
              signal.overall_status === 'red' && 'bg-red-500',
              signal.overall_status === 'blocked' && 'bg-gray-400',
              signal.overall_status === 'insufficient_data' && 'bg-gray-300',
            )}
          />

          {/* Institution name */}
          <span className="flex-1 min-w-0 text-sm font-medium truncate">
            {institutionName ?? `Institution ${signal.institution_id.slice(0, 8)}`}
          </span>

          {/* Composite score — large number */}
          <span className={cn('text-xl font-bold tabular-nums', overallColors.text)}>
            {formatScore(signal.composite_score)}
          </span>

          {/* Expand chevron */}
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        {/* Expanded: per-input breakdown */}
        {expanded && (
          <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
            {SIGNAL_INPUT_KEYS.map((key) => {
              const input = signal.input_signals?.[key];
              if (!input) return null;
              const statusKey = input.status ?? 'insufficient_data';
              const colors = STATUS_COLORS[statusKey];
              const label = INPUT_KEY_LABELS[key];

              return (
                <div key={key} className="flex items-center gap-2 min-h-[32px]">
                  <div className={cn('shrink-0 h-2 w-2 rounded-full', colors.dot)} />
                  <span className="flex-1 text-xs text-muted-foreground truncate">
                    {label.short}
                  </span>
                  <span className={cn('text-xs font-medium tabular-nums', colors.text)}>
                    {input.value !== null && input.value !== undefined
                      ? Math.round(input.value)
                      : '--'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
