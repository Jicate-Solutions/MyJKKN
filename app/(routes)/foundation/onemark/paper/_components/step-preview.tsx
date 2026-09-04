'use client';

// Step 4 — interactive preview (PRD §3.2): swap / lock / edit / drop, the
// decision-11 shortfall banner, decision-12 lock warnings, decision-14
// copy-on-write edits. Answers are shown only when the API sent them, i.e.
// only to a holder of foundation.items.manage.

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
  const lockWarnings = questions.filter((q) => q.lock_warning && q.lock_warning.length > 0);
  const overridesCount = Object.keys(paper.config.question_overrides).length;

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

      {report && report.missing > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            You asked for {report.requested}; these filters can supply {report.available}.
          </p>
          {report.blueprint_shortfalls.length > 0 && (
            <ul className="list-disc pl-6 text-xs text-foreground">
              {report.blueprint_shortfalls.map((b) => (
                <li key={b.tag_key}>
                  Board shape needs {b.needed} {b.tag_key} question{b.needed === 1 ? '' : 's'} in these chapters; {b.available} available.
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Nothing is padded from other chapters, other sources, or unapproved drafts. Choose:</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={disabled || report.available < 1} onClick={() => run({ action: 'use_available' }, `Paper set to ${report.available} questions`)}>
              Use the {report.available} available
            </Button>
            <span className="self-center text-xs text-muted-foreground">or go back and widen the chapters, tags, sources or years.</span>
          </div>
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
          {questions.map((q) => (
            <li key={q.item_id}>
              <QuestionCard
                question={q}
                language={draft.preview_language}
                canSeeAnswers={paper.can_see_answers}
                disabled={disabled}
                exhaustedReason={exhausted[q.item_id] ?? (q.swap_available ? null : 'No unused question left with the same chapter, tag and level.')}
                onSwap={() => run({ action: 'swap', item_id: q.item_id })}
                onLock={(locked) => run({ action: 'lock', item_id: q.item_id, locked })}
                onDrop={() => run({ action: 'drop', item_id: q.item_id }, 'Dropped from this paper')}
                onOverride={(fields: QuestionOverride | null) => run({ action: 'override', item_id: q.item_id, fields }, fields ? 'Saved for this paper only' : 'Edit removed')}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export type { ResolvedQuestion };
