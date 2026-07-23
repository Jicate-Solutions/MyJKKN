'use client';

/**
 * Comparison Mode — side-by-side view of 2 institutions' signals.
 * Uses same signal hooks with different institution filters.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X, ArrowLeftRight } from 'lucide-react';
import { useRecruitmentSignals } from '@/hooks/hr/recruitment-need/use-recruitment-signal';
import { SignalScoreBadge } from './signal-score-badge';
import { SignalStatusDot } from './signal-status-dot';
import {
  SIGNAL_INPUT_KEYS,
  INPUT_KEY_LABELS,
  STATUS_COLORS,
  formatScore,
  formatPercentage,
  formatGap,
} from './signal-helpers';
import type { HRRecruitmentSignalCache, SignalInputKey } from '@/types/hr-recruitment-need';

interface ComparisonViewProps {
  institutionIds: [string, string];
  institutionNames: Record<string, string>;
  onClose: () => void;
}

export function ComparisonView({ institutionIds, institutionNames, onClose }: ComparisonViewProps) {
  const { data: signalsA, isLoading: loadingA } = useRecruitmentSignals({ institution_id: institutionIds[0] });
  const { data: signalsB, isLoading: loadingB } = useRecruitmentSignals({ institution_id: institutionIds[1] });

  const isLoading = loadingA || loadingB;

  // Use institution-level (program_id = null) signal
  const signalA = signalsA?.find((s) => !s.program_id) ?? signalsA?.[0] ?? null;
  const signalB = signalsB?.find((s) => !s.program_id) ?? signalsB?.[0] ?? null;

  const nameA = institutionNames[institutionIds[0]] ?? `Institution ${institutionIds[0].slice(0, 8)}`;
  const nameB = institutionNames[institutionIds[1]] ?? `Institution ${institutionIds[1].slice(0, 8)}`;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Comparison Mode
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Headers */}
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <ComparisonColumn signal={signalA} name={nameA} />
              <ComparisonColumn signal={signalB} name={nameB} />
            </div>

            {/* Input-by-input comparison table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">{nameA}</th>
                    <th className="text-center px-3 py-2 font-medium">Input</th>
                    <th className="text-right px-3 py-2 font-medium">{nameB}</th>
                  </tr>
                </thead>
                <tbody>
                  {SIGNAL_INPUT_KEYS.map((key) => {
                    const inputA = signalA?.input_signals?.[key];
                    const inputB = signalB?.input_signals?.[key];
                    return (
                      <tr key={key} className="border-t">
                        <td className="px-3 py-2">
                          <InputCell input={inputA} />
                        </td>
                        <td className="px-3 py-2 text-center font-medium text-muted-foreground">
                          {INPUT_KEY_LABELS[key].short}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <InputCell input={inputB} align="right" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ComparisonColumn({
  signal,
  name,
}: {
  signal: HRRecruitmentSignalCache | null;
  name: string;
}) {
  if (!signal) {
    return (
      <div className="text-center py-4">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground mt-1">No signal data</p>
      </div>
    );
  }

  return (
    <div className="text-center py-2">
      <p className="text-sm font-medium truncate mb-2">{name}</p>
      <SignalScoreBadge score={signal.composite_score} status={signal.overall_status} size="lg" />
      <div className="flex items-center justify-center gap-1 mt-2">
        {SIGNAL_INPUT_KEYS.map((key) => {
          const inp = signal.input_signals?.[key];
          return (
            <SignalStatusDot
              key={key}
              status={inp?.status ?? 'insufficient_data'}
              inputKey={key}
              size="md"
            />
          );
        })}
      </div>
    </div>
  );
}

function InputCell({
  input,
  align = 'left',
}: {
  input?: { status: string; value: number | null; norm: number | null; gap: number | null; pct_of_norm: number | null } | null;
  align?: 'left' | 'right';
}) {
  if (!input) {
    return <span className="text-muted-foreground">--</span>;
  }

  const status = input.status as 'green' | 'amber' | 'red' | 'insufficient_data';
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.insufficient_data;
  const isRight = align === 'right';

  return (
    <div className={`flex items-center gap-1.5 ${isRight ? 'justify-end' : ''}`}>
      {!isRight && <span className={`h-2 w-2 rounded-full ${colors.dot}`} />}
      <span className={colors.text}>
        {formatPercentage(input.pct_of_norm)}
      </span>
      {input.gap != null && (
        <span className="text-muted-foreground">
          ({formatGap(input.gap)})
        </span>
      )}
      {isRight && <span className={`h-2 w-2 rounded-full ${colors.dot}`} />}
    </div>
  );
}
