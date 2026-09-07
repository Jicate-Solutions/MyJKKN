'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Split, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionRichEditor } from '@/components/question-papers/question-rich-editor';
import { QuestionImageField } from '@/components/question-papers/question-image-field';
import { richTextToPlain, optionEditorValue } from '@/lib/utils/question-papers/rich-text';
import {
  newId, relabelSubs, subTotal, canSplit, MAX_SUB_QUESTIONS,
} from '@/lib/utils/question-papers/sub-questions';
import { K_LEVELS } from '@/types/ia-question-paper';
import type {
  IaPaperQuestion, IaPaperQuestionOption, IaQuestionImage, IaSubQuestion, IaTemplatePart,
} from '@/types/ia-question-paper';
import type { EditableQuestion } from './authoring-model';

interface Props {
  paperId: string;
  /** The scaffolded slot — supplies the immutable identity (number, part, choice). */
  slot: IaPaperQuestion;
  /** The author's working copy of that slot. */
  edit: EditableQuestion;
  part?: IaTemplatePart;
  editable: boolean;
  /** CO dropdown options: the course's master, or CO1–CO6 when none are defined. */
  coOptions: { value: string; label: string }[];
  /** Paper-wide font, cascaded into every editor. */
  defaultFontFamily?: string | null;
  onPatch: (id: string, patch: Partial<EditableQuestion>) => void;
}

const K_OPTIONS = K_LEVELS.map((k) => ({ value: k.code, label: k.code }));

