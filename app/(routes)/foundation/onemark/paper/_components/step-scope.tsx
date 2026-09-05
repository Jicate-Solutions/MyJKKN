'use client';

// Step 1 — Scope. What the paper may draw from: how questions are chosen,
// which chapters, which category tags, which sources, which board years, and
// whether recently used questions are held back. The live "N match" count is
// the honest number — decision 11 starts here.

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { PaperBank, PaperParams } from '@/lib/services/onemark/paper-service';

interface StepScopeProps {
  bank: PaperBank;
  params: PaperParams;
  setParams: (patch: Partial<PaperParams>) => void;
  poolCount: number;
  recentCount: number;
  disabled: boolean;
}

function Chip({
  on,
  onClick,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
        on
          ? 'border-[#0b6d41] bg-[#0b6d41]/10 text-[#0b6d41] dark:text-emerald-300'
          : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
}

export function StepScope({ bank, params, setParams, poolCount, recentCount, disabled }: StepScopeProps) {
  const isEnglish = bank.exam.config_key === 'tn_hsc_english';
  const chapterless = bank.items.filter((it) => it.topic_id === null).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">How the questions are chosen</h2>
          <RadioGroup
            value={params.selection_mode}
            onValueChange={(v) => setParams({ selection_mode: v as PaperParams['selection_mode'] })}
            disabled={disabled}
            className="grid gap-2 sm:grid-cols-2"
          >
            {[
              { v: 'generate', label: 'Generate', hint: 'The wizard draws to your level mix and chapter spread. You lock, swap and edit in the preview.' },
              { v: 'manual', label: 'Pick by hand', hint: 'You tick every question yourself from the scoped bank.' },
            ].map((opt) => (
              <label
                key={opt.v}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-3',
                  params.selection_mode === opt.v ? 'border-[#0b6d41] bg-[#0b6d41]/5' : 'border-border',
                )}
              >
                <RadioGroupItem value={opt.v} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Chapters</h2>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={disabled || params.topic_ids.length === 0}
              onClick={() => setParams({ topic_ids: [] })}
            >
              Every chapter
            </button>
          </div>
          {bank.topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chapters are mapped to this subject yet.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {bank.topics.map((t) => {
                const on = params.topic_ids.includes(t.id);
                const n = bank.items.filter((it) => it.topic_id === t.id).length;
                return (
                  <label
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm',
                      on ? 'border-[#0b6d41] bg-[#0b6d41]/5' : 'border-border hover:bg-muted/60',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-3.5 w-3.5 accent-[#0b6d41]"
                      checked={on}
                      disabled={disabled}
                      onChange={() => setParams({ topic_ids: toggle(params.topic_ids, t.id) })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{t.display_name}</span>
                      {t.description && <span className="block truncate text-[11px] text-muted-foreground">{t.description}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{n}</span>
                  </label>
                );
              })}
            </div>
          )}
          {isEnglish && chapterless > 0 && (
            <p className="text-xs text-muted-foreground">
              {chapterless} grammar question{chapterless === 1 ? ' is' : 's are'} not tied to any lesson and stay in scope whatever you tick here.
            </p>
          )}
          {params.topic_ids.length === 0 && bank.topics.length > 0 && (
            <p className="text-xs text-muted-foreground">Nothing ticked means every chapter.</p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Category tags</h2>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={disabled || params.tag_keys.length === 0}
              onClick={() => setParams({ tag_keys: [] })}
            >
              Any tag
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bank.tags.map((t) => (
              <Chip
                key={t.key}
                on={params.tag_keys.includes(t.key)}
                disabled={disabled}
                onClick={() => setParams({ tag_keys: toggle(params.tag_keys, t.key) })}
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Sources</h2>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={disabled || params.source_keys.length === 0}
              onClick={() => setParams({ source_keys: [] })}
            >
              Any source
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bank.sources.map((s) => (
              <Chip
                key={s.key}
                on={params.source_keys.includes(s.key)}
                disabled={disabled}
                onClick={() => setParams({ source_keys: toggle(params.source_keys, s.key) })}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="year-from">Board year from</Label>
            <Input
              id="year-from"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              disabled={disabled}
              value={params.year_from ?? ''}
              onChange={(e) => setParams({ year_from: e.target.value ? Number(e.target.value) : null })}
              placeholder="any"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year-to">Board year to</Label>
            <Input
              id="year-to"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              disabled={disabled}
              value={params.year_to ?? ''}
              onChange={(e) => setParams({ year_to: e.target.value ? Number(e.target.value) : null })}
              placeholder="any"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exclude-recent">Hold back questions from the last</Label>
            <div className="flex items-center gap-2">
              <Input
                id="exclude-recent"
                type="number"
                inputMode="numeric"
                min={0}
                max={10}
                disabled={disabled}
                className="w-20"
                value={params.exclude_recent_papers}
                onChange={(e) => setParams({ exclude_recent_papers: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
              />
              <span className="text-sm text-muted-foreground">finalized paper{params.exclude_recent_papers === 1 ? '' : 's'}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {params.exclude_recent_papers === 0
                ? 'Off — a question may repeat.'
                : recentCount === 0
                  ? 'Nothing to hold back yet.'
                  : `${recentCount} question${recentCount === 1 ? '' : 's'} held back.`}
            </p>
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">In scope</div>
        <div className="mt-2 font-mono text-4xl font-semibold tabular-nums text-foreground">{poolCount}</div>
        <div className="text-sm text-muted-foreground">
          approved question{poolCount === 1 ? '' : 's'} of {bank.items.length} in the {bank.exam.config_key === 'tn_hsc_english' ? 'English' : 'Physics'} bank
        </div>
        {bank.items.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            The bank is empty. Questions arrive once a subject Senior Learner approves drafts; the wizard never uses unapproved ones.
          </p>
        )}
        {poolCount < params.question_count && bank.items.length > 0 && (
          <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            Fewer than the {params.question_count} you are asking for. The wizard will not pad from outside this scope — widen it here or accept fewer in the preview.
          </p>
        )}
      </aside>
    </div>
  );
}
