'use client';

// Mobile-first courtside score entry (Sports Tournament).
// A bottom sheet built for entering a match result one-handed on a phone at the
// side of the court: large +/- steppers per side, a big winner toggle, and
// (almost) no typing. Reuses the SAME record-result hook + API + permission gate
// as the desktop ResultDialog — this file only changes the *input surface*.
// Rendered by fixtures-section.tsx on small screens; the desktop dialog stays.
// Created: 2026-07-26 (Sports Tournament — mobile courtside scoring).

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Minus, Trophy, Check } from 'lucide-react';
import type { TournamentMatch, RecordResultDto } from '@/types/tournament';
import { useRecordResult } from '@/hooks/events/use-tournament-fixtures';

type Outcome = RecordResultDto['status']; // 'completed' | 'walkover' | 'disqualified'

const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: 'completed', label: 'Played', hint: 'Match played to a result' },
  { value: 'walkover', label: 'Walkover', hint: 'A side did not show' },
  { value: 'disqualified', label: 'No-show / DQ', hint: 'A side disqualified' },
];

/** One side's big vertical stepper: [ + ] over the score over [ − ]. */
function ScoreStepper({
  name,
  score,
  onChange,
  isWinner,
}: {
  name: string;
  score: number;
  onChange: (next: number) => void;
  isWinner: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-colors',
        isWinner ? 'border-emerald-500 bg-emerald-50' : 'border-border bg-card'
      )}
    >
      <p className="flex w-full items-center justify-center gap-1 truncate text-center text-sm font-semibold">
        {isWinner && <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        <span className="truncate">{name}</span>
      </p>
      <button
        type="button"
        aria-label={`Increase ${name} score`}
        onClick={() => onChange(score + 1)}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-emerald-600 text-white active:scale-[0.97] active:bg-emerald-700"
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>
      <span className="select-none py-1 text-6xl font-bold leading-none tabular-nums">
        {score}
      </span>
      <button
        type="button"
        aria-label={`Decrease ${name} score`}
        onClick={() => onChange(Math.max(0, score - 1))}
        disabled={score <= 0}
        className="flex h-14 w-full items-center justify-center rounded-xl border-2 border-border text-foreground active:scale-[0.97] disabled:opacity-40"
      >
        <Minus className="h-7 w-7" strokeWidth={3} />
      </button>
    </div>
  );
}

export function MobileScoreSheet({
  eventId,
  match,
  open,
  onOpenChange,
}: {
  eventId: string;
  match: TournamentMatch;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const record = useRecordResult(eventId);

  const aId = match.side_a_entry_id;
  const bId = match.side_b_entry_id;
  const aName = match.side_a_name ?? 'Side A';
  const bName = match.side_b_name ?? 'Side B';

  // Prefill from the existing row when editing (the matches API returns score_a/
  // score_b/winner_entry_id via select('*') even though they aren't on the type).
  const m = match as unknown as { score_a?: number | null; score_b?: number | null };
  const [status, setStatus] = useState<Outcome>(
    match.status === 'walkover' || match.status === 'disqualified' ? match.status : 'completed'
  );
  const [scoreA, setScoreA] = useState<number>(m.score_a ?? 0);
  const [scoreB, setScoreB] = useState<number>(m.score_b ?? 0);
  // null → follow the score; a value → the scorer overrode the auto-pick.
  const [manualWinner, setManualWinner] = useState<string | null>(match.winner_entry_id ?? null);

  // Auto-suggest the winner from the score while it's a played match and the
  // scorer hasn't tapped a side themselves.
  const suggested =
    status === 'completed' && aId && bId && scoreA !== scoreB
      ? scoreA > scoreB
        ? aId
        : bId
      : null;
  const winner = manualWinner ?? suggested ?? '';
  const isDq = status === 'disqualified';

  async function submit() {
    if (!winner) return; // completed/walkover/DQ all resolve to an advancing side
    await record.mutateAsync({
      matchId: match.id,
      dto: {
        status,
        winner_entry_id: winner,
        score_a: status === 'completed' ? scoreA : null,
        score_b: status === 'completed' ? scoreB : null,
        notes: null,
      },
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl">Record result</SheetTitle>
          <SheetDescription className="text-sm">
            {aName} <span className="px-1 text-muted-foreground">vs</span> {bName}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Outcome — big segmented control */}
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => {
              const active = status === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-1 py-2 text-center text-sm font-semibold transition-colors active:scale-[0.98]',
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-border bg-card text-foreground'
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {/* Scores — only for a played match */}
          {status === 'completed' && (
            <div className="grid grid-cols-2 gap-3">
              <ScoreStepper
                name={aName}
                score={scoreA}
                onChange={setScoreA}
                isWinner={!!aId && winner === aId}
              />
              <ScoreStepper
                name={bName}
                score={scoreB}
                onChange={setScoreB}
                isWinner={!!bId && winner === bId}
              />
            </div>
          )}

          {/* Winner — big two-way toggle. Auto-picked from the score, tap to override. */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {isDq ? 'Advancing side (the non-DQ side)' : 'Winner'}
              {status === 'completed' && manualWinner === null && suggested && (
                <span className="ml-1 text-xs text-emerald-600">· auto from score</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: aId, name: aName },
                { id: bId, name: bName },
              ].map((side, i) => {
                const selected = !!side.id && winner === side.id;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!side.id}
                    onClick={() => side.id && setManualWinner(side.id)}
                    className={cn(
                      'flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 px-2 py-3 text-center text-base font-semibold transition-colors active:scale-[0.98] disabled:opacity-40',
                      selected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-border bg-card text-foreground'
                    )}
                  >
                    {selected && <Check className="h-5 w-5 shrink-0" strokeWidth={3} />}
                    <span className="truncate">{side.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <button
            type="button"
            onClick={submit}
            disabled={record.isPending || !winner}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-semibold text-white transition-colors active:scale-[0.99] disabled:opacity-50"
          >
            {record.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
            Save result
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={record.isPending}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-border text-base font-medium text-foreground active:scale-[0.99] disabled:opacity-50"
          >
            Cancel
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
