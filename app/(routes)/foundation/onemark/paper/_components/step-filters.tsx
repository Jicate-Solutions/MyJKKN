'use client';

// Step 2 — category tag, source, year range, exclude-recent (PRD §3.3).
// No difficulty scale here or anywhere (decision 6): the level mix lives
// on step 3 as a JABT mix.

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExamReference, PaperParams, SourceRef } from '@/lib/services/onemark/paper-service';

interface StepFiltersProps {
  draft: PaperParams;
  patch: (p: Partial<PaperParams>) => void;
  reference: ExamReference;
  sources: SourceRef[];
  disabled: boolean;
}

export function StepFilters({ draft, patch, reference, sources, disabled }: StepFiltersProps) {
  const tagSet = new Set(draft.tag_keys);
  const sourceSet = new Set(draft.source_keys);
  const currentYear = new Date().getFullYear();

  function toggleTag(key: string) {
    const next = new Set(tagSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patch({ tag_keys: [...next] });
  }
  function toggleSource(key: string) {
    const next = new Set(sourceSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patch({ source_keys: [...next] });
  }
  function year(v: string): number | null {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Category tags</Label>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{tagSet.size === 0 ? 'all tags' : `${tagSet.size} selected`}</span>
            {tagSet.size > 0 && (
              <button type="button" disabled={disabled} onClick={() => patch({ tag_keys: [] })} className="underline-offset-2 hover:underline">
                clear
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {reference.tags.map((t) => {
            const on = tagSet.has(t.key);
            return (
              <button
                key={t.key}
                type="button"
                disabled={disabled}
                onClick={() => toggleTag(t.key)}
                aria-pressed={on}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  on ? 'border-[#0b6d41] bg-[#0b6d41] text-white' : 'border-border text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {t.label}
                <span className={['font-mono tabular-nums', on ? 'text-white/80' : 'text-muted-foreground'].join(' ')}>{t.pool_count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Leave every tag unselected to draw from all of them. The number is how many approved questions carry the tag.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Source</Label>
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <li key={s.key}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                  <Checkbox checked={sourceSet.size === 0 ? true : sourceSet.has(s.key)} disabled={disabled} onCheckedChange={() => toggleSource(s.key)} />
                  <span className="text-foreground">{s.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{s.key}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">All ticked = every source, including questions whose source was never recorded.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Source year range</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={2000}
                max={currentYear}
                placeholder={reference.years.min ? String(reference.years.min) : '2019'}
                value={draft.year_from ?? ''}
                disabled={disabled}
                onChange={(e) => patch({ year_from: e.target.value === '' ? null : year(e.target.value) })}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="number"
                inputMode="numeric"
                min={2000}
                max={currentYear}
                placeholder={reference.years.max ? String(reference.years.max) : String(currentYear)}
                value={draft.year_to ?? ''}
                disabled={disabled}
                onChange={(e) => patch({ year_to: e.target.value === '' ? null : year(e.target.value) })}
                className="w-28"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Blank = full range. Questions with no year pass any range.
              {reference.years.min !== null && ` The bank spans ${reference.years.min}–${reference.years.max}.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="onemark-exclude-recent">Exclude your recent papers</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled || draft.exclude_recent_tests <= 0}
                onClick={() => patch({ exclude_recent_tests: Math.max(0, draft.exclude_recent_tests - 1) })}
                className="h-9 w-9 rounded-md border border-border text-lg leading-none hover:bg-muted disabled:opacity-40"
                aria-label="Fewer"
              >
                −
              </button>
              <Input
                id="onemark-exclude-recent"
                type="number"
                inputMode="numeric"
                min={0}
                max={10}
                value={draft.exclude_recent_tests}
                disabled={disabled}
                onChange={(e) => patch({ exclude_recent_tests: Math.min(10, Math.max(0, year(e.target.value) ?? 0)) })}
                className="w-20 text-center"
              />
              <button
                type="button"
                disabled={disabled || draft.exclude_recent_tests >= 10}
                onClick={() => patch({ exclude_recent_tests: Math.min(10, draft.exclude_recent_tests + 1) })}
                className="h-9 w-9 rounded-md border border-border text-lg leading-none hover:bg-muted disabled:opacity-40"
                aria-label="More"
              >
                +
              </button>
              <span className="text-sm text-muted-foreground">previous papers (0–10)</span>
            </div>
            <p className="text-xs text-muted-foreground">Questions used on your last N papers for this subject are held back.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
