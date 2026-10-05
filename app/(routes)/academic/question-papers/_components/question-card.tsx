'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Plus, Split, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionRichEditor } from '@/components/question-papers/question-rich-editor';
import { QuestionImageField } from '@/components/question-papers/question-image-field';
import { richTextToPlain, optionEditorValue } from '@/lib/utils/question-papers/rich-text';
import {
  newId, relabelSubs, romanLabel, subTotal, canSplit, MAX_SUB_QUESTIONS,
} from '@/lib/utils/question-papers/sub-questions';
import {
  problemAnchor, plainText, type PaperProblem,
} from '@/lib/utils/question-papers/validate-paper';
import { K_LEVELS, TAMIL_FONT_FAMILIES } from '@/types/ia-question-paper';
import type {
  IaPaperQuestion, IaQuestionImage, IaSubQuestion, IaTemplatePart,
} from '@/types/ia-question-paper';
import type { EditableQuestion, QuestionPatch } from './authoring-model';

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
  /** Nothing stands between this question and Submit — drives the green tick. */
  complete: boolean;
  /**
   * Submit problems keyed by the DOM anchor of the field each is about. Empty
   * until a Submit was actually blocked — a blank paper must not open in red.
   */
  problems: Map<string, PaperProblem[]>;
  /** The anchor "Fix" just jumped to, flashed for a moment. */
  flash: string | null;
  onPatch: (id: string, patch: QuestionPatch) => void;
}

/** Radix Select cannot hold an empty-string value, so "no font" needs a sentinel. */
const FONT_DEFAULT = '__default__';

/**
 * A field with a stable DOM id (so the Submit checklist's "Fix" can scroll to
 * it), the message when it has a problem, and a brief ring after a jump.
 * Module-level on purpose — defined inside the card it would remount every rich
 * editor on every keystroke.
 */
function FieldFrame({
  anchor, errors, flashing, className, children,
}: {
  anchor: string;
  errors?: PaperProblem[];
  flashing?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={anchor}
      className={cn(
        'rounded-md transition-shadow',
        flashing && 'ring-2 ring-rose-400 ring-offset-2',
        className
      )}
    >
      {children}
      {errors && errors.length > 0 && (
        <p className='mt-1 flex items-start gap-1 text-[11px] text-rose-700' role='alert'>
          <AlertTriangle className='mt-px h-3 w-3 shrink-0' />
          <span>{[...new Set(errors.map((e) => e.short))].join(' · ')}</span>
        </p>
      )}
    </div>
  );
}

