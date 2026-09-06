'use client';

/**
 * Year-over-Year Comparison — renders current AY signal data
 * alongside previous AY snapshot data for delta analysis.
 *
 * Uses snapshots filtered by financial_year to find previous year's data.
 * Financial year logic: if month >= 4 then currentFY = "YYYY-(YYYY+1)".
 */

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Minus, History } from 'lucide-react';
import { useSnapshots } from '@/hooks/hr/recruitment-need/use-recruitment-signal';
import {
  INPUT_KEY_LABELS,
  SIGNAL_INPUT_KEYS,
} from './signal-helpers';
import type {
  HRRecruitmentSignalCache,
  HRRecruitmentSignalSnapshot,
  SignalInputKey,
} from '@/types/hr-recruitment-need';

interface YoYComparisonProps {
  signals: HRRecruitmentSignalCache[];
  className?: string;
}

/** Compute financial year strings based on current date */
function getFinancialYears(): { current: string; previous: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  if (month >= 4) {
    return {
      current: `${year}-${year + 1}`,
      previous: `${year - 1}-${year}`,
    };
  }
  return {
    current: `${year - 1}-${year}`,
    previous: `${year - 2}-${year - 1}`,
  };
}

/** Delta indicator with color coding */
function DeltaIndicator({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  const delta = current - previous;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }

  // For scores: higher = better = green
  const isPositive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(Math.round(delta))}
    </span>
  );
}

export function YoYComparison({ signals, className }: YoYComparisonProps) {
  const { current: currentFY, previous: previousFY } = useMemo(getFinancialYears, []);
  const { data: snapshots, isLoading } = useSnapshots();

  // Find previous year snapshot(s) — use the most recent one tagged with previousFY
  const previousSnapshot = useMemo(() => {
    if (!snapshots?.length) return null;
    const fySnapshots = snapshots.filter(
      (s: HRRecruitmentSignalSnapshot) => s.financial_year === previousFY && !s.is_archived
    );
    if (fySnapshots.length === 0) return null;
    // Sort by taken_at descending, pick the most recent
    fySnapshots.sort(
      (a: HRRecruitmentSignalSnapshot, b: HRRecruitmentSignalSnapshot) =>
        new Date(b.taken_at).getTime() - new Date(a.taken_at).getTime()
    );
    return fySnapshots[0] as HRRecruitmentSignalSnapshot;
  }, [snapshots, previousFY]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading historical data...
        </CardContent>
      </Card>
    );
  }

  if (!previousSnapshot) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4" />
            Year-over-Year Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-muted-foreground/30 p-6 text-center">
            <History className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No historical data for {previousFY}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Take a snapshot to enable YoY comparison
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Extract snapshot signal data — snapshot.signal_data contains cached signals keyed by institution_id
  const snapshotData = previousSnapshot.signal_data as Record<string, unknown>;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4" />
            Year-over-Year Comparison
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {currentFY}
            </Badge>
            <span className="text-xs text-muted-foreground">vs</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {previousFY}
            </Badge>
          </div>
        </div>
        <CardDescription className="text-xs">
          Snapshot: {previousSnapshot.snapshot_name} (taken{' '}
          {new Date(previousSnapshot.taken_at).toLocaleDateString()})
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                  Institution
                </th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                  Score ({currentFY})
                </th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                  Score ({previousFY})
                </th>
                <th className="text-right py-2 pl-2 font-medium text-muted-foreground">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => {
                // Try to find matching institution in snapshot data
                const prevSignal = snapshotData[signal.institution_id] as
                  | { composite_score?: number | null; input_signals?: Record<string, { value?: number | null }> }
                  | undefined;
                const prevScore = prevSignal?.composite_score ?? null;

                return (
                  <tr key={signal.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium truncate max-w-[180px]">
                      {signal.institution_id.slice(0, 8)}...
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {signal.composite_score !== null
                        ? Math.round(signal.composite_score)
                        : '--'}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {prevScore !== null ? Math.round(prevScore) : '--'}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <DeltaIndicator
                        current={signal.composite_score}
                        previous={prevScore}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Per-input breakdown for first signal (summary row) */}
        {signals.length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Per-Input Summary (first institution)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SIGNAL_INPUT_KEYS.map((key) => {
                const currentInput = signals[0].input_signals?.[key];
                const currentVal = currentInput?.value ?? null;

                const prevInst = snapshotData[signals[0].institution_id] as
                  | { input_signals?: Record<string, { value?: number | null }> }
                  | undefined;
                const prevVal = prevInst?.input_signals?.[key]?.value ?? null;

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded border px-2 py-1.5"
                  >
                    <span className="text-[11px] text-muted-foreground truncate mr-1">
                      {INPUT_KEY_LABELS[key].short}
                    </span>
                    <DeltaIndicator current={currentVal} previous={prevVal} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
