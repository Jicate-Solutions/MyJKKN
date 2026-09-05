'use client';

// Step 3 — Preview. The paper as a numbered strip, the way it will print.
// Per question: lock (decision 12 — survives a scope change, flagged when it
// no longer matches), swap (chapter + tag + level held constant; disabled with
// the reason when nothing is left), edit (decision 14 — copy-on-write onto
// this paper only). Shortfall shows the real number and offers fewer or a wider
// scope; it never pads (decision 11). The answer key shows only when the API
// sent it, i.e. to a holder of foundation.items.manage.

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Lock, LockOpen, PenLine, RefreshCw, Shuffle, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  JABT_LEVEL_LABELS,
  applyOverride,
  boardShapeBands,
  type BoardShapeBand,
  levelOf,
  lockedOutsideScope,
  optionLetter,
  swapCandidates,
  swapDisabledReason,
  type BankItem,
  type PaperBank,
  type PaperConfig,
  type PreviewLanguage,
  type QuestionOverride,
} from '@/lib/services/onemark/paper-service';

interface StepPreviewProps {
  bank: PaperBank;
  config: PaperConfig;
  pool: BankItem[];
  byId: Map<string, BankItem>;
  disabled: boolean;
  busy: boolean;
  onGenerate: (reseed: boolean) => void;
  onToggleLock: (id: string) => void;
  onSwap: (id: string, replacementId: string) => void;
  onOverride: (id: string, override: QuestionOverride | null) => void;
  onManualToggle: (id: string) => void;
  onUseAvailable: (n: number) => void;
  onGoToScope: () => void;
}

function answerLetter(answer: unknown, options: string[]): string | null {
  if (answer === null || answer === undefined) return null;
  if (typeof answer === 'number') return optionLetter(answer);
  if (typeof answer === 'string') {
    const idx = options.findIndex((o) => o === answer);
    if (idx >= 0) return optionLetter(idx);
    if (/^[a-dA-D]$/.test(answer)) return answer.toLowerCase();
    return answer;
  }
  if (typeof answer === 'object' && answer !== null) {
    const a = answer as { index?: number; option?: string; value?: unknown };
    if (typeof a.index === 'number') return optionLetter(a.index);
    if (typeof a.option === 'string') return answerLetter(a.option, options);
    if (a.value !== undefined) return answerLetter(a.value, options);
  }
  return null;
}

function Bilingual({
  en,
  ta,
  lang,
  className,
}: {
  en: string;
  ta: string | null;
  lang: PreviewLanguage;
  className?: string;
}) {
  // 'both' shows Tamil when it exists and English always; 'ta' shows Tamil, or
  // the English with a marker when no Tamil has been written yet; 'en' shows
  // English only. No per-line placeholders in 'both' — a bank that is still
  // being translated would otherwise read as a wall of notes.
  const showTa = lang !== 'en' && Boolean(ta);
  const showEn = lang !== 'ta' || !ta;
  const missingTa = lang === 'ta' && !ta;
  return (
    <div className={cn('space-y-0.5', className)}>
      {showTa && (
        <p className="text-foreground" lang="ta">
          {ta}
        </p>
      )}
      {showEn && (
        <p className={cn(showTa ? 'text-muted-foreground' : 'text-foreground')}>
          {en}
          {missingTa && <span className="ml-1.5 text-[10px] italic text-muted-foreground">(Tamil not yet written)</span>}
        </p>
      )}
    </div>
  );
}

/** The band heading to print above `position`, if a band starts there. */
function bandLabel(bands: BoardShapeBand[], position: number): string | null {
  for (const b of bands) {
    if (b.from !== position) continue;
    const got = Math.max(0, b.to - b.from + 1);
    const range = got <= 1 ? `Q${b.from}` : `Q${b.from}–${b.to}`;
    const name = b.tag === 'pool' ? 'weighted pool' : b.tag;
    return got < b.want ? `${range} · ${name} · ${got} of ${b.want} in scope` : `${range} · ${name}`;
  }
  return null;
}