export function QuestionCard({
  paperId, slot, edit, part, editable, coOptions, defaultFontFamily,
  complete, problems, flash, onPatch,
}: Props) {
  const subs = edit.sub_questions;
  const isSplit = subs.length > 0;
  const isMcq = !!edit.options && edit.options.length > 0;
  const budget = Number(edit.marks) || 0;
  const allocated = subTotal(subs);
  const balanced = allocated === budget && subs.every((s) => s.marks != null);
  // The template's per-part "Split questions" switch can turn splitting off.
  const splittable = canSplit(edit) && part?.allow_split !== false;

  const at = (anchor: string) => problems.get(anchor);
  const invalid = (anchor: string) => (problems.has(anchor) ? 'border-rose-400' : undefined);

  const textAnchor = problemAnchor(edit.id, 'question_text');
  const marksAnchor = problemAnchor(edit.id, 'marks');

  // ── Edits ────────────────────────────────────────────────────────────────
  //
  // Every handler a rich editor receives applies its change to the CURRENT
  // question (the updater form of onPatch), never to the `edit` this render saw.
  // QuestionRichEditor is memoised on what it shows, so a box keeps the handler it
  // was last rendered with — a handler that closed over `subs` or `edit.options`
  // would write an OLD copy of its siblings back and undo whatever was typed in
  // them since.

  /** "Split into (i)/(ii)": two halves of the marks, empty text, no CO / K-level. */
  const split = () => {
    const half = edit.marks != null ? Number(edit.marks) / 2 : null;
    const blank = (index: number): IaSubQuestion => ({
      id: newId(), label: romanLabel(index), question_text: '', marks: half,
      co_code: null, k_level: null, image: null, display_order: index + 1,
    });
    // The parent's own CO/K are cleared here as well as on save, so the card
    // never shows a value the next save is going to discard.
    onPatch(edit.id, { sub_questions: [blank(0), blank(1)], co_code: '', k_level: '' });
  };

  /** A later sub-division comes in with no marks, so the author allocates deliberately. */
  const addSub = () =>
    onPatch(edit.id, (cur) =>
      cur.sub_questions.length >= MAX_SUB_QUESTIONS
        ? {}
        : {
            sub_questions: relabelSubs([
              ...cur.sub_questions,
              {
                id: newId(), label: '', question_text: '', marks: null,
                co_code: null, k_level: null, image: null,
                display_order: cur.sub_questions.length + 1,
              },
            ]),
          }
    );

  const patchSub = (subId: string, patch: Partial<IaSubQuestion>) =>
    onPatch(edit.id, (cur) => ({
      sub_questions: cur.sub_questions.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
    }));

  const removeSub = (subId: string) =>
    onPatch(edit.id, (cur) => ({
      sub_questions: relabelSubs(cur.sub_questions.filter((s) => s.id !== subId)),
    }));

  /**
   * Every option keystroke writes BOTH shapes. `text_html` is what the author
   * typed; `text` is the plain mirror. The PDF renderer PREFERS `text_html`, so
   * updating one without the other makes an edit invisible in print.
   */
  const patchOption = (key: string, html: string) =>
    onPatch(edit.id, (cur) => ({
      options: (cur.options ?? []).map((o) =>
        o.key === key ? { ...o, text_html: html, text: richTextToPlain(html) } : o
      ),
    }));

  // ── CO + K-level ─────────────────────────────────────────────────────────
  // Shown on EVERY question: the completion rules require both regardless of the
  // template part's capture flags, so the selectors must always be reachable.

  const coKSelects = (
    coAnchor: string,
    kAnchor: string,
    co: string | null | undefined,
    k: string | null | undefined,
    onCo: (v: string) => void,
    onK: (v: string) => void
  ) => (
    <div className='flex items-start gap-1.5'>
      <FieldFrame anchor={coAnchor} errors={at(coAnchor)} flashing={flash === coAnchor} className='w-[92px]'>
        <Select value={co || ''} onValueChange={onCo}>
          <SelectTrigger className={cn('h-7 px-2 text-xs', invalid(coAnchor))} aria-label='Course Outcome'>
            <SelectValue placeholder='CO *' />
          </SelectTrigger>
          <SelectContent>
            {coOptions.map((o) => (
              <SelectItem key={o.value} value={o.value} className='text-xs'>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldFrame>
      <FieldFrame anchor={kAnchor} errors={at(kAnchor)} flashing={flash === kAnchor} className='w-[148px]'>
        <Select value={k || ''} onValueChange={onK}>
          <SelectTrigger className={cn('h-7 px-2 text-xs', invalid(kAnchor))} aria-label='K-level'>
            <SelectValue placeholder='K-level *' />
          </SelectTrigger>
          <SelectContent>
            {K_LEVELS.map((level) => (
              <SelectItem key={level.code} value={level.code} className='text-xs'>{level.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldFrame>
    </div>
  );

  const coKTags = (co: string | null | undefined, k: string | null | undefined) =>
    co || k ? (
      <span className='rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground'>
        {[co, k].filter(Boolean).join(' · ')}
      </span>
    ) : null;

  return (
    <>
      {/* A choice alternative (11 b) is the same card, indented and dashed, under
          an (OR) line. */}
      {slot.is_choice_alternative && (
        <div className='ml-6 flex items-center gap-2 text-[11px] font-medium text-muted-foreground'>
          <span className='h-px flex-1 bg-border' />
          (OR)
          <span className='h-px flex-1 bg-border' />
        </div>
      )}

      {/* data-qp-image-scope: Ctrl+V anywhere in this question attaches the
          screenshot here — see QuestionImageField. */}
      <div
        id={`qp-q-${edit.id}`}
        data-qp-image-scope
        className={cn(
          'rounded-md border bg-background',
          slot.is_choice_alternative && 'ml-6 border-dashed',
          problems.size > 0 && !complete && 'border-rose-300'
        )}
      >
        <div className='space-y-2 p-3'>
          {/* ── Number and marks on the left, CO + K-level on the right ───── */}
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <span className='flex items-center gap-2'>
              <span className='inline-flex items-center rounded-md border bg-muted/50 px-2 py-0.5 text-sm font-semibold tabular-nums'>
                Q{slot.question_number}
                {slot.sub_label ? ` ${slot.sub_label})` : ''}
              </span>
              <span className='text-xs text-muted-foreground'>
                {budget} {budget === 1 ? 'mark' : 'marks'}
              </span>
              {editable && complete && (
                <CheckCircle2 className='h-4 w-4 text-emerald-500' aria-label='Complete' />
              )}
            </span>
            {isSplit ? (
              <span className='text-[11px] text-muted-foreground'>CO and K-level per sub-division</span>
            ) : editable ? (
              coKSelects(
                problemAnchor(edit.id, 'co_code'),
                problemAnchor(edit.id, 'k_level'),
                edit.co_code,
                edit.k_level,
                (v) => onPatch(edit.id, { co_code: v }),
                (v) => onPatch(edit.id, { k_level: v })
              )
            ) : (
              coKTags(edit.co_code, edit.k_level)
            )}
          </div>

          {/* ── The question itself — or, once split, the optional common stem ── */}
          {!editable && plainText(edit.question_text) === '' ? (
            isSplit ? null : (
              <p className='text-sm italic text-muted-foreground'>Question not entered</p>
            )
          ) : (
            <FieldFrame anchor={textAnchor} errors={at(textAnchor)} flashing={flash === textAnchor}>
              <QuestionRichEditor
                // The placeholder is fixed when the editor is created, so the box
                // is remounted when a question turns into a stem (or back).
                key={isSplit ? 'stem' : 'question'}
                value={edit.question_text}
                disabled={!editable}
                defaultFontFamily={defaultFontFamily}
                placeholder={isSplit ? 'Common stem (optional)…' : 'Type the question…'}
                className={cn('text-sm', invalid(textAnchor))}
                onChange={(html) => onPatch(edit.id, { question_text: html })}
              />
            </FieldFrame>
          )}

          {(editable || edit.image) && (
            <QuestionImageField
              paperId={paperId}
              value={edit.image}
              disabled={!editable}
              onChange={(image) => onPatch(edit.id, { image })}
            />
          )}

          {/* ── MCQ options ──────────────────────────────────────────────── */}
          {isMcq && (
            <>
              <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                {edit.options!.map((opt) => {
                  const optAnchor = problemAnchor(edit.id, 'option', { optionKey: opt.key });
                  return (
                    <FieldFrame
                      key={opt.key}
                      anchor={optAnchor}
                      errors={at(optAnchor)}
                      flashing={flash === optAnchor}
                    >
                      <div className='flex items-start gap-2'>
                        <span className='mt-1.5 w-4 shrink-0 font-mono text-xs'>{opt.key})</span>
                        <QuestionRichEditor
                          variant='compact'
                          value={optionEditorValue(opt)}
                          disabled={!editable}
                          defaultFontFamily={edit.option_font || defaultFontFamily}
                          placeholder={`Option ${opt.key} *`}
                          className={cn('min-w-0 flex-1 text-sm', invalid(optAnchor))}
                          onChange={(html) => patchOption(opt.key, html)}
                        />
                      </div>
                    </FieldFrame>
                  );
                })}
              </div>

              <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                <label className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  Answer
                  <Select
                    value={edit.correct_option}
                    disabled={!editable}
                    onValueChange={(v) => onPatch(edit.id, { correct_option: v })}
                  >
                    <SelectTrigger className='h-7 w-[72px] px-2 text-xs' aria-label='Correct option'>
                      <SelectValue placeholder='—' />
                    </SelectTrigger>
                    <SelectContent>
                      {edit.options!.map((o) => (
                        <SelectItem key={o.key} value={o.key} className='text-xs'>
                          {o.key.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {/* Overrides the paper default for THIS question's options only. */}
                <label className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  Option font
                  <Select
                    value={edit.option_font ?? FONT_DEFAULT}
                    disabled={!editable}
                    onValueChange={(v) =>
                      onPatch(edit.id, { option_font: v === FONT_DEFAULT ? null : v })
                    }
                  >
                    <SelectTrigger className='h-7 w-[150px] px-2 text-xs' aria-label='Option font'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FONT_DEFAULT} className='text-xs'>Default</SelectItem>
                      {TAMIL_FONT_FAMILIES.map((f) => (
                        <SelectItem key={f.id} value={f.cssName} className='text-xs'>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </>
          )}

          {/* ── Sub-divisions (i), (ii) … ────────────────────────────────── */}
          {isSplit && (
            <div className='space-y-3 border-l-2 border-border pl-3'>
              {subs.map((sub) => {
                const subText = problemAnchor(edit.id, 'question_text', { subId: sub.id });
                const subMarks = problemAnchor(edit.id, 'marks', { subId: sub.id });
                return (
                  /* Its own paste scope: Ctrl+V inside this sub-division attaches
                     the screenshot to ITS figure, not the parent's. */
                  <div key={sub.id} data-qp-image-scope className='space-y-1.5'>
                    <div className='flex flex-wrap items-start justify-between gap-2'>
                      <span className='pt-1 text-xs font-semibold'>({sub.label})</span>
                      {editable ? (
                        <div className='flex items-start gap-1.5'>
                          <FieldFrame
                            anchor={subMarks}
                            errors={at(subMarks)}
                            flashing={flash === subMarks}
                            className='w-[76px]'
                          >
                            <Input
                              type='number'
                              min={0}
                              max={budget}
                              step='0.5'
                              className={cn('h-7 px-2 text-xs', invalid(subMarks))}
                              value={sub.marks ?? ''}
                              placeholder='Marks *'
                              aria-label={`Marks for sub-division ${sub.label}`}
                              onChange={(e) =>
                                patchSub(sub.id, {
                                  marks: e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                            />
                          </FieldFrame>
                          {coKSelects(
                            problemAnchor(edit.id, 'co_code', { subId: sub.id }),
                            problemAnchor(edit.id, 'k_level', { subId: sub.id }),
                            sub.co_code,
                            sub.k_level,
                            (v) => patchSub(sub.id, { co_code: v }),
                            (v) => patchSub(sub.id, { k_level: v })
                          )}
                          <Button
                            type='button'
                            size='icon'
                            variant='ghost'
                            className='h-7 w-7 text-muted-foreground hover:text-destructive'
                            aria-label={`Remove sub-division ${sub.label}`}
                            title='Remove this sub-division'
                            onClick={() => removeSub(sub.id)}
                          >
                            <X className='h-3.5 w-3.5' />
                          </Button>
                        </div>
                      ) : (
                        <span className='flex items-center gap-2'>
                          {sub.marks != null && (
                            <span className='text-xs text-muted-foreground'>
                              {sub.marks} {Number(sub.marks) === 1 ? 'mark' : 'marks'}
                            </span>
                          )}
                          {coKTags(sub.co_code, sub.k_level)}
                        </span>
                      )}
                    </div>

                    {!editable && plainText(sub.question_text) === '' ? (
                      <p className='text-sm italic text-muted-foreground'>Question not entered</p>
                    ) : (
                      <FieldFrame anchor={subText} errors={at(subText)} flashing={flash === subText}>
                        <QuestionRichEditor
                          variant='compact'
                          value={sub.question_text ?? ''}
                          disabled={!editable}
                          defaultFontFamily={defaultFontFamily}
                          placeholder='Type this sub-division…'
                          className={cn('text-sm', invalid(subText))}
                          onChange={(html) => patchSub(sub.id, { question_text: html })}
                        />
                      </FieldFrame>
                    )}

                    {(editable || sub.image) && (
                      <QuestionImageField
                        paperId={paperId}
                        value={sub.image}
                        disabled={!editable}
                        label={`Add image to (${sub.label})`}
                        onChange={(image: IaQuestionImage | null) => patchSub(sub.id, { image })}
                      />
                    )}
                  </div>
                );
              })}

              {editable && subs.length < MAX_SUB_QUESTIONS && (
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  className='h-7 px-2 text-xs'
                  title='Add another sub-division (i, ii, iii…)'
                  onClick={addSub}
                >
                  <Plus className='mr-1 h-3.5 w-3.5' />
                  Add sub-division
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Foot: marks (set by the template), and the split control ────── */}
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-b-md border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground'>
          <FieldFrame anchor={marksAnchor} errors={at(marksAnchor)} flashing={flash === marksAnchor}>
            <span>
              Marks: {budget}
              {isSplit && (
                <>
                  {' · '}
                  <span className={cn(!balanced && 'font-medium text-red-600')}>
                    sub-divisions {allocated} / {budget}
                  </span>
                </>
              )}
            </span>
          </FieldFrame>
          {editable && splittable && !isSplit && (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='h-6 px-2 text-xs'
              title={`Split this ${budget}-mark question into sub-divisions`}
              onClick={split}
            >
              <Split className='mr-1 h-3 w-3' />
              Split into (i)/(ii)
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
