// app/(routes)/audit/care/_components/care-summary-strip.tsx
// Live pillar totals + Index strip. Owner scores are canonical — the index
// renders "—" until every owner score exists (spec §4 empty-state).
//
// FRAMEWORK-AWARE (additive for CARRE v2.0): pass framework="CARRE" for a
// 5-pillar / **/100** strip that surfaces the Respect override — a red
// "Scale-up frozen" banner when RS1 or RS3 <= 1, and the operative verdict.
// Default framework="CARE" renders the original 4-pillar / /80 strip unchanged.

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ShieldAlert } from 'lucide-react';
import {
  careIndex,
  pillarScores as carePillarScores,
} from '@/lib/services/audit/care-scoring-service';
import {
  carreIndex,
  pillarScores as carrePillarScores,
} from '@/lib/services/audit/carre-scoring-service';
import type { PillarRating } from '@/lib/services/audit/carre-scoring-service';

type ScoreInput = { parameter_code: string; score: number };

const RATING_STYLES: Record<PillarRating, string> = {
  'Exemplary': 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'Established': 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  'Habit-dependent': 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  'Critical gap': 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
};

export function CareSummaryStrip({
  ownerScores,
  framework = 'CARE',
}: {
  ownerScores: ScoreInput[];
  framework?: 'CARE' | 'CARRE';
}) {
  const isCarre = framework === 'CARRE';
  const pillars = isCarre ? carrePillarScores(ownerScores) : carePillarScores(ownerScores);

  const care = isCarre ? null : careIndex(ownerScores);
  const carre = isCarre ? carreIndex(ownerScores) : null;

  const index = isCarre ? carre!.index : care!.index;
  const denom = isCarre ? 100 : 80;
  const verdictText = isCarre ? carre!.operativeVerdict : care!.verdict;
  const frozen = isCarre && carre!.respectFrozen;
  const itemCount = isCarre ? 25 : 20;

  // pillar cards + one index card
  const gridCols = isCarre ? 'lg:grid-cols-6' : 'lg:grid-cols-5';

  return (
    <div className="space-y-3">
      {frozen && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs dark:border-red-800 dark:bg-red-950">
          <p className="flex items-start gap-2 text-red-800 dark:text-red-200">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>Scale-up frozen — dignity failure.</strong> Respect item RS1
              (dignity in correction) or RS3 (respectful address) scored ≤ 1. The
              framework freezes scale-up regardless of the Index: fix the Respect
              gap before any expansion.
            </span>
          </p>
        </div>
      )}
      <div className={cn('grid gap-3 grid-cols-2 sm:grid-cols-3', gridCols)}>
        {pillars.map((p) => (
          <Card key={p.pillar}>
            <CardContent className="pt-4 pb-3 space-y-1">
              <div className="text-xs text-muted-foreground">{p.label}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {p.scoredCount === 0 ? '—' : p.total}
                <span className="text-sm font-normal text-muted-foreground">/20</span>
              </div>
              {p.rating ? (
                <Badge variant="outline" className={cn('text-[10px]', RATING_STYLES[p.rating])}>
                  {p.rating}
                </Badge>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {p.scoredCount}/5 scored
                </span>
              )}
            </CardContent>
          </Card>
        ))}
        <Card className={cn(frozen ? 'border-red-400' : 'border-primary/40')}>
          <CardContent className="pt-4 pb-3 space-y-1">
            <div className="text-xs text-muted-foreground">{isCarre ? 'CARRE Index' : 'CARE Index'}</div>
            <div className="text-2xl font-semibold tabular-nums">
              {index === null ? '—' : index}
              <span className="text-sm font-normal text-muted-foreground">/{denom}</span>
            </div>
            {verdictText ? (
              <p className={cn('text-[11px] leading-tight font-medium', frozen && 'text-red-700 dark:text-red-300')}>
                {verdictText}
              </p>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Computes when all {itemCount} items are scored
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
