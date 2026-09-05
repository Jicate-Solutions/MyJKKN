'use client';

// Step 4 — interactive preview (PRD §3.2): swap / lock / edit / drop, the
// decision-11 shortfall banner, decision-12 lock warnings, decision-14
// copy-on-write edits. Answers are shown only when the API sent them — to a
// paper builder (foundation.assessments.manage; Director ruling 2026-09-05),
// never on a learner-facing surface.

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { usePaperAction } from '@/hooks/onemark/use-paper';
import {
  JABT_LEVEL_LABELS,
  levelOf,
  type PaperDetail,
  type PaperParams,
  type QuestionOverride,
  type ResolvedQuestion,
} from '@/lib/services/onemark/paper-service';
import { QuestionCard } from './question-card';

interface StepPreviewProps {
  paper: PaperDetail;
  draft: PaperParams;
  act: ReturnType<typeof usePaperAction>;
  disabled: boolean;
}

export function StepPreview({ paper, draft, act, disabled }: StepPreviewProps) {
  const [exhausted, setExhausted] = useState<Record<string, string>>({});
  const report = paper.config.last_generation;
  const questions = paper.questions;
  const emptySlots = paper.empty_slots ?? [];
  const lockWarnings = questions.filter((q) => q.lock_warning && q.lock_warning.length > 0);
  const overridesCount = Object.keys(paper.config.question_overrides).length;
  // Two different shortfalls, two different cures (decisions 11 and 15):
  // the POOL cannot supply the count → a smaller count fixes it;
  // a RESERVED tag ran short → only wider filters or "board shape off" fixes it.
  const blueprintMissing = report?.blueprint_missing ?? 0;
  const lockMoves = report?.lock_moves ?? [];
  const boardConflicts = paper.board_conflicts ?? [];
  const poolShortfall = !!report && report.available < report.requested;
  const boardOn = draft.enforce_board_blueprint && paper.exam.config_key === 'tn_hsc_english';

  // Questions and gaps interleaved by printed position.
  const rows: ({ kind: 'q'; q: ResolvedQuestion } | { kind: 'gap'; position: number; tag_key: string })[] = [
    ...questions.map((q) => ({ kind: 'q' as const, q })),
    ...emptySlots.map((e) => ({ kind: 'gap' as const, position: e.position, tag_key: e.tag_key })),
  ].sort((a, b) => (a.kind === 'q' ? a.q.position : a.position) - (b.kind === 'q' ? b.q.position : b.position));

  async function run(action: Parameters<typeof act.mutateAsync>[0], ok?: string) {
    try {
      const r = await act.mutateAsync(action);
      if (r.swap_exhausted) {
        setExhausted((prev) => ({ ...prev, [r.swap_exhausted!.item_id]: r.swap_exhausted!.reason }));
        toast.warning(r.swap_exhausted.reason);
      } else if (ok) toast.success(ok);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update the paper');
    }
  }

  const levelTally = questions.reduce<Record<string, number>>((acc, q) => {
    const k = levelOf(q);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-foreground">
            {questions.length} of {draft.question_count} questions
            {report && report.available < draft.question_count && (
              <span className="text-muted-foreground"> · {report.available} available under these filters</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {Object.entries(levelTally)
              .sort()
              .map(([k, n]) => `${JABT_LEVEL_LABELS[k as keyof typeof JABT_LEVEL_LABELS].split(' · ')[0]} ${n}`)
              .join(' · ') || 'no questions yet'}
            {overridesCount > 0 && ` · ${overridesCount} edited for this paper only`}
            {paper.config.locked_ids.length > 0 && ` · ${paper.config.locked_ids.length} locked`}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => run({ action: 'generate' }, 'Regenerated — locked questions kept their slots')}>
          {act.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Regenerate unlocked
        </Button>
      </div>

      {report && poolShortfall && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            You asked for {report.requested}; these filters can supply {report.available}.
          </p>
          <p className="text-xs text-muted-foreground">Nothing is padded from other chapters, other sources, or unapproved drafts. Choose:</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={disabled || report.available < 1} onClick={() => run({ action: 'use_available' }, `Paper set to ${report.available} questions`)}>
              Use the {report.available} available
            </Button>
            <span className="self-center text-xs text-muted-foreground">or go back and widen the chapters, tags, sources or years.</span>
          </div>
        </div>
      )}

      {report && blueprintMissing > 0 && (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            The board shape cannot be filled from these chapters — {blueprintMissing} reserved slot{blueprintMissing === 1 ? ' stays' : 's stay'} empty
            {emptySlots.length > 0 ? ` (${emptySlots.map((e) => `Q${e.position}`).join(', ')})` : ''}.
          </p>
          <ul className="list-disc pl-6 text-xs text-foreground">
            {report.blueprint_shortfalls.map((b) => (
              <li key={b.tag_key}>
                Q{b.tag_key === 'synonyms' ? '1–3' : '4–6'} need {b.needed} {b.tag_key} question{b.needed === 1 ? '' : 's'}; {b.available} available.
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            A smaller count does not help — the empty slot is a reserved position, not a missing question. The paper cannot be finalised in board shape until it is filled.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || !boardOn}
              onClick={async () => {
                await run({ action: 'save', params: { enforce_board_blueprint: false } });
                await run({ action: 'generate' }, 'Board shape off — synonyms and antonyms are ordinary tags now');
              }}
            >
              Switch board shape off
            </Button>
            <span className="self-center text-xs text-muted-foreground">or go back and widen the chapters so more synonym and antonym questions qualify.</span>
          </div>
        </div>
      )}

      {lockMoves.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm" role="status">
          <p className="font-medium text-foreground">
            {lockMoves.length} locked question{lockMoves.length === 1 ? '' : 's'} moved to keep the board shape.
          </p>
          <ul className="mt-1 list-disc pl-6 text-xs text-muted-foreground">
            {lockMoves.map((m) => (
              <li key={m.item_id}>
                Q{m.from + 1} → Q{m.to + 1} — {m.reason}. Still locked.
              </li>
            ))}
          </ul>
        </div>
      )}

      {boardConflicts.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            The board shape is broken: {boardConflicts.map((c) => `Q${c.position} needs a ${c.tag_key} question`).join(', ')}.
          </p>
          <p className="text-xs text-muted-foreground">Regenerate the unlocked questions (unlock the one in that slot first) or switch board shape off. It cannot be finalised like this.</p>
        </div>
      )}

      {lockWarnings.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium text-foreground">
            {lockWarnings.length} locked question{lockWarnings.length === 1 ? '' : 's'} no longer match{lockWarnings.length === 1 ? 'es' : ''} your filters — kept anyway.
          </p>
          <p className="text-xs text-muted-foreground">A lock survives a filter change. Unlock a question to let the next regeneration replace it.</p>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
          No questions match. Widen the scope or filters, or wait for the bank to grow.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row) =>
            row.kind === 'gap' ? (
              <li key={`gap-${row.position}`}>
                <div className="rounded-lg border border-dashed border-destructive/50 bg-destructive/5 p-3 text-sm sm:p-4" role="note">
                  <span className="font-mono font-semibold text-foreground">Q{row.position}</span>
                  <span className="ml-2 text-foreground">— reserved for a {row.tag_key === 'antonyms' ? 'antonym' : row.tag_key === 'synonyms' ? 'synonym' : row.tag_key} question; none left under these filters.</span>
                  <p className="mt-1 text-xs text-muted-foreground">Kept empty on purpose — the board shape is not back-filled with grammar.</p>
                </div>
              </li>
            ) : (
              <li key={row.q.item_id}>
                <QuestionCard
                  question={row.q}
                  language={draft.preview_language}
                  canSeeAnswers={paper.can_see_answers}
                  disabled={disabled}
                  exhaustedReason={exhausted[row.q.item_id] ?? (row.q.swap_available ? null : 'No unused question left with the same chapter, tag and level.')}
                  onSwap={() => run({ action: 'swap', item_id: row.q.item_id })}
                  onLock={(locked) => run({ action: 'lock', item_id: row.q.item_id, locked })}
                  onDrop={() => run({ action: 'drop', item_id: row.q.item_id }, 'Dropped from this paper')}
                  onOverride={(fields: QuestionOverride | null) => run({ action: 'override', item_id: row.q.item_id, fields }, fields ? 'Saved for this paper only' : 'Edit removed')}
                />
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

export type { ResolvedQuestion };
