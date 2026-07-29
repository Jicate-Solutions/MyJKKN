// app/(routes)/audit/care/_components/classroom-practice-panel.tsx
// The two surfaces a Classroom Practice (13-item) cycle shows its owner that a
// 25-item CARRE cycle does not:
//
//   1. ClassroomPillarStrip — per-pillar MEDIANS (0-4). Deliberately not a /100
//      index: an index across four pillars of unequal size is not comparable
//      between people, and a comparable number invites ranking people, which
//      this instrument must never do.
//
//   2. ClassroomCompareCard — the owner's own scores beside the sealed learner
//      medians, once the three ratified gates are satisfied. The gates are
//      enforced by fn_carre_participant_rollup, NOT here; this card only
//      EXPLAINS which one is still holding, so a locked state is never a silent
//      dead end (rule #27).
//
// The compare is the point of the whole instrument: the gap between how a
// person believes their sessions land and how they actually land is the
// finding. A gap of 2 or more on any item is a Clarity finding — the framework
// treats "we read the same room differently" as a legibility failure before it
// is a disagreement about who is right.

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Lock, LockOpen, ScanEye } from 'lucide-react';
import {
  classroomPillarScores,
  type ClassroomPillarScore,
} from '@/lib/services/audit/carre-scoring-service';
import type { CarreParticipantRollupRow } from '@/lib/services/audit/carre-evidence-service';
import type { ScoreSheetParameter } from './care-score-sheet';

type ScoreInput = { parameter_code: string; score: number };

const PILLAR_TONE: Record<string, string> = {
  C: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  A: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
  RS: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  E: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

function shortCode(code: string): string {
  return code.replace(/^(?:CARR?E|CP)-/, '');
}

export function ClassroomPillarStrip({
  parameters,
  ownerScores,
}: {
  parameters: ScoreSheetParameter[];
  ownerScores: ScoreInput[];
}) {
  const pillars: ClassroomPillarScore[] = classroomPillarScores(
    parameters.map((p) => p.code),
    ownerScores,
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {pillars.map((p) => (
        <Card key={p.pillar}>
          <CardContent className="space-y-1 py-3">
            <Badge
              variant="outline"
              className={cn('text-[10px] font-semibold', PILLAR_TONE[p.pillar])}
            >
              {p.pillar} — {p.label}
            </Badge>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums">
                {p.median === null ? '—' : p.median}
              </span>
              <span className="text-[11px] text-muted-foreground">median of 4</span>
            </div>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {p.scoredCount}/{p.itemCount} scored
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ClassroomCompareCard({
  parameters,
  ownerScores,
  rollup,
  windowOpen,
  isOwner,
  onCloseWindow,
  closing,
}: {
  parameters: ScoreSheetParameter[];
  ownerScores: ScoreInput[];
  rollup: CarreParticipantRollupRow[];
  windowOpen: boolean;
  isOwner: boolean;
  onCloseWindow: () => void;
  closing: boolean;
}) {
  const totalItems = parameters.length;
  const selfByCode = new Map(ownerScores.map((s) => [s.parameter_code, s.score]));
  const selfScored = parameters.filter((p) => selfByCode.has(p.code)).length;

  // A learner scores their own experience, so 'own' is the lane that matters;
  // fall back to whatever lane came back rather than dropping the row.
  const learnerByCode = new Map<string, CarreParticipantRollupRow>();
  for (const r of rollup) {
    const existing = learnerByCode.get(r.parameter_code);
    if (!existing || r.lane === 'own') learnerByCode.set(r.parameter_code, r);
  }

  const rows = parameters
    .map((p) => {
      const learner = learnerByCode.get(p.code);
      if (!learner) return null;
      const self = selfByCode.get(p.code);
      const learnerMedian = Number(learner.median_score);
      const gap = self === undefined ? null : Math.abs(self - learnerMedian);
      return { param: p, self, learnerMedian, scorers: learner.scorers, gap };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const flagged = rows.filter((r) => r.gap !== null && r.gap >= 2);
  const revealed = rows.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ScanEye className="h-4 w-4" />
          Self-score vs learner voice
          <Badge variant="outline" className="text-[10px]">
            k≥3 · identities sealed
          </Badge>
          {isOwner && windowOpen && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={onCloseWindow}
              disabled={closing}
            >
              <Lock className="mr-1 h-3.5 w-3.5" />
              {closing ? 'Closing…' : 'Close the learner window'}
            </Button>
          )}
          {isOwner && !windowOpen && (
            <Badge variant="outline" className="ml-auto text-[10px]">
              <LockOpen className="mr-1 h-3 w-3" />
              window closed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {!revealed ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {
                'Nothing is shown here until all three of these are true. They are enforced in the database, not on this screen — closing the window early or scoring one item will not shortcut them.'
              }
            </p>
            <ul className="space-y-1.5 text-xs">
              <GateRow
                done={selfScored >= totalItems && totalItems > 0}
                label={`Score all ${totalItems} items yourself first`}
                detail={`${selfScored} of ${totalItems} done — your own reading has to be on record before you see anyone else's, or the medians become an answer key.`}
              />
              <GateRow
                done={!windowOpen}
                label="Close the learner window"
                detail={
                  windowOpen
                    ? 'The learner window is still open — voices reveal in one batch after it closes. A running median would turn this into a live scoreboard.'
                    : 'Closed. Submissions are final.'
                }
              />
              <GateRow
                done={false}
                label="At least 3 learners answered"
                detail="Fewer than 3 voices — not enough to unseal. Below 3, a single learner could be identified by elimination, so nothing is returned at all."
              />
            </ul>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {
                'Your score beside the sealed learner median for the same item. Medians only, never names, never notes — and only items at least 3 learners answered appear.'
              }
            </p>
            <div className="divide-y rounded-md border">
              {rows.map((r) => {
                const wide = r.gap !== null && r.gap >= 2;
                return (
                  <div
                    key={r.param.code}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 text-xs"
                  >
                    <span className="w-12 flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                      {shortCode(r.param.code)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.param.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      you {r.self ?? '—'}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      learners {r.learnerMedian} ({r.scorers})
                    </span>
                    <span
                      className={cn(
                        'w-14 text-right font-semibold tabular-nums',
                        wide ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                      )}
                    >
                      {r.gap === null ? '—' : `Δ ${r.gap}`}
                    </span>
                    {wide && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      >
                        Clarity finding
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {flagged.length > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {flagged.length === 1
                  ? '1 item differs by 2 or more.'
                  : `${flagged.length} items differ by 2 or more.`}{' '}
                {
                  'A gap that wide becomes a Clarity finding: it means the two of you are reading the same room differently, and that is worth fixing before anyone argues about whose number was right.'
                }
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GateRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-bold',
          done
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'border-muted-foreground/40 text-muted-foreground',
        )}
      >
        {done ? '✓' : ''}
      </span>
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground"> — {detail}</span>
      </span>
    </li>
  );
}
