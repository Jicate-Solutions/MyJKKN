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
//      medians from the SCF drip, once the three ratified gates are satisfied.
//      The gates are enforced by fn_classroom_practice_compare, NOT here; this
//      card only EXPLAINS which one is still holding, so a locked state is
//      never a silent dead end (rule #27).
//
//      Learner input arrives one micro-item at a time on post-session feedback
//      submissions — there is no learner-facing semester sheet.
//
// The compare is the point of the whole instrument: the gap between how a
// person believes their sessions land and how they actually land is the
// finding. A gap of 2 or more on any item is a Clarity finding — the framework
// treats "we read the same room differently" as a legibility failure before it
// is a disagreement about who is right.

'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Lock, ScanEye } from 'lucide-react';
import { useClassroomSealedComments } from '@/hooks/audit';
import {
  classroomPillarScores,
  type ClassroomPillarScore,
} from '@/lib/services/audit/carre-scoring-service';
import type {
  ClassroomCompareItem,
  ClassroomCompareResult,
  ClassroomSealedComment,
} from '@/lib/services/audit/carre-audit-service';
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

/** Narrows the compare payload to its unlocked shape (the one carrying items). */
function isUnlocked(
  c: ClassroomCompareResult | undefined,
): c is Extract<ClassroomCompareResult, { locked: false }> {
  return !!c && c.locked === false;
}

export function ClassroomCompareCard({
  parameters,
  compare,
}: {
  parameters: ScoreSheetParameter[];
  compare: ClassroomCompareResult | undefined;
}) {
  const nameByCode = new Map(parameters.map((p) => [p.code, p.name]));
  const totalItems = parameters.length;

  const unlocked = isUnlocked(compare) ? compare : null;
  const items: ClassroomCompareItem[] = unlocked?.items ?? [];

  // Below the k-floor the RPC returns the voice count but no median, so an item
  // can be "answered but not yet revealable" — worth showing as progress.
  const revealed = items.filter((i) => i.learner_median !== null);
  const waiting = items.filter((i) => i.learner_median === null && i.voices > 0);
  const gaps = revealed.map((i) => ({
    item: i,
    gap: i.self_score === null ? null : Math.abs(i.self_score - Number(i.learner_median)),
  }));
  const flagged = gaps.filter((g) => g.gap !== null && g.gap >= 2);

  const selfScored = unlocked ? unlocked.self_scored : (compare?.self_scored ?? 0);
  const selfComplete = totalItems > 0 && selfScored >= totalItems;

  // Batch-reveal cadence, named by the server (config-driven: weekly for
  // classes >= ~20 distinct learners, monthly below — the Director's default,
  // adjustable with no deploy). Fallback 'week' keeps pre-cadence responses
  // rendering honestly.
  const windowUnit = compare?.window_unit ?? 'week';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ScanEye className="h-4 w-4" />
          Self-score vs learner voice
          <Badge variant="outline" className="text-[10px]">
            k≥3 · identities sealed
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {
            'Learners are asked one of these 13 questions at a time, riding a session-feedback submission. Answers are sealed: this card only ever shows medians, never who said what.'
          }
        </p>

        {revealed.length === 0 ? (
          <ul className="space-y-1.5 text-xs">
            <GateRow
              done={selfComplete}
              label={`Score all ${totalItems} yourself first`}
              detail={`${selfScored} of ${totalItems} done — your own reading has to be on record before you see anyone else's, or the medians become an answer key.`}
            />
            <GateRow
              done={false}
              label={`Learner voices reveal when the ${windowUnit} completes`}
              detail={`Answers from the current ${windowUnit} are held back. A median that moves as replies arrive is a live scoreboard, and a scoreboard is what turns an honest instrument into a performance.`}
            />
            <GateRow
              done={false}
              label="Not enough voices yet"
              detail={
                waiting.length > 0
                  ? `${waiting.length} ${waiting.length === 1 ? 'item has' : 'items have'} answers but fewer than 3. Below 3, a single learner could be identified by elimination, so no median is returned.`
                  : 'An item needs at least 3 answered voices before its median appears. Below 3, a single learner could be identified by elimination.'
              }
            />
          </ul>
        ) : (
          <>
            <div className="divide-y rounded-md border">
              {gaps.map(({ item, gap }) => {
                const wide = gap !== null && gap >= 2;
                return (
                  <div
                    key={item.code}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 text-xs"
                  >
                    <span className="w-12 flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                      {shortCode(item.code)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {nameByCode.get(item.code) ?? item.code}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      you {item.self_score ?? '—'}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      learners {Number(item.learner_median)} ({item.voices})
                    </span>
                    <span
                      className={cn(
                        'w-14 text-right font-semibold tabular-nums',
                        wide ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                      )}
                    >
                      {gap === null ? '—' : `Δ ${gap}`}
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

            {waiting.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {waiting.length} more {waiting.length === 1 ? 'item is' : 'items are'} collecting
                answers but have not reached 3 voices yet.
              </p>
            )}

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

/**
 * Sealed learner comments — PRINCIPAL & DIRECTOR ONLY (ratified decision 3).
 * The server refuses the cycle's owner before any role check: the person the
 * comments describe never reads them, even holding admin or principal. This
 * component renders NOTHING for anyone the server turns away, so mounting it
 * is safe on any viewer — visibility is decided in exactly one place.
 *
 * Comments batch-reveal on the SAME config-driven completed window as the
 * scores (fn_classroom_practice_window_cutoff): a comment written this week
 * cannot be timed back to a submission. No identity, no fine timestamps —
 * a window label, an item code, and the words.
 */
export function ClassroomSealedCommentsCard({
  cycleId,
  parameters,
}: {
  cycleId: string;
  parameters: ScoreSheetParameter[];
}) {
  const q = useClassroomSealedComments(cycleId);
  const nameByCode = new Map(parameters.map((p) => [p.code, p.name]));

  if (!q.data || q.data.locked) return null;

  const { comments, window_unit } = q.data;

  // Group by window label (already batch-cut server-side).
  const byWindow = new Map<string, ClassroomSealedComment[]>();
  for (const c of comments) {
    const list = byWindow.get(c.window_label) ?? [];
    list.push(c);
    byWindow.set(c.window_label, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Lock className="h-4 w-4" />
          Sealed comments
          <Badge variant="outline" className="text-[10px]">
            Principal &amp; Director only
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {
            'Learners are occasionally invited to add one sealed line after answering a practice question. The Senior Learner never sees these — never with a name, and only after a '
          }
          {window_unit}
          {' completes, so timing can never unmask a voice.'}
        </p>

        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No sealed comments in any completed {window_unit} yet.
          </p>
        ) : (
          [...byWindow.entries()].map(([label, list]) => (
            <div key={label} className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {window_unit === 'week' ? 'Week of' : 'Month of'} {label}
              </p>
              <div className="divide-y rounded-md border">
                {list.map((c, i) => (
                  <div key={`${label}-${i}`} className="space-y-1 p-2.5 text-xs">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {shortCode(c.code)}
                      {nameByCode.has(c.code) ? ` · ${nameByCode.get(c.code)}` : ''}
                    </span>
                    <p>&ldquo;{c.comment}&rdquo;</p>
                  </div>
                ))}
              </div>
            </div>
          ))
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