export function QuestionCard({
  paperId, slot, edit, part, editable, coOptions, defaultFontFamily, onPatch,
}: Props) {
  const subs = edit.sub_questions;
  const isSplit = subs.length > 0;
  const hasOptions = !!edit.options && edit.options.length > 0;
  const parentMarks = Number(edit.marks) || 0;
  const allocated = subTotal(subs);
  const balanced = isSplit && allocated === parentMarks;

  // capture_co / capture_klevel default to true — a part that never set them
  // still wants CO and K, which is what the completion validator assumes.
  const showCo = (part?.capture_co ?? true) && !isSplit;
  const showK = (part?.capture_klevel ?? true) && !isSplit;

  const prefix = useMemo(() => {
    const or = slot.is_choice_alternative ? '(OR) ' : '';
    const sub = slot.sub_label ? ` ${slot.sub_label})` : '';
    return `${or}Q${slot.question_number}${sub}`;
  }, [slot.is_choice_alternative, slot.question_number, slot.sub_label]);

  /**
   * First split seeds two halves of the parent budget — 15 → 8 + 7 — each
   * inheriting the parent's CO/K, because that is nearly always what the author
   * wants. Every LATER add comes in at 0 marks with no CO/K, so extending a split
   * is a deliberate allocation rather than a silent re-balance.
   */
  const addSub = () => {
    if (subs.length >= MAX_SUB_QUESTIONS) return;
    if (subs.length === 0) {
      const first = Math.ceil(parentMarks / 2);
      const seeded: IaSubQuestion[] = [
        {
          id: newId(), label: 'i', question_text: '', marks: first,
          co_code: edit.co_code || null, k_level: edit.k_level || null,
          image: null, display_order: 1,
        },
        {
          id: newId(), label: 'ii', question_text: '', marks: parentMarks - first,
          co_code: edit.co_code || null, k_level: edit.k_level || null,
          image: null, display_order: 2,
        },
      ];
      // The parent's own CO/K are nulled here as well as server-side, so the UI
      // never shows a value that the next save is going to discard.
      onPatch(edit.id, { sub_questions: seeded, co_code: '', k_level: '' });
      return;
    }
    onPatch(edit.id, {
      sub_questions: relabelSubs([
        ...subs,
        {
          id: newId(), label: '', question_text: '', marks: 0,
          co_code: null, k_level: null, image: null, display_order: subs.length + 1,
        },
      ]),
    });
  };

  const patchSub = (id: string, patch: Partial<IaSubQuestion>) =>
    onPatch(edit.id, {
      sub_questions: subs.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

  const removeSub = (id: string) =>
    onPatch(edit.id, { sub_questions: relabelSubs(subs.filter((s) => s.id !== id)) });

  /**
   * Every option keystroke writes BOTH shapes. `text_html` is what the author
   * typed; `text` is the plain mirror. The PDF renderer PREFERS `text_html`, so
   * updating one without the other makes an edit invisible in print.
   */
  const patchOption = (key: string, html: string) => {
    const options: IaPaperQuestionOption[] = (edit.options ?? []).map((o) =>
      o.key === key ? { ...o, text_html: html, text: richTextToPlain(html) } : o
    );
    onPatch(edit.id, { options });
  };

  return (
    <div
      className={cn(
        'rounded-md border p-3 space-y-2',
        slot.is_choice_alternative && 'ml-6 border-dashed'
      )}
    >
      {/* ── Row header: label, marks, split control ─────────────────────── */}
      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <span className='font-medium'>{prefix}</span>
        <span className='text-xs text-muted-foreground'>· {parentMarks} marks</span>

        {isSplit && (
          <Badge
            variant='outline'
            className={cn(
              'text-[11px] font-normal',
              balanced
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            )}
          >
            {subs.length} sub-division{subs.length === 1 ? '' : 's'} · {allocated}/{parentMarks}
          </Badge>
        )}

        <div className='ml-auto flex items-center gap-1'>
          {/* Only descriptive questions can be split — an MCQ's answer key would
              have nowhere to live. */}
          {editable && canSplit(edit) && (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='h-7 gap-1 px-2 text-xs'
              disabled={subs.length >= MAX_SUB_QUESTIONS}
              title={
                subs.length >= MAX_SUB_QUESTIONS
                  ? `A question can hold at most ${MAX_SUB_QUESTIONS} sub-divisions`
                  : 'Split this question into i. / ii. …'
              }
              onClick={addSub}
            >
              {isSplit ? <Plus className='h-3 w-3' /> : <Split className='h-3 w-3' />}
              {isSplit ? 'Add sub-division' : 'Split into sub-divisions'}
            </Button>
          )}
          {!isSplit && (
            <>
              <span className='text-xs text-muted-foreground'>Marks</span>
              {/* Marks come from the template — read-only for the author. */}
              <Input
                type='number'
                value={edit.marks ?? ''}
                readOnly
                tabIndex={-1}
                aria-label='Marks (set by template)'
                className='h-7 w-16 text-sm bg-muted/50 text-muted-foreground cursor-default'
              />
            </>
          )}
        </div>
      </div>

      {/* ── Question text (or the optional shared stem once split) ───────── */}
      <QuestionRichEditor
        value={edit.question_text}
        disabled={!editable}
        defaultFontFamily={defaultFontFamily}
        placeholder={
          isSplit
            ? 'Optional shared stem — e.g. "For the circuit shown below:" (leave blank to print nothing)'
            : 'Enter the question…'
        }
        onChange={(html) => onPatch(edit.id, { question_text: html })}
        className='text-sm'
      />

      <QuestionImageField
        paperId={paperId}
        value={edit.image}
        disabled={!editable}
        onChange={(image) => onPatch(edit.id, { image })}
      />

      {/* ── MCQ options ─────────────────────────────────────────────────── */}
      {hasOptions && (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
          {edit.options!.map((opt) => (
            <div key={opt.key} className='flex items-start gap-2'>
              <span className='mt-1.5 w-4 shrink-0 font-mono text-xs'>{opt.key})</span>
              <QuestionRichEditor
                variant='compact'
                value={optionEditorValue(opt)}
                disabled={!editable}
                defaultFontFamily={edit.option_font || defaultFontFamily}
                placeholder={`Option ${opt.key}`}
                onChange={(html) => patchOption(opt.key, html)}
                className='min-w-0 flex-1 text-sm'
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Answer key + CO / K ─────────────────────────────────────────── */}
      {(hasOptions || showCo || showK) && (
        <div className='flex flex-wrap items-center gap-3'>
          {hasOptions && (
            <LabeledSelect
              label='Answer'
              value={edit.correct_option}
              disabled={!editable}
              onChange={(v) => onPatch(edit.id, { correct_option: v })}
              options={edit.options!.map((o) => ({ value: o.key, label: o.key.toUpperCase() }))}
              placeholder='—'
            />
          )}
          {showCo && (
            <LabeledSelect
              label='CO'
              required
              value={edit.co_code}
              disabled={!editable}
              onChange={(v) => onPatch(edit.id, { co_code: v })}
              options={coOptions}
              placeholder='CO'
              editable={editable}
            />
          )}
          {showK && (
            <LabeledSelect
              label='K'
              required
              value={edit.k_level}
              disabled={!editable}
              onChange={(v) => onPatch(edit.id, { k_level: v })}
              options={K_OPTIONS}
              placeholder='K'
              editable={editable}
            />
          )}
        </div>
      )}

      {/* ── Sub-divisions ───────────────────────────────────────────────── */}
      {isSplit && (
        <div className='space-y-2 rounded-md border border-dashed p-2'>
          <div className='flex items-center justify-between text-xs'>
            <span className='font-medium text-muted-foreground'>Sub-divisions</span>
            <span className={balanced ? 'text-emerald-600' : 'text-red-600'}>
              {balanced
                ? `Allocated ${allocated} / ${parentMarks} ✓`
                : `⚠ Allocated ${allocated} / ${parentMarks} — must total ${parentMarks}`}
            </span>
          </div>

          {subs.map((sub) => (
            <div key={sub.id} className='space-y-2 rounded-md border bg-background p-2'>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <span className='w-6 font-medium'>{sub.label}.</span>
                <span className='text-xs text-muted-foreground'>Marks</span>
                <Input
                  type='number'
                  min={0}
                  max={parentMarks}
                  step={0.5}
                  value={sub.marks ?? ''}
                  disabled={!editable}
                  onChange={(e) =>
                    patchSub(sub.id, {
                      marks: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className='h-7 w-20 text-sm'
                />
                {(part?.capture_co ?? true) && (
                  <LabeledSelect
                    label='CO'
                    required
                    value={sub.co_code ?? ''}
                    disabled={!editable}
                    onChange={(v) => patchSub(sub.id, { co_code: v })}
                    options={coOptions}
                    placeholder='CO'
                    editable={editable}
                  />
                )}
                {(part?.capture_klevel ?? true) && (
                  <LabeledSelect
                    label='K'
                    required
                    value={sub.k_level ?? ''}
                    disabled={!editable}
                    onChange={(v) => patchSub(sub.id, { k_level: v })}
                    options={K_OPTIONS}
                    placeholder='K'
                    editable={editable}
                  />
                )}
                {editable && (
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='ml-auto h-7 w-7 p-0 text-destructive'
                    title={`Remove sub-division ${sub.label}`}
                    onClick={() => removeSub(sub.id)}
                  >
                    <X className='h-3.5 w-3.5' />
                  </Button>
                )}
              </div>

              <QuestionRichEditor
                value={sub.question_text ?? ''}
                disabled={!editable}
                defaultFontFamily={defaultFontFamily}
                placeholder={`Enter sub-division ${sub.label}…`}
                onChange={(html) => patchSub(sub.id, { question_text: html })}
                className='text-sm'
              />

              <QuestionImageField
                paperId={paperId}
                value={sub.image}
                disabled={!editable}
                label={`Add image to ${sub.label}.`}
                onChange={(image: IaQuestionImage | null) => patchSub(sub.id, { image })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LabeledSelect({
  label, value, disabled, onChange, options, placeholder, required, editable,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  editable?: boolean;
}) {
  // A required-but-empty field is outlined red only while the paper is still
  // editable — on a read-only paper the gap is history, not a task.
  const missing = required && !value && editable;
  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-xs text-muted-foreground'>
        {label}
        {required && <span className='text-destructive'> *</span>}
      </span>
      <Select value={value} onValueChange={onChange} disabled={disabled || options.length === 0}>
        <SelectTrigger className={cn('h-7 w-[90px] text-sm', missing && 'border-destructive')}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
