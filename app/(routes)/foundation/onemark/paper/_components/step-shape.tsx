'use client';

// Step 2 — Shape. How many questions, the JABT level mix (decision 6 — there is
// no Easy / Medium / Hard here), how the count spreads across chapters, the
// English board shape switch (decision 15), series count (decision 16) and the
// preview language.

import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  BOARD_SHAPE_QUESTION_COUNT,
  BOARD_SHAPE_SLOTS,
  JABT_LEVEL_LABELS,
  LEVEL_KEYS,
  QUANTITY_PRESETS,
  levelOf,
  mixTotal,
  proportionalMix,
  seriesLetters,
  type BankItem,
  type LevelKey,
  type PaperBank,
  type PaperParams,
} from '@/lib/services/onemark/paper-service';

interface StepShapeProps {
  bank: PaperBank;
  params: PaperParams;
  setParams: (patch: Partial<PaperParams>) => void;
  pool: BankItem[];
  disabled: boolean;
}

export function StepShape({ bank, params, setParams, pool, disabled }: StepShapeProps) {
  const isEnglish = bank.exam.config_key === 'tn_hsc_english';
  const poolCounts = LEVEL_KEYS.reduce(
    (acc, k) => {
      acc[k] = pool.filter((it) => levelOf(it) === k).length;
      return acc;
    },
    {} as Record<LevelKey, number>,
  );
  const total = mixTotal(params.level_mix);
  const balanced = total === params.question_count;
  const maxBar = Math.max(1, ...LEVEL_KEYS.map((k) => poolCounts[k]));

  function setLevel(k: LevelKey, value: number) {
    const next = { ...params.level_mix, [k]: Math.max(0, Math.min(poolCounts[k], value)) };
    setParams({ level_mix: next });
  }

  function setCount(n: number) {
    const count = Math.max(1, Math.min(200, n));
    setParams({ question_count: count, level_mix: proportionalMix(pool, count) });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        {isEnglish && (
          <section className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <div>
              <Label htmlFor="board-shape" className="text-sm font-semibold text-foreground">
                Board shape
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                The Part-I frame the board uses: Q1–3 synonyms, Q4–6 antonyms, Q7–20 drawn by how often each category appears in past papers. Switch it off for a free-shape practice sheet.
              </p>
            </div>
            <Switch
              id="board-shape"
              checked={params.board_shape}
              disabled={disabled}
              onCheckedChange={(v) =>
                setParams({
                  board_shape: v,
                  question_count: v ? BOARD_SHAPE_QUESTION_COUNT : bank.policies.question_count,
                  level_mix: proportionalMix(pool, v ? BOARD_SHAPE_QUESTION_COUNT : bank.policies.question_count),
                })
              }
            />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Number of questions</h2>
          {params.board_shape ? (
            <p className="text-sm text-muted-foreground">
              Fixed at {BOARD_SHAPE_QUESTION_COUNT} by the board shape ({BOARD_SHAPE_SLOTS.map((s) => `${s.tag} Q${s.from}–${s.to}`).join(', ')}, pool Q7–20).
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {QUANTITY_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCount(n)}
                  className={cn(
                    'min-w-[52px] rounded-lg border px-3 py-1.5 font-mono text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    params.question_count === n
                      ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                      : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {n}
                  {n === bank.policies.question_count && <span className="sr-only"> (board standard)</span>}
                </button>
              ))}
              <div className="flex items-center gap-2">
                <Label htmlFor="custom-count" className="text-xs text-muted-foreground">
                  or
                </Label>
                <Input
                  id="custom-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  disabled={disabled}
                  className="w-20"
                  value={params.question_count}
                  onChange={(e) => setCount(Number(e.target.value) || 1)}
                />
              </div>
              <span className="text-xs text-muted-foreground">Board standard is {bank.policies.question_count}.</span>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">JABT level mix</h2>
              <p className="text-xs text-muted-foreground">
                How the {params.question_count} split across the six K levels. Starts as the same shape as your scoped bank.
                {params.board_shape && ' With the board shape on, the mix is a preference inside each slot, not a hard split.'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setParams({ level_mix: proportionalMix(pool, params.question_count) })}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Match the bank
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            {LEVEL_KEYS.map((k) => {
              const inBank = poolCounts[k];
              const value = params.level_mix[k] ?? 0;
              if (k === 'unlevelled' && inBank === 0) return null;
              return (
                <div
                  key={k}
                  className={cn(
                    'grid grid-cols-[150px_1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0',
                    k === 'unlevelled' && 'bg-muted/40',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">{JABT_LEVEL_LABELS[k]}</div>
                    <div className="font-mono text-[11px] tabular-nums text-muted-foreground">{inBank} in scope</div>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="absolute inset-y-0 left-0 bg-[#0b6d41]/25" style={{ width: `${(inBank / maxBar) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-[#0b6d41]" style={{ width: `${(Math.min(value, inBank) / maxBar) * 100}%` }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Fewer ${JABT_LEVEL_LABELS[k]}`}
                      disabled={disabled || value <= 0}
                      onClick={() => setLevel(k, value - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-8 text-center font-mono text-sm tabular-nums text-foreground">{value}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`More ${JABT_LEVEL_LABELS[k]}`}
                      disabled={disabled || value >= inBank}
                      onClick={() => setLevel(k, value + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p
            className={cn(
              'text-xs',
              balanced ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300',
            )}
            aria-live="polite"
          >
            {balanced
              ? `${total} of ${params.question_count} placed.`
              : total < params.question_count
                ? `${total} of ${params.question_count} placed — ${params.question_count - total} more to place, or they are drawn from any level.`
                : `${total} placed for a ${params.question_count}-question paper — the extra ${total - params.question_count} are dropped from the highest levels down.`}
          </p>
        </section>

        {!params.board_shape && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Spread across chapters</h2>
            <ToggleGroup
              type="single"
              value={params.distribution_mode}
              disabled={disabled}
              onValueChange={(v) => v && setParams({ distribution_mode: v as PaperParams['distribution_mode'] })}
              className="justify-start"
            >
              <ToggleGroupItem value="proportional" aria-label="In proportion to each chapter's bank">
                In proportion to the bank
              </ToggleGroupItem>
              <ToggleGroupItem value="equal" aria-label="As equal as the chapters allow">
                As equal as possible
              </ToggleGroupItem>
            </ToggleGroup>
          </section>
        )}
      </div>

      <aside className="h-fit space-y-6 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Series for the hall</Label>
          <p className="text-xs text-muted-foreground">
            Each series reorders the questions and re-letters the options. The answer key prints per series.
          </p>
          <ToggleGroup
            type="single"
            value={String(params.series_count)}
            disabled={disabled}
            onValueChange={(v) => v && setParams({ series_count: Number(v) })}
            className="justify-start"
          >
            {seriesLetters(4, bank.policies.max_series).map((_, i) => (
              <ToggleGroupItem key={i} value={String(i + 1)} aria-label={`${i + 1} series`} className="font-mono">
                {i + 1}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="font-mono text-[11px] text-muted-foreground">
            {seriesLetters(params.series_count, bank.policies.max_series).join(' · ')}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Preview language</Label>
          <ToggleGroup
            type="single"
            value={params.preview_language}
            disabled={disabled}
            onValueChange={(v) => v && setParams({ preview_language: v as PaperParams['preview_language'] })}
            className="justify-start"
          >
            <ToggleGroupItem value="ta" aria-label="Tamil">
              தமிழ்
            </ToggleGroupItem>
            <ToggleGroupItem value="en" aria-label="English">
              English
            </ToggleGroupItem>
            <ToggleGroupItem value="both" aria-label="Both languages">
              Both
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-[11px] text-muted-foreground">The printed paper always carries both; this only sets what you read here.</p>
        </div>
      </aside>
    </div>
  );
}
