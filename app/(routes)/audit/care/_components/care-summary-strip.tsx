// app/(routes)/audit/care/_components/care-summary-strip.tsx
// Live pillar totals + CARE Index strip. Owner scores are canonical — the
// index renders "—" until all 20 owner scores exist (spec §4 empty-state).

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  careIndex,
  pillarScores,
  type CareScoreInput,
  type PillarRating,
} from '@/lib/services/audit/care-scoring-service';

const RATING_STYLES: Record<PillarRating, string> = {
  'Exemplary': 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'Established': 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  'Habit-dependent': 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  'Critical gap': 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
};

export function CareSummaryStrip({ ownerScores }: { ownerScores: CareScoreInput[] }) {
  const pillars = pillarScores(ownerScores);
  const { index, verdict } = careIndex(ownerScores);

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
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
      <Card className="border-primary/40">
        <CardContent className="pt-4 pb-3 space-y-1">
          <div className="text-xs text-muted-foreground">CARE Index</div>
          <div className="text-2xl font-semibold tabular-nums">
            {index === null ? '—' : index}
            <span className="text-sm font-normal text-muted-foreground">/80</span>
          </div>
          {verdict ? (
            <p className="text-[11px] leading-tight font-medium">{verdict}</p>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Computes when all 20 items are scored
            </span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
