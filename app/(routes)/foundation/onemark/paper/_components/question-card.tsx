'use client';

// One question in the preview: Tamil block then English block (PRD §1.2),
// option layout resolved from the data (PRD §4.5), and the four controls —
// swap, lock, edit, drop. The edit dialog writes a copy-on-write override
// (decision 14); the master bank is never touched from here.

import { useState } from 'react';
import { Lock, LockOpen, Pencil, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  JABT_LEVEL_LABELS,
  levelOf,
  resolveOptionLayout,
  type OptionRow,
  type PreviewLanguage,
  type QuestionOverride,
  type ResolvedQuestion,
} from '@/lib/services/onemark/paper-service';

interface QuestionCardProps {
  question: ResolvedQuestion;
  language: PreviewLanguage;
  canSeeAnswers: boolean;
  disabled: boolean;
  exhaustedReason: string | null;
  onSwap: () => void;
  onLock: (locked: boolean) => void;
  onDrop: () => void;
  onOverride: (fields: QuestionOverride | null) => void;
}

function OptionList({ options, layout }: { options: OptionRow[]; layout: ReturnType<typeof resolveOptionLayout> }) {
  const cls =
    layout === 'inline_4'
      ? 'flex flex-wrap gap-x-6 gap-y-1'
      : layout === 'inline_2x2'
        ? 'grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2'
        : 'flex flex-col gap-1';
  return (
    <ol className={cls}>
      {options.map((o) => (
        <li key={o.key} className="text-sm text-foreground">
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">({(o.key ?? '').toLowerCase()})</span>
          {o.text}
        </li>
      ))}
    </ol>
  );
}

export function QuestionCard({ question: q, language, canSeeAnswers, disabled, exhaustedReason, onSwap, onLock, onDrop, onOverride }: QuestionCardProps) {
  const [editing, setEditing] = useState(false);
  const ov = q.override ?? {};
  const stemEn = ov.stem ?? q.stem;
  const stemTa = ov.stem_ta ?? q.stem_ta;
  const optionsEn = ov.options ?? q.options;
  const optionsTa = ov.options_ta ?? q.options_ta;
  const layout = resolveOptionLayout(q.option_layout, optionsEn, q.tags);
  const showTa = language !== 'en';
  const showEn = language !== 'ta';
  // fp_items.answer has been written as {correct:'A'} (the console) and as
  // {index:1} (seeded banks); show the letter either way.
  const correct = (() => {
    if (!canSeeAnswers || !q.answer || typeof q.answer !== 'object') return '';
    const a = q.answer as { correct?: unknown; index?: unknown };
    if (typeof a.correct === 'string') return a.correct;
    if (typeof a.index === 'number') return optionsEn[a.index]?.key ?? String(a.index);
    return '';
  })();

  return (
    <article
      className={[
        'rounded-lg border p-3 sm:p-4',
        q.locked ? 'border-[#0b6d41]/60 bg-[#0b6d41]/5' : 'border-border',
      ].join(' ')}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">Q{q.position}</span>
        {q.chapter_name ? <span>{q.chapter_name}</span> : <span className="italic">no chapter (general)</span>}
        <span>·</span>
        <span>{JABT_LEVEL_LABELS[levelOf(q)]}</span>
        {q.tags.length > 0 && (
          <>
            <span>·</span>
            <span className="font-mono">{q.tags.join(', ')}</span>
          </>
        )}
        {q.source_key && (
          <>
            <span>·</span>
            <span className="font-mono">
              {q.source_key}
              {q.source_year ? ` ${q.source_year}` : ''}
            </span>
          </>
        )}
        {q.override && <span className="rounded-full border border-amber-500/50 px-1.5 text-amber-700 dark:text-amber-400">edited for this paper</span>}
        {q.locked && <span className="rounded-full border border-[#0b6d41]/50 px-1.5 text-[#0b6d41]">locked</span>}
      </div>

      {q.lock_warning && (
        <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-foreground">
          Locked, but {q.lock_warning.join(' and ')}. Kept on the paper.
        </p>
      )}

      <div className="space-y-2">
        {showTa && (
          <div className="space-y-1">
            {stemTa ? (
              <p className="text-sm text-foreground">{stemTa}</p>
            ) : (
              <p className="text-xs italic text-muted-foreground">Tamil text not yet entered for this question.</p>
            )}
            {optionsTa && optionsTa.length > 0 && <OptionList options={optionsTa} layout={layout} />}
          </div>
        )}
        {showEn && (
          <div className="space-y-1">
            <p className="text-sm text-foreground">{stemEn}</p>
            <OptionList options={optionsEn} layout={layout} />
          </div>
        )}
      </div>

      {canSeeAnswers && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Key: ({correct.toLowerCase() || '?'})</span>
          {(ov.explanation ?? q.explanation) && <span> — {ov.explanation ?? q.explanation}</span>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || q.locked || exhaustedReason !== null}
          onClick={onSwap}
          title={q.locked ? 'Unlock to swap' : (exhaustedReason ?? 'Replace with another question from the same chapter, tag and level')}
        >
          <Repeat className="mr-1 h-3.5 w-3.5" />
          Swap
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onLock(!q.locked)} aria-pressed={q.locked}>
          {q.locked ? <LockOpen className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
          {q.locked ? 'Unlock' : 'Lock'}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled || q.locked} onClick={onDrop} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Drop
        </Button>
        {exhaustedReason && !q.locked && <span className="text-xs text-muted-foreground">{exhaustedReason}</span>}
      </div>

      <OverrideDialog
        open={editing}
        onOpenChange={setEditing}
        question={q}
        onSave={(fields) => {
          onOverride(fields);
          setEditing(false);
        }}
      />
    </article>
  );
}

