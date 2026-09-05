'use client';

// OneMark paper wizard — the shell. Owns the config in memory, derives the
// scoped pool, runs the generator, and writes the whole config back to
// fp_assessments on every step change and on every preview action (lock,
// swap, edit, pick). The step components are presentational.
//
// State machine (config.state): DRAFT → PREVIEW (first generation) → EDITED
// (any lock / swap / edit / hand-pick) → FINALIZED (fp_assessment_items
// written; the server freezes the question list from then on).

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { FoundationHeader } from '../../../_components/foundation-header';
import { usePaper, usePaperBank, useUpdatePaper } from '@/hooks/onemark/use-paper';
import {
  BOARD_SHAPE_QUESTION_COUNT,
  filterBank,
  generatePaper,
  mixTotal,
  newSeed,
  normaliseConfig,
  proportionalMix,
  recentlyUsedIds,
  type BankItem,
  type PaperConfig,
  type PaperOutput,
  type PaperParams,
  type PaperStep,
  type QuestionOverride,
} from '@/lib/services/onemark/paper-service';
import { StepScope } from './step-scope';
import { StepShape } from './step-shape';
import { StepPreview } from './step-preview';
import { StepReview } from './step-review';
import { StepOutput } from './step-output';

const STEPS: { n: PaperStep; label: string; hint: string }[] = [
  { n: 1, label: 'Scope', hint: 'Chapters, tags, sources, years' },
  { n: 2, label: 'Shape', hint: 'Count, level mix, series' },
  { n: 3, label: 'Preview', hint: 'Generate, lock, swap, edit' },
  { n: 4, label: 'Review', hint: 'Check and finalize' },
  { n: 5, label: 'Output', hint: 'Print or publish' },
];

interface PaperWizardProps {
  paperId: string;
  onExit: () => void;
}

