'use client';

/**
 * Institution Signal Card — overview card for one institution's recruitment signal.
 *
 * Shows: institution name, composite score (R/A/G), per-input status dots,
 * blocked-input count, worst program callout, snoozed badge.
 * Clicking navigates to drill-down detail page.
 */

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Ban,
  Clock,
} from 'lucide-react';
import { SignalScoreBadge } from './signal-score-badge';
import { SignalStatusDot } from './signal-status-dot';
import {
  OVERALL_STATUS_COLORS,
  SIGNAL_INPUT_KEYS,
  formatDateRelative,
} from './signal-helpers';
import type {
  HRRecruitmentSignalCache,
  HRRecruitmentSignalSuppression,
  SignalInputKey,
} from '@/types/hr-recruitment-need';

interface SignalCardProps {
  signal: HRRecruitmentSignalCache;
  institutionName?: string;
  suppression?: HRRecruitmentSignalSuppression | null;
  isSelected?: boolean;
  onSelect?: (institutionId: string) => void;
  className?: string;
}

export function SignalCard({
  signal,
  institutionName,
  suppression,
  isSelected,
  onSelect,
  className,
}: SignalCardProps) {
  const router = useRouter();
  const overallColors = OVERALL_STATUS_COLORS[signal.overall_status];
  const blockedCount = signal.blocked_inputs?.length ?? 0;
  const isBlocked = signal.overall_status === 'blocked' || signal.overall_status === 'insufficient_data';
  const isSnoozed = suppression?.is_active;

  // Find the worst input (first red, then amber)
  const worstInput = findWorstInput(signal.input_signals);

  function handleClick() {
    router.push(`/hr/intelligence/recruitment-need/${signal.institution_id}`);
  }

  function handleSelectForCompare(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect?.(signal.institution_id);
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        overallColors.border,
        'border-l-4',
        isSelected && 'ring-2 ring-primary ring-offset-2',
        isSnoozed && 'opacity-60',
        className
      )}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        {/* Header: Institution name + Score */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">
              {institutionName ?? `Institution ${signal.institution_id.slice(0, 8)}`}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Updated {formatDateRelative(signal.computed_at)}
            </p>
          </div>
          <SignalScoreBadge score={signal.composite_score} status={signal.overall_status} />
        </div>

        {/* Blocked banner */}
        {isBlocked && blockedCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 rounded px-2 py-1.5 mb-3">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">BLOCKED</span>
            <span>— {blockedCount} input{blockedCount > 1 ? 's' : ''} missing</span>
          </div>
        )}

        {/* Snoozed badge */}
        {isSnoozed && suppression && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5 mb-3">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Snoozed until {new Date(suppression.suppress_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
        )}

        {/* Per-input R/A/G dots row */}
        <div className="flex items-center gap-1.5 mb-3">
          {SIGNAL_INPUT_KEYS.map((key) => {
            const inputData = signal.input_signals?.[key];
            const status = inputData?.status ?? 'insufficient_data';
            return (
              <SignalStatusDot key={key} status={status} inputKey={key} size="sm" />
            );
          })}
        </div>

        {/* Worst-program callout */}
        {worstInput && !isBlocked && (
          <div className="flex items-center gap-1.5 text-xs">
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-muted-foreground truncate">
              Worst: <span className="font-medium">{worstInput.label}</span>
              {worstInput.gap != null && (
                <span className="ml-1">
                  (gap: {worstInput.gap > 0 ? '+' : ''}{worstInput.gap.toFixed(1)})
                </span>
              )}
            </span>
          </div>
        )}

        {/* Compare selection checkbox */}
        {onSelect && (
          <button
            onClick={handleSelectForCompare}
            className={cn(
              'mt-2 text-xs px-2 py-0.5 rounded border transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-input hover:bg-accent'
            )}
          >
            {isSelected ? 'Selected' : 'Compare'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helper: Find worst input ───────────────────────────────────────────────────

function findWorstInput(
  inputs: HRRecruitmentSignalCache['input_signals'] | null | undefined
): { key: SignalInputKey; label: string; gap: number | null } | null {
  if (!inputs) return null;

  const INPUT_LABELS: Record<string, string> = {
    sanctioned_gap: 'Sanctioned Gap',
    sfr: 'Student-Faculty Ratio',
    specialization_gap: 'Specialization Coverage',
    workload: 'Workload Balance',
    projected_intake: 'Projected Intake',
    attrition_pipeline: 'Attrition Pipeline',
    peer_benchmark: 'Peer Benchmark',
  };

  // First pass: find reds
  for (const key of SIGNAL_INPUT_KEYS) {
    const inp = inputs[key];
    if (inp?.status === 'red') {
      return { key, label: INPUT_LABELS[key] ?? key, gap: inp.gap ?? null };
    }
  }
  // Second pass: find ambers
  for (const key of SIGNAL_INPUT_KEYS) {
    const inp = inputs[key];
    if (inp?.status === 'amber') {
      return { key, label: INPUT_LABELS[key] ?? key, gap: inp.gap ?? null };
    }
  }
  return null;
}
