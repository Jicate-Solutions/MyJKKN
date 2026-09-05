'use client';

// Step 4 — Review. The paper's composition as numbers a Senior Learner can
// check against what they asked for, then the one irreversible act: finalize,
// which writes fp_assessment_items and freezes the question list.

import { Loader2, Lock, PenLine, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  JABT_LEVEL_LABELS,
  LEVEL_KEYS,
  levelOf,
  seriesLetters,
  type BankItem,
  type PaperBank,
  type PaperConfig,
} from '@/lib/services/onemark/paper-service';

interface StepReviewProps {
  bank: PaperBank;
  config: PaperConfig;
  byId: Map<string, BankItem>;
  onFinalize: () => void;
  finalizing: boolean;
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

export function StepReview({ bank, config, byId, onFinalize, finalizing }: StepReviewProps) {
  const items = config.selected_ids.map((id) => byId.get(id)).filter((x): x is BankItem => Boolean(x));
  const finalized = config.state === 'FINALIZED';
  const { params } = config;

  const byLevel = LEVEL_KEYS.map((k) => ({ k, n: items.filter((it) => levelOf(it) === k).length })).filter((x) => x.n > 0);
  const topicName = new Map(bank.topics.map((t) => [t.id, t.display_name]));
  const byChapter = new Map<string, number>();
  for (const it of items) {
    const key = it.topic_id ? topicName.get(it.topic_id) ?? 'Unmapped chapter' : 'Not tied to a lesson';
    byChapter.set(key, (byChapter.get(key) ?? 0) + 1);
  }
  const tagLabel = new Map(bank.tags.map((t) => [t.key, t.label]));
  const byTag = new Map<string, number>();
  for (const it of items) for (const t of it.tags) byTag.set(tagLabel.get(t) ?? t, (byTag.get(tagLabel.get(t) ?? t) ?? 0) + 1);

  const lockedCount = config.locked_ids.filter((id) => config.selected_ids.includes(id)).length;
  const editedCount = Object.keys(config.question_overrides).filter((id) => config.selected_ids.includes(id)).length;
  const short = config.shortfall && config.shortfall.available < config.shortfall.requested;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat value={items.length} label="questions" />
        <Stat value={seriesLetters(params.series_count, bank.policies.max_series).join(' ')} label="series" />
        <Stat
          value={
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-muted-foreground" />
              {lockedCount}
            </span>
          }
          label="locked"
        />
        <Stat
          value={
            <span className="flex items-center gap-1.5">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              {editedCount}
            </span>
          }
          label="edited on this paper"
        />
      </div>

      {short && (
        <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          You asked for {config.shortfall!.requested} and the scope holds {config.shortfall!.available}. The paper goes out with {items.length} — nothing was padded in from outside the scope.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">By JABT level</h2>
          <ul className="divide-y divide-border">
            {byLevel.map(({ k, n }) => (
              <li key={k} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-foreground">{JABT_LEVEL_LABELS[k]}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {n}
                  {params.level_mix[k] !== n && !params.board_shape && (
                    <span className="ml-1 text-[11px]">(asked {params.level_mix[k] ?? 0})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">By chapter</h2>
          <ul className="divide-y divide-border">
            {Array.from(byChapter.entries()).map(([name, n]) => (
              <li key={name} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate text-foreground">{name}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">By tag</h2>
          {byTag.size === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No tags on these questions.</p>
          ) : (
            <ul className="divide-y divide-border">
              {Array.from(byTag.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => (
                  <li key={name} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="truncate text-foreground">{name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-[#0b6d41]" />
            {finalized ? 'This paper is finalized' : 'Finalize the paper'}
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            {finalized
              ? `Question list frozen${config.finalized_at ? ` on ${new Date(config.finalized_at).toLocaleString()}` : ''}. Print or publish it from the Output step. To change questions, start a new paper.`
              : 'Writes the question order to the paper and freezes it. After this, the scope, shape and preview are read-only — edits to wording made here stay on this paper only.'}
          </p>
        </div>
        {!finalized && (
          <Button
            className="bg-[#0b6d41] hover:bg-[#0a5c37]"
            disabled={finalizing || items.length === 0}
            onClick={onFinalize}
          >
            {finalizing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Finalize {items.length} question{items.length === 1 ? '' : 's'}
          </Button>
        )}
      </section>
    </div>
  );
}