export function PaperWizard({ paperId, onExit }: PaperWizardProps) {
  const paperQuery = usePaper(paperId);
  const paper = paperQuery.data?.paper ?? null;
  const bankQuery = usePaperBank(paper?.exam_definition_id ?? null);
  const bank = bankQuery.data ?? null;
  const update = useUpdatePaper(paperId);

  // The saved config is the starting point; once the Senior Learner touches
  // anything, the local copy wins and a refetch cannot clobber it.
  const savedConfig = useMemo(
    () => (paper && bank ? normaliseConfig(paper.config, bank.exam.config_key, bank.policies) : null),
    [paper, bank],
  );
  const [localConfig, setLocalConfig] = useState<PaperConfig | null>(null);
  const config = localConfig ?? savedConfig;
  const setConfig = useCallback(
    (next: PaperConfig | ((prev: PaperConfig | null) => PaperConfig | null)) => {
      setLocalConfig((prev) => (typeof next === 'function' ? next(prev ?? savedConfig) : next));
    },
    [savedConfig],
  );

  const byId = useMemo(() => {
    const m = new Map<string, BankItem>();
    for (const it of bank?.items ?? []) m.set(it.id, it);
    return m;
  }, [bank]);

  const recentIds = useMemo(
    () => recentlyUsedIds(bank?.recent_papers ?? [], config?.params.exclude_recent_papers ?? 0),
    [bank, config?.params.exclude_recent_papers],
  );

  const pool = useMemo(
    () => (bank && config ? filterBank(bank.items, config.params, recentIds) : []),
    [bank, config, recentIds],
  );

  const finalized = config?.state === 'FINALIZED';

  // ---- persistence ---------------------------------------------------------

  const persist = useCallback(
    async (next: PaperConfig, extra?: { cohort_id?: string | null; finalize?: boolean }) => {
      setConfig(next);
      try {
        const res = await update.mutateAsync({ config: next, ...(extra ?? {}) });
        if (extra?.finalize && bank) {
          setConfig(normaliseConfig(res.paper.config, bank.exam.config_key, bank.policies));
        }
        return true;
      } catch (err: any) {
        toast.error(err?.message ?? 'Could not save the paper');
        return false;
      }
    },
    [update, bank, setConfig],
  );

  // ---- param edits ---------------------------------------------------------

  const setParams = useCallback(
    (patch: Partial<PaperParams>) => {
      setConfig((prev) => {
        if (!prev) return prev;
        const params = { ...prev.params, ...patch };
        // The English board shape has a fixed 20-question frame (decision 15).
        if (params.board_shape) params.question_count = BOARD_SHAPE_QUESTION_COUNT;
        return { ...prev, params };
      });
    },
    [setConfig],
  );

  /** The mix must add up to the count; when it does not (first visit, count
   *  change, scope change) fall back to the pool's own proportions. */
  const reconcileMix = useCallback(
    (c: PaperConfig): PaperConfig => {
      if (mixTotal(c.params.level_mix) === c.params.question_count) return c;
      return { ...c, params: { ...c.params, level_mix: proportionalMix(pool, c.params.question_count) } };
    },
    [pool],
  );

  // ---- generation & preview actions ---------------------------------------

  const runGenerate = useCallback(
    (c: PaperConfig, reseed: boolean): PaperConfig => {
      if (!bank) return c;
      const seed = reseed ? newSeed() : c.seed;
      const { selected_ids, shortfall } = generatePaper({
        pool,
        byId,
        params: c.params,
        lockedIds: c.locked_ids,
        weights: bank.weights,
        seed,
      });
      return {
        ...c,
        seed,
        selected_ids,
        shortfall,
        state: c.state === 'DRAFT' ? 'PREVIEW' : c.state,
      };
    },
    [bank, pool, byId],
  );

  function markEdited(c: PaperConfig): PaperConfig {
    return c.state === 'FINALIZED' ? c : { ...c, state: 'EDITED' };
  }

  async function handleGenerate(reseed: boolean) {
    if (!config) return;
    await persist(runGenerate(reconcileMix(config), reseed));
  }

  async function handleToggleLock(id: string) {
    if (!config || finalized) return;
    const locked = new Set(config.locked_ids);
    if (locked.has(id)) locked.delete(id);
    else locked.add(id);
    await persist(markEdited({ ...config, locked_ids: Array.from(locked) }));
  }

  async function handleSwap(id: string, replacementId: string) {
    if (!config || finalized) return;
    const selected_ids = config.selected_ids.map((x) => (x === id ? replacementId : x));
    const locked_ids = config.locked_ids.filter((x) => x !== id);
    await persist(markEdited({ ...config, selected_ids, locked_ids }));
  }

  async function handleOverride(id: string, override: QuestionOverride | null) {
    if (!config || finalized) return;
    const question_overrides = { ...config.question_overrides };
    if (override) question_overrides[id] = override;
    else delete question_overrides[id];
    await persist(markEdited({ ...config, question_overrides }));
  }

  async function handleManualToggle(id: string) {
    if (!config || finalized) return;
    const on = config.selected_ids.includes(id);
    const selected_ids = on ? config.selected_ids.filter((x) => x !== id) : [...config.selected_ids, id];
    const locked_ids = on ? config.locked_ids.filter((x) => x !== id) : config.locked_ids;
    const requested = config.params.question_count;
    const shortfall = selected_ids.length < requested ? { requested, available: selected_ids.length } : null;
    await persist(markEdited({ ...config, selected_ids, locked_ids, shortfall, state: config.state === 'DRAFT' ? 'EDITED' : config.state }));
  }

  async function handleUseAvailable(n: number) {
    if (!config || finalized) return;
    const params = { ...config.params, question_count: n, level_mix: proportionalMix(pool, n) };
    await persist(runGenerate({ ...config, params }, false));
  }

  async function handleMove(step: PaperStep, direction: 'back' | 'forward') {
    if (!config) return;
    let next: PaperConfig = { ...config, step };
    if (step === 2 && direction === 'forward') next = reconcileMix(next);
    if (step === 3 && direction === 'forward' && next.params.selection_mode === 'generate' && next.selected_ids.length === 0) {
      next = runGenerate(reconcileMix(next), false);
    }
    await persist(next);
  }

  async function handleFinalize() {
    if (!config || finalized) return;
    const ok = await persist({ ...config, step: 4 }, { finalize: true });
    if (ok) toast.success('Paper finalized');
  }

  async function handlePublish(output: PaperOutput, cohortId: string | null) {
    if (!config) return;
    const ok = await persist({ ...config, output }, { cohort_id: cohortId });
    if (ok) toast.success(output.published_at ? 'Published to the cohort' : 'Output settings saved');
  }

  // ---- render --------------------------------------------------------------

  if (paperQuery.isLoading || bankQuery.isLoading || (!config && !paperQuery.isError && !bankQuery.isError)) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (paperQuery.isError || bankQuery.isError || !paper || !bank || !config) {
    const err = (paperQuery.error ?? bankQuery.error) as Error | null;
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 md:px-8">
        <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {err?.message ?? 'This paper could not be opened.'}
        </p>
        <Button variant="outline" onClick={onExit}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to papers
        </Button>
      </div>
    );
  }

  const step = config.step;
  const subject = bank.exam.config_key === 'tn_hsc_english' ? 'English' : 'Physics';
  const canLeaveStep3 = config.selected_ids.length > 0;
  const saving = update.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <FoundationHeader
        title={paper.title}
        subtitle={`${subject} · Class 12 · Part I one-mark paper`}
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark' },
          { label: 'Papers', href: '/foundation/onemark/paper' },
          { label: paper.title },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {saving ? 'Saving…' : finalized ? 'Finalized' : 'Saved at every step'}
            </span>
            <Button variant="outline" size="sm" onClick={onExit}>
              <X className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          </div>
        }
      />

      {/* Stepper — a real sequence: each step's output feeds the next. */}
      <ol className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-1.5" aria-label="Wizard steps">
        {STEPS.map((s) => {
          const done = s.n < step || finalized;
          const active = s.n === step;
          const reachable = s.n <= step || (s.n === 4 && canLeaveStep3) || (s.n === 5 && finalized);
          return (
            <li key={s.n}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                onClick={() => reachable && s.n !== step && handleMove(s.n, s.n < step ? 'back' : 'forward')}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-[#0b6d41] text-white' : reachable ? 'hover:bg-muted' : 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold',
                    active
                      ? 'border-white/70 text-white'
                      : done
                        ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                        : 'border-muted-foreground/40 text-muted-foreground',
                  )}
                >
                  {done && !active ? <Check className="h-3 w-3" /> : s.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className={cn('hidden text-[11px] sm:block', active ? 'text-white/80' : 'text-muted-foreground')}>
                    {s.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <StepScope
          bank={bank}
          params={config.params}
          setParams={setParams}
          poolCount={pool.length}
          recentCount={recentIds.size}
          disabled={finalized}
        />
      )}
      {step === 2 && (
        <StepShape bank={bank} params={config.params} setParams={setParams} pool={pool} disabled={finalized} />
      )}
      {step === 3 && (
        <StepPreview
          bank={bank}
          config={config}
          pool={pool}
          byId={byId}
          disabled={finalized}
          busy={saving}
          onGenerate={handleGenerate}
          onToggleLock={handleToggleLock}
          onSwap={handleSwap}
          onOverride={handleOverride}
          onManualToggle={handleManualToggle}
          onUseAvailable={handleUseAvailable}
          onGoToScope={() => handleMove(1, 'back')}
        />
      )}
      {step === 4 && (
        <StepReview bank={bank} config={config} byId={byId} onFinalize={handleFinalize} finalizing={saving} />
      )}
      {step === 5 && (
        <StepOutput paper={paper} bank={bank} config={config} onPublish={handlePublish} publishing={saving} />
      )}

      <footer className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          disabled={step === 1 || saving}
          onClick={() => handleMove((step - 1) as PaperStep, 'back')}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        {step < 4 && (
          <Button
            className="bg-[#0b6d41] hover:bg-[#0a5c37]"
            disabled={saving || (step === 3 && !canLeaveStep3)}
            onClick={() => handleMove((step + 1) as PaperStep, 'forward')}
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {step === 2 ? 'Generate preview' : 'Next'}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
        {step === 4 && finalized && (
          <Button className="bg-[#0b6d41] hover:bg-[#0a5c37]" onClick={() => handleMove(5, 'forward')}>
            Output
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </footer>
    </div>
  );
}
