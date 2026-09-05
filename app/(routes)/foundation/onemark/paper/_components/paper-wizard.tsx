'use client';

// OneMark paper wizard — the orchestrator. Holds the working copy of the PRD
// §3.3 parameters, persists them on every step transition (PRD §3.2 "form
// state preservation"), and hands each step its slice.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaper, usePaperAction, usePaperReference } from '@/hooks/onemark/use-paper';
import {
  LEVEL_KEYS,
  type PaperParams,
  type WizardStep,
} from '@/lib/services/onemark/paper-service';
import { PaperPicker } from './paper-picker';
import { StepScope } from './step-scope';
import { StepFilters } from './step-filters';
import { StepQuantity } from './step-quantity';
import { StepPreview } from './step-preview';
import { StepOutput } from './step-output';

const STEPS: { n: WizardStep; label: string; hint: string }[] = [
  { n: 1, label: 'Scope', hint: 'Units and chapters' },
  { n: 2, label: 'Filters', hint: 'Tags, sources, years' },
  { n: 3, label: 'Quantity', hint: 'Count, JABT mix, series' },
  { n: 4, label: 'Preview', hint: 'Swap, lock, edit' },
  { n: 5, label: 'Output', hint: 'Print or publish' },
];

export function PaperWizard() {
  const router = useRouter();
  const search = useSearchParams();
  const paperId = search.get('paper');

  const paperQuery = usePaper(paperId);
  const paper = paperQuery.data ?? null;
  const referenceQuery = usePaperReference(paper?.exam.id ?? null);
  const reference = referenceQuery.data ?? null;
  const act = usePaperAction(paperId);

  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<PaperParams | null>(null);
  const [title, setTitle] = useState('');

  // Adopt the persisted state whenever a different paper is opened.
  useEffect(() => {
    if (!paper) return;
    setDraft(paper.config.params);
    setTitle(paper.title);
    setStep(paper.config.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  // On the preview / output steps nothing is being typed, so the server's
  // params are the truth — "use the N available" (decision 11) changes the
  // count server-side and the working copy must follow, or the next save
  // would put the old count back.
  useEffect(() => {
    if (!paper || step < 4) return;
    setDraft(paper.config.params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.updated_at]);

  const open = useCallback(
    (id: string | null) => {
      const url = id ? `/foundation/onemark/paper?paper=${encodeURIComponent(id)}` : '/foundation/onemark/paper';
      router.replace(url);
    },
    [router],
  );

  const patch = useCallback((p: Partial<PaperParams>) => {
    setDraft((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  const levelMixTotal = useMemo(
    () => (draft ? LEVEL_KEYS.reduce((s, k) => s + (draft.level_mix[k] ?? 0), 0) : 0),
    [draft],
  );
  const levelMixSet = levelMixTotal > 0;
  const levelMixBalanced = !levelMixSet || levelMixTotal === (draft?.question_count ?? 0);

  const busy = act.isPending;
  const finalized = paper?.config.state === 'FINALIZED';
  const published = !!paper?.config.outputs?.published_at;

  async function goTo(next: WizardStep) {
    if (!paper || !draft) return;
    try {
      if (next === 4 && step < 4) {
        if (!levelMixBalanced) {
          toast.error(`The level mix adds up to ${levelMixTotal}, not ${draft.question_count}.`);
          return;
        }
        await act.mutateAsync({ action: 'save', params: draft, step: 4, title });
        await act.mutateAsync({ action: 'generate' });
        setStep(4);
        return;
      }
      if (next === 5) {
        const r = await act.mutateAsync({ action: 'finalize' });
        setStep(5);
        toast.success(`Finalised — ${r.paper.questions.length} questions in order.`);
        return;
      }
      if (step === 5 && next < 5 && finalized && !published) {
        await act.mutateAsync({ action: 'reopen' });
      }
      await act.mutateAsync({ action: 'save', params: draft, step: next, title });
      setStep(next);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not move on');
    }
  }

  if (!paperId) {
    return <PaperPicker onOpen={open} />;
  }

  if (paperQuery.isLoading || !paper || !draft) {
    if (paperQuery.error) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="h-4 w-4" />
            {(paperQuery.error as Error).message}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => open(null)}>
            Back to your papers
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  // Decision 15: an empty reserved slot blocks "Confirm & finalise" here as
  // well as on the server — the board shape is never quietly abandoned.
  const boardGaps = draft.enforce_board_blueprint ? (paper.empty_slots?.length ?? 0) + (paper.board_conflicts?.length ?? 0) : 0;
  const canNext =
    !busy &&
    !published &&
    (step !== 4 || (paper.questions.length > 0 && boardGaps === 0)) &&
    (step !== 3 || levelMixBalanced) &&
    step < 5;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="grid grid-cols-5 gap-2" aria-label="Wizard steps">
        {STEPS.map((s) => {
          const done = s.n < step || (s.n === 5 && finalized);
          const active = s.n === step;
          return (
            <li key={s.n}>
              <button
                type="button"
                disabled={busy || s.n > step}
                onClick={() => s.n < step && goTo(s.n)}
                className={[
                  'flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-[#0b6d41] bg-[#0b6d41]/5'
                    : done
                      ? 'border-border hover:bg-muted'
                      : 'border-border opacity-60',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span
                    className={[
                      'grid h-4 w-4 place-items-center rounded-full text-[10px]',
                      done ? 'bg-[#0b6d41] text-white' : active ? 'bg-foreground text-background' : 'bg-muted',
                    ].join(' ')}
                  >
                    {done ? <Check className="h-2.5 w-2.5" /> : s.n}
                  </span>
                  {s.label}
                </span>
                <span className="hidden text-xs text-foreground sm:block">{s.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Identity line */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-w-0">
          <span className="text-muted-foreground">{paper.exam.display_name}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="font-medium text-foreground">{paper.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {published ? 'PUBLISHED' : paper.config.state}
          </span>
          <Button variant="ghost" size="sm" onClick={() => open(null)} disabled={busy}>
            All papers
          </Button>
        </div>
      </div>

      {published && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          This paper is published to a cohort. It can be printed again, but its questions, window and cohort are frozen — unpublish on the Output step to change them (possible until the first learner starts).
        </div>
      )}

      {/* Step body */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        {referenceQuery.isLoading || !reference?.exam_reference ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : step === 1 ? (
          <StepScope
            draft={draft}
            patch={patch}
            title={title}
            setTitle={setTitle}
            reference={reference.exam_reference}
            disabled={busy || published}
          />
        ) : step === 2 ? (
          <StepFilters
            draft={draft}
            patch={patch}
            reference={reference.exam_reference}
            sources={reference.sources}
            disabled={busy || published}
          />
        ) : step === 3 ? (
          <StepQuantity
            draft={draft}
            patch={patch}
            reference={reference.exam_reference}
            policies={reference.policies}
            disabled={busy || published}
          />
        ) : step === 4 ? (
          <StepPreview paper={paper} draft={draft} act={act} disabled={busy || published} />
        ) : (
          <StepOutput paper={paper} reference={reference.exam_reference} act={act} disabled={busy} />
        )}
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => goTo((step - 1) as WizardStep)}
          disabled={busy || step === 1 || published}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {step === 4 ? 'Back / edit filters' : 'Back'}
        </Button>
        {step < 5 && (
          <Button
            onClick={() => goTo((step + 1) as WizardStep)}
            disabled={!canNext}
            className="bg-[#0b6d41] hover:bg-[#0a5c37]"
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {step === 3 ? 'Preview the paper' : step === 4 ? 'Confirm & finalise' : 'Next'}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
