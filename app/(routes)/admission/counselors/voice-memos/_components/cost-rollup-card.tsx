// app/(routes)/admission/counselors/voice-memos/_components/cost-rollup-card.tsx
// Today's spend on Whisper + Gemini for voice-memo analysis.
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import { IndianRupee, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CostRollup } from '@/types/voice-memo-monitor';

interface CostRollupCardProps {
  cost: CostRollup;
  alertThresholdInr: number;
}

function formatRupees(value: number): string {
  // Show ₹0.00 for sub-rupee, otherwise 2 decimals.
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CostRollupCard({
  cost,
  alertThresholdInr,
}: CostRollupCardProps) {
  return (
    <Card
      className={cn(
        cost.alert_active &&
          'border-red-300 bg-red-50 dark:bg-red-950/30',
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle
          className={cn(
            'text-sm flex items-center gap-2',
            cost.alert_active && 'text-red-800 dark:text-red-200',
          )}
        >
          {cost.alert_active ? (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          ) : (
            <IndianRupee className="h-4 w-4 text-emerald-600" />
          )}
          Cost today
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'text-3xl font-bold tabular-nums',
              cost.alert_active && 'text-red-700 dark:text-red-300',
            )}
          >
            ₹{formatRupees(cost.today_inr)}
          </span>
          <span className="text-xs text-muted-foreground">
            · {cost.today_calls} {cost.today_calls === 1 ? 'API call' : 'API calls'}
          </span>
        </div>

        {cost.alert_active ? (
          <p className="text-xs text-red-800 dark:text-red-200 mt-2">
            Above ₹{alertThresholdInr.toLocaleString('en-IN')} daily threshold —
            review usage in /admin/ai-models.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            Daily alert threshold: ₹{alertThresholdInr.toLocaleString('en-IN')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
