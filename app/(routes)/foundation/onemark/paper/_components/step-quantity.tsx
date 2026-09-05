'use client';

// Step 3 — quantity preset, distribution mode, the JABT level mix
// (decision 6 — never a difficulty scale), the English board shape
// (decision 15), series count (decision 16) and preview language.

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  JABT_LEVEL_LABELS,
  LEVEL_KEYS,
  QUANTITY_PRESETS,
  apportion,
  questionCountFor,
  type DistributionMode,
  type ExamReference,
  type LevelKey,
  type PaperParams,
  type PaperPolicies,
  type PreviewLanguage,
} from '@/lib/services/onemark/paper-service';

interface StepQuantityProps {
  draft: PaperParams;
  patch: (p: Partial<PaperParams>) => void;
  reference: ExamReference;
  policies: PaperPolicies;
  disabled: boolean;
}

const DISTRIBUTIONS: { value: DistributionMode; label: string; hint: string }[] = [
  { value: 'proportional', label: 'Proportional', hint: 'Bigger chapters get more questions' },
  { value: 'equal_per_chapter', label: 'Equal per chapter', hint: 'Same share for every chapter in scope' },
  { value: 'manual', label: 'Manual', hint: 'You set the count for each chapter' },
];

export function StepQuantity({ draft, patch, reference, policies, disabled }: StepQuantityProps) {
  const isEnglish = reference.exam.config_key === 'tn_hsc_english';
  // The board standard is a policy row per subject (onemark.paper.question_count[.<exam>]).
  const boardStandard = questionCountFor(reference.exam.config_key, policies);
  const poolTotal = reference.pool_total;

  const scopedChapters = useMemo(
    () => (draft.chapter_ids.length === 0 ? reference.chapters : reference.chapters.filter((c) => draft.chapter_ids.includes(c.id))),
    [draft.chapter_ids, reference.chapters],
  );

  const mixSet = LEVEL_KEYS.some((k) => (draft.level_mix[k] ?? 0) > 0);
  const mixTotal = LEVEL_KEYS.reduce((s, k) => s + (draft.level_mix[k] ?? 0), 0);
  const poolMix = useMemo(() => {
    const weights: Record<string, number> = {};
    for (const k of LEVEL_KEYS) weights[k] = reference.levels[k] ?? 0;
    return apportion(weights, draft.question_count) as Record<LevelKey, number>;
  }, [reference.levels, draft.question_count]);
  const shownMix = mixSet ? draft.level_mix : poolMix;

  function setLevel(k: LevelKey, n: number) {
    const next: PaperParams['level_mix'] = { ...(mixSet ? draft.level_mix : poolMix) };
    next[k] = Math.max(0, Math.min(draft.question_count, Math.round(n)));
    patch({ level_mix: next });
  }
  function balance() {
    const weights: Record<string, number> = {};
    for (const k of LEVEL_KEYS) weights[k] = shownMix[k] ?? 0;
    patch({ level_mix: apportion(weights, draft.question_count) as Record<LevelKey, number> });
  }

  const presets: { value: number | 'max'; label: string }[] = [
    ...QUANTITY_PRESETS.map((n) => ({ value: n, label: n === boardStandard ? `${n} (board standard)` : String(n) })),
    { value: 'max', label: `Max pool (${poolTotal})` },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Question quantity</Label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const value = p.value === 'max' ? Math.max(1, poolTotal) : p.value;
            const on = draft.question_count === value && (p.value !== 'max' || !QUANTITY_PRESETS.includes(value as (typeof QUANTITY_PRESETS)[number]));
            return (
              <button
                key={String(p.value)}
                type="button"
                disabled={disabled || (p.value === 'max' && poolTotal === 0)}
                onClick={() => patch({ question_count: value, level_mix: {} })}
                className={[
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  on ? 'border-[#0b6d41] bg-[#0b6d41] text-white' : 'border-border hover:bg-muted',
                ].join(' ')}
              >
                {p.label}
              </button>
            );
          })}
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={draft.question_count}
            disabled={disabled}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n)) patch({ question_count: Math.max(1, Math.min(200, n)), level_mix: {} });
            }}
            className="w-24"
            aria-label="Custom question count"
          />
        </div>
        {draft.question_count > poolTotal && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The whole approved pool holds {poolTotal} questions — the preview will show exactly how many your filters can supply, never padded.
          </p>
        )}
      </div>

      {isEnglish && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div className="text-sm">
            <span className="font-medium text-foreground">Board shape</span>
            <p className="text-xs text-muted-foreground">
              Q1–3 synonyms, Q4–6 antonyms, Q7 onward from the grammar pool weighted the way past papers were. Switch off for a free-shape practice sheet.
            </p>
          </div>
          <Switch checked={draft.enforce_board_blueprint} disabled={disabled} onCheckedChange={(v) => patch({ enforce_board_blueprint: v })} aria-label="Board shape" />
        </div>
      )}

      {!(isEnglish && draft.enforce_board_blueprint) && (
        <div className="space-y-2">
          <Label>Distribution across chapters</Label>
          <RadioGroup value={draft.distribution_mode} onValueChange={(v) => patch({ distribution_mode: v as DistributionMode })} className="grid gap-2 sm:grid-cols-3" disabled={disabled}>
            {DISTRIBUTIONS.map((d) => (
              <label
                key={d.value}
                className={[
                  'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  draft.distribution_mode === d.value ? 'border-[#0b6d41] bg-[#0b6d41]/5' : 'border-border hover:bg-muted',
                ].join(' ')}
              >
                <RadioGroupItem value={d.value} className="mt-0.5" />
                <span>
                  <span className="block font-medium text-foreground">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{d.hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {draft.distribution_mode === 'manual' && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {scopedChapters.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c.display_name}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={c.pool_count}
                    value={draft.chapter_counts[c.id] ?? 0}
                    disabled={disabled}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      patch({ chapter_counts: { ...draft.chapter_counts, [c.id]: Number.isFinite(n) ? Math.max(0, n) : 0 } });
                    }}
                    className="w-20 text-right"
                    aria-label={`Questions from ${c.display_name}`}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">/ {c.pool_count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>JABT level mix</Label>
          <div className="flex items-center gap-3 text-xs">
            <span className={['font-mono tabular-nums', mixSet && mixTotal !== draft.question_count ? 'text-destructive' : 'text-muted-foreground'].join(' ')}>
              {mixTotal || draft.question_count} / {draft.question_count}
            </span>
            {mixSet ? (
              <>
                <button type="button" disabled={disabled} onClick={balance} className="underline-offset-2 hover:underline">
                  balance to {draft.question_count}
                </button>
                <button type="button" disabled={disabled} onClick={() => patch({ level_mix: {} })} className="underline-offset-2 hover:underline">
                  follow the pool
                </button>
              </>
            ) : (
              <span className="text-muted-foreground">following the pool&apos;s own shape</span>
            )}
          </div>
        </div>
        <ul className="space-y-2">
          {LEVEL_KEYS.map((k) => {
            const inPool = reference.levels[k] ?? 0;
            const value = shownMix[k] ?? 0;
            return (
              <li key={k} className="grid grid-cols-[9rem_1fr_3rem_4rem] items-center gap-3 text-sm">
                <span className="truncate text-foreground">{JABT_LEVEL_LABELS[k]}</span>
                <Slider
                  value={[value]}
                  min={0}
                  max={Math.max(1, draft.question_count)}
                  step={1}
                  disabled={disabled || inPool === 0}
                  onValueChange={(v) => setLevel(k, v[0] ?? 0)}
                  aria-label={JABT_LEVEL_LABELS[k]}
                />
                <span className="text-right font-mono tabular-nums text-foreground">{value}</span>
                <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">of {inPool}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Knowledge levels from the JKKN Advanced Bloom&apos;s Taxonomy. &ldquo;Not yet levelled&rdquo; is an approved question whose reviewer has not set a level — it is not a difficulty.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Series variants for the hall</Label>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: policies.max_series }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => patch({ series_count: n })}
                className={[
                  'h-9 w-12 rounded-md border text-sm transition-colors',
                  draft.series_count === n ? 'border-[#0b6d41] bg-[#0b6d41] text-white' : 'border-border hover:bg-muted',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">
              {draft.series_count === 1 ? 'one paper (A)' : `papers ${['A', 'B', 'C', 'D'].slice(0, draft.series_count).join(' / ')}, each with its own answer key`}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Preview language</Label>
          <div className="flex items-center gap-1.5">
            {(['ta', 'en', 'both'] as PreviewLanguage[]).map((l) => (
              <button
                key={l}
                type="button"
                disabled={disabled}
                onClick={() => patch({ preview_language: l })}
                className={[
                  'h-9 rounded-md border px-3 text-sm transition-colors',
                  draft.preview_language === l ? 'border-[#0b6d41] bg-[#0b6d41] text-white' : 'border-border hover:bg-muted',
                ].join(' ')}
              >
                {l === 'ta' ? 'தமிழ்' : l === 'en' ? 'English' : 'Both'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