function OverrideDialog({
  open,
  onOpenChange,
  question: q,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  question: ResolvedQuestion;
  onSave: (fields: QuestionOverride | null) => void;
}) {
  const ov = q.override ?? {};
  const [stem, setStem] = useState(ov.stem ?? q.stem);
  const [stemTa, setStemTa] = useState(ov.stem_ta ?? q.stem_ta ?? '');
  const [options, setOptions] = useState<OptionRow[]>(ov.options ?? q.options);
  const [optionsTa, setOptionsTa] = useState<OptionRow[]>(ov.options_ta ?? q.options_ta ?? []);

  function save() {
    const fields: QuestionOverride = {};
    if (stem.trim() !== q.stem) fields.stem = stem.trim();
    if (stemTa.trim() !== (q.stem_ta ?? '')) fields.stem_ta = stemTa.trim();
    if (JSON.stringify(options) !== JSON.stringify(q.options)) fields.options = options;
    if (optionsTa.length > 0 && JSON.stringify(optionsTa) !== JSON.stringify(q.options_ta ?? [])) fields.options_ta = optionsTa;
    onSave(Object.keys(fields).length === 0 ? null : fields);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Q{q.position} for this paper only</DialogTitle>
          <DialogDescription>
            The question bank keeps its original wording. What you change here prints on this paper and its answer key, nowhere else.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tamil stem</Label>
              <Textarea value={stemTa} onChange={(e) => setStemTa(e.target.value)} rows={3} />
            </div>
            {optionsTa.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tamil options</Label>
                {optionsTa.map((o, i) => (
                  <div key={o.key} className="flex items-center gap-2">
                    <span className="w-6 font-mono text-xs text-muted-foreground">({o.key.toLowerCase()})</span>
                    <Input value={o.text} onChange={(e) => setOptionsTa((prev) => prev.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>English stem</Label>
              <Textarea value={stem} onChange={(e) => setStem(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>English options</Label>
              {options.map((o, i) => (
                <div key={o.key} className="flex items-center gap-2">
                  <span className="w-6 font-mono text-xs text-muted-foreground">({o.key.toLowerCase()})</span>
                  <Input value={o.text} onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onSave(null)} disabled={!q.override}>
            Remove this paper&apos;s edit
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} className="bg-[#0b6d41] hover:bg-[#0a5c37]">
              Save for this paper
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