interface QuestionCardProps {
  position: number;
  item: BankItem;
  shown: BankItem;
  bank: PaperBank;
  config: PaperConfig;
  pool: BankItem[];
  disabled: boolean;
  busy: boolean;
  locked: boolean;
  outsideScope: boolean;
  edited: boolean;
  onToggleLock: () => void;
  onSwap: (replacementId: string) => void;
  onEdit: () => void;
}

function QuestionCard({
  position,
  item,
  shown,
  bank,
  config,
  pool,
  disabled,
  busy,
  locked,
  outsideScope,
  edited,
  onToggleLock,
  onSwap,
  onEdit,
}: QuestionCardProps) {
  const lang = config.params.preview_language;
  const topic = bank.topics.find((t) => t.id === item.topic_id);
  const tagLabel = new Map(bank.tags.map((t) => [t.key, t.label]));
  const candidates = swapCandidates(item, pool, config.selected_ids);
  const swapReason = swapDisabledReason(item, pool, config.selected_ids);
  const key = bank.can_see_answers ? answerLetter(shown.answer, shown.options) : null;
  const stacked = shown.option_layout === 'stacked' || (shown.option_layout === 'auto' && shown.options.some((o) => o.length > 40));

  return (
    <li className={cn('grid gap-3 px-4 py-4 sm:grid-cols-[44px_1fr_auto]', locked && 'bg-[#0b6d41]/[0.035]')}>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{position}.</div>
      <div className="min-w-0 space-y-2.5">
        <Bilingual en={shown.stem} ta={shown.stem_ta} lang={lang} className="text-sm leading-relaxed" />
        <ol className={cn('gap-x-6 gap-y-1 text-sm', stacked ? 'grid' : 'grid sm:grid-cols-2')}>
          {shown.options.map((opt, i) => {
            const isKey = key === optionLetter(i);
            return (
              <li key={i} className="flex gap-2">
                <span className={cn('font-mono text-xs', isKey ? 'font-semibold text-[#0b6d41]' : 'text-muted-foreground')}>
                  ({optionLetter(i)})
                </span>
                <Bilingual en={opt} ta={shown.options_ta?.[i] ?? null} lang={lang} className={cn(isKey && 'font-medium')} />
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {JABT_LEVEL_LABELS[levelOf(item)]}
          </Badge>
          {topic ? (
            <Badge variant="outline" className="text-[10px]">
              {topic.display_name}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Not tied to a lesson
            </Badge>
          )}
          {item.tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground">
              {tagLabel.get(t) ?? t}
            </Badge>
          ))}
          {item.source_year && <span className="font-mono text-[10px] text-muted-foreground">{item.source_year}</span>}
          {key && <span className="font-mono text-[10px] text-[#0b6d41]">key {key}</span>}
          {edited && (
            <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
              <PenLine className="h-3 w-3" /> edited on this paper
            </span>
          )}
        </div>
        {outsideScope && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-300/60 bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Locked, so it stays — but it no longer matches your current scope. Unlock it to let the next generation drop it.
          </p>
        )}
      </div>
      <div className="flex gap-1 sm:flex-col">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={locked ? 'default' : 'outline'}
                size="icon"
                className={cn('h-8 w-8', locked && 'bg-[#0b6d41] hover:bg-[#0a5c37]')}
                aria-label={locked ? `Unlock question ${position}` : `Lock question ${position}`}
                aria-pressed={locked}
                disabled={disabled || busy}
                onClick={onToggleLock}
              >
                {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{locked ? 'Locked — survives regeneration and scope changes' : 'Lock this question in place'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Swap question ${position}`}
                  disabled={disabled || busy || Boolean(swapReason)}
                  onClick={() => candidates.length > 0 && onSwap(candidates[0].id)}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              {swapReason ?? `Swap for one of ${candidates.length} on the same chapter, tag and level`}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label={`Edit the wording of question ${position}`}
                disabled={disabled || busy}
                onClick={onEdit}
              >
                <PenLine className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Edit the wording on this paper only</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </li>
  );
}

interface OverrideDialogProps {
  item: BankItem | null;
  override: QuestionOverride | undefined;
  onClose: () => void;
  onSave: (override: QuestionOverride | null) => void;
}

function OverrideDialog({ item, override, onClose, onSave }: OverrideDialogProps) {
  const shown = item ? applyOverride(item, override) : null;
  const [stem, setStem] = useState(shown?.stem ?? '');
  const [stemTa, setStemTa] = useState(shown?.stem_ta ?? '');
  const [options, setOptions] = useState<string[]>(shown?.options ?? []);
  const [optionsTa, setOptionsTa] = useState<string[]>(shown?.options_ta ?? (shown?.options ?? []).map(() => ''));

  if (!item || !shown) return null;
  const dirty =
    stem !== item.stem ||
    (stemTa || null) !== item.stem_ta ||
    options.some((o, i) => o !== item.options[i]) ||
    optionsTa.some((o, i) => (o || '') !== (item.options_ta?.[i] ?? ''));

  function save() {
    if (!item) return;
    const next: QuestionOverride = {};
    if (stem !== item.stem) next.stem = stem;
    if ((stemTa || null) !== item.stem_ta) next.stem_ta = stemTa || null;
    if (options.some((o, i) => o !== item.options[i])) next.options = options;
    const taChanged = optionsTa.some((o, i) => (o || '') !== (item.options_ta?.[i] ?? ''));
    if (taChanged) next.options_ta = optionsTa.every((o) => !o) ? null : optionsTa;
    onSave(Object.keys(next).length === 0 ? null : next);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit the wording</DialogTitle>
          <DialogDescription>
            These changes live on this paper only. The question bank keeps its own text.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ov-stem">Question (English)</Label>
            <Textarea id="ov-stem" rows={3} value={stem} onChange={(e) => setStem(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-stem-ta">Question (Tamil)</Label>
            <Textarea id="ov-stem-ta" rows={3} lang="ta" value={stemTa} onChange={(e) => setStemTa(e.target.value)} />
          </div>
          {options.map((opt, i) => (
            <div key={i} className="contents">
              <div className="space-y-1.5">
                <Label htmlFor={`ov-opt-${i}`}>Option ({optionLetter(i)}) English</Label>
                <Input
                  id={`ov-opt-${i}`}
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`ov-opt-ta-${i}`}>Option ({optionLetter(i)}) Tamil</Label>
                <Input
                  id={`ov-opt-ta-${i}`}
                  lang="ta"
                  value={optionsTa[i] ?? ''}
                  onChange={(e) => setOptionsTa(options.map((_, j) => (j === i ? e.target.value : optionsTa[j] ?? '')))}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={!override}
            onClick={() => onSave(null)}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Restore the bank&apos;s wording
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="bg-[#0b6d41] hover:bg-[#0a5c37]" disabled={!dirty} onClick={save}>
              Save to this paper
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StepPreview({
  bank,
  config,
  pool,
  byId,
  disabled,
  busy,
  onGenerate,
  onToggleLock,
  onSwap,
  onOverride,
  onManualToggle,
  onUseAvailable,
  onGoToScope,
}: StepPreviewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const manual = config.params.selection_mode === 'manual';
  const outside = useMemo(() => lockedOutsideScope(config.locked_ids, pool), [config.locked_ids, pool]);
  const lockedSet = new Set(config.locked_ids);
  const selected = config.selected_ids.map((id) => byId.get(id)).filter((x): x is BankItem => Boolean(x));
  const requested = config.params.question_count;
  const shortfall = config.shortfall && config.shortfall.available < config.shortfall.requested ? config.shortfall : null;
  const lang = config.params.preview_language;
  const [pickFilter, setPickFilter] = useState('');
  const bands = useMemo(
    () => (config.params.board_shape ? boardShapeBands(selected, requested) : []),
    [config.params.board_shape, selected, requested],
  );
  // An empty reserved band still deserves its heading — that IS the shortfall.
  const emptyBands = bands.filter((b) => b.tag !== 'pool' && b.to < b.from);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {selected.length} of {requested} on the paper
          {config.locked_ids.length > 0 && ` · ${config.locked_ids.length} locked`}
          {Object.keys(config.question_overrides).length > 0 && ` · ${Object.keys(config.question_overrides).length} edited`}
        </p>
        {!manual && !disabled && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onGenerate(false)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onGenerate(true)}>
              <Shuffle className="mr-1.5 h-3.5 w-3.5" />
              Shuffle again
            </Button>
          </div>
        )}
      </div>

      {shortfall && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">
              Only {shortfall.available} question{shortfall.available === 1 ? ' matches' : 's match'}
            </span>
            {' '}and you asked for {shortfall.requested}. Nothing is padded from outside the scope.
          </p>
          {!disabled && (
            <div className="flex shrink-0 gap-2">
              {shortfall.available > 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onUseAvailable(shortfall.available)}>
                  Use {shortfall.available}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={onGoToScope}>
                Widen the scope
              </Button>
            </div>
          )}
        </div>
      )}

      {selected.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground">
            {manual ? 'No questions picked yet.' : 'Nothing generated yet.'}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {manual
              ? 'Tick questions from the scoped bank below.'
              : pool.length === 0
                ? 'The scope holds no approved questions. Go back and widen it.'
                : 'Use Regenerate to draw a paper from the scope.'}
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border bg-card">
          {selected.map((item, idx) => {
            const position = idx + 1;
            const band = bandLabel(bands, position);
            const emptyHere = emptyBands.filter((b) => b.from === position);
            return (
              <div key={item.id}>
                {emptyHere.map((b) => (
                  <div
                    key={b.tag}
                    className="border-b border-border bg-amber-50/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                  >
                    {b.tag} · 0 of {b.want} in scope
                  </div>
                ))}
                {band && (
                  <div className="border-b border-border bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {band}
                  </div>
                )}
                <QuestionCard
                  position={position}
                  item={item}
                  shown={applyOverride(item, config.question_overrides[item.id])}
                  bank={bank}
                  config={config}
                  pool={pool}
                  disabled={disabled}
                  busy={busy}
                  locked={lockedSet.has(item.id)}
                  outsideScope={outside.has(item.id)}
                  edited={Boolean(config.question_overrides[item.id])}
                  onToggleLock={() => onToggleLock(item.id)}
                  onSwap={(rep) => onSwap(item.id, rep)}
                  onEdit={() => setEditing(item.id)}
                />
              </div>
            );
          })}
        </ol>
      )}

      {manual && !disabled && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Scoped bank — tick to add</h2>
            <Input
              value={pickFilter}
              onChange={(e) => setPickFilter(e.target.value)}
              placeholder="Filter by wording"
              className="w-56"
            />
          </div>
          <ul className="max-h-[480px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {pool
              .filter((it) => !pickFilter || `${it.stem} ${it.stem_ta ?? ''}`.toLowerCase().includes(pickFilter.toLowerCase()))
              .map((it) => {
                const on = config.selected_ids.includes(it.id);
                const topic = bank.topics.find((t) => t.id === it.topic_id);
                return (
                  <li key={it.id}>
                    <label className={cn('flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm hover:bg-muted/60', on && 'bg-[#0b6d41]/5')}>
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 accent-[#0b6d41]"
                        checked={on}
                        disabled={busy}
                        onChange={() => onManualToggle(it.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <Bilingual en={it.stem} ta={it.stem_ta} lang={lang} className="line-clamp-2" />
                        <span className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                          <span>{JABT_LEVEL_LABELS[levelOf(it)]}</span>
                          <span>· {topic?.display_name ?? 'Not tied to a lesson'}</span>
                          {it.tags.length > 0 && <span>· {it.tags.join(', ')}</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            {pool.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">The scope holds no approved questions.</li>
            )}
          </ul>
        </section>
      )}

      {editing && (
        <OverrideDialog
          key={editing}
          item={byId.get(editing) ?? null}
          override={config.question_overrides[editing]}
          onClose={() => setEditing(null)}
          onSave={(ov) => {
            onOverride(editing, ov);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
