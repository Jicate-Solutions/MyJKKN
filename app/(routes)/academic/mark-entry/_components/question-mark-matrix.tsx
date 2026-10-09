'use client';

import { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';
import { lockReasonFor, sumMarks } from '@/lib/utils/mark-entry/entry-rules';
import {
  FROZEN_LEFT,
  FROZEN_W,
  partColor,
  type EntryPart,
  type EntryQuestion,
  type LearnerEntry,
  type OtherComponent,
} from '@/types/mark-entry';

interface Props {
  questions: EntryQuestion[];
  parts: EntryPart[];
  learners: LearnerEntry[];
  componentLabel: string;
  componentMax: number;
  readOnly: boolean;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onChange: (studentId: string, questionId: string, value: number | null) => void;
  onToggleAbsent: (studentId: string, absent: boolean) => void;
  /**
   * The round's components the paper does NOT feed (e.g. Assignment). Each gets
   * one plain input column after the questions; the Total then becomes the round
   * total. Empty/omitted = the grid is exactly the question paper, as before.
   */
  otherComponents?: OtherComponent[];
  /** Ceiling for question total + other components. Only read when there are any. */
  roundMax?: number;
  onChangeOther?: (studentId: string, code: string, value: number | null) => void;
}

/** Question column: never narrower than COL_W, never stretched past COL_MAX_W. */
const COL_W = 62;
const COL_MAX_W = 132;
const ABS_W = 46;
const TOTAL_W = 84;
/** Question-paper subtotal column, shown only when other components follow it. */
const SUB_W = 72;
const OTHER_W = 92;
const FIXED_W = FROZEN_W.sno + FROZEN_W.register + FROZEN_W.name + ABS_W + TOTAL_W;
/** Height of the part band (header row 1) — row 2 sticks directly beneath it. */
const GROUP_H = 28;

/**
 * Desktop entry grid: learners down, questions across.
 *
 * Three layout traps live here, all of which look fine until you scroll:
 *
 *  1. **Frozen columns need PINNED widths.** Each column's `left` offset is the
 *     sum of the widths before it (FROZEN_LEFT). If a column is left to
 *     `table-layout: auto` it sizes to its content, drifts from that offset, and
 *     the frozen columns overlap. Every frozen cell therefore carries explicit
 *     width/minWidth/maxWidth, and names WRAP rather than `whitespace-nowrap` so
 *     a long name cannot widen the column. The `<colgroup>` pins the same widths
 *     for the fixed table layout; only the QUESTION columns are left unsized, so
 *     they alone share any spare width and the grid fills the screen.
 *  2. **The scroll container needs its own stacking context.** The app header is
 *     `sticky z-20`; sticky header cells at z-30/z-40 would paint over it.
 *     `isolate` keeps those z-indexes contained.
 *  3. **Every sticky cell needs an OPAQUE background.** A translucent tint (or a
 *     class Tailwind never generated) lets the rows scroll visibly through it.
 */
export function QuestionMarkMatrix({
  questions,
  parts,
  learners,
  componentLabel,
  componentMax,
  readOnly,
  isFullScreen,
  onToggleFullScreen,
  onChange,
  onToggleAbsent,
  otherComponents = [],
  roundMax = 0,
  onChangeOther,
}: Props) {
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  /** `columnKey` is a question id, or `c:<code>` for an other-component column. */
  const cellKey = (studentId: string, columnKey: string) => `${studentId}:${columnKey}`;
  const hasOthers = otherComponents.length > 0;
  const extraW = hasOthers ? SUB_W + otherComponents.length * OTHER_W : 0;

  const partIndex = useMemo(() => {
    const map = new Map<string, number>();
    parts.forEach((p, i) => map.set(p.part_label, i));
    return map;
  }, [parts]);

  /** Consecutive questions of one part, collapsed into a single header band. */
  const partGroups = useMemo(() => {
    const groups: { label: string; span: number; idx: number; hint: string | null }[] = [];
    for (const q of questions) {
      const last = groups[groups.length - 1];
      if (last && last.label === q.part_label) {
        last.span += 1;
        continue;
      }
      const part = parts.find((p) => p.part_label === q.part_label);
      groups.push({
        label: q.part_label,
        span: 1,
        idx: partIndex.get(q.part_label) ?? 0,
        hint: part?.num_to_answer != null ? `any ${part.num_to_answer} of ${part.group_count}` : null,
      });
    }
    return groups;
  }, [questions, parts, partIndex]);

  /** Enter moves DOWN the same column — the way a stack of scripts is graded. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, columnKey: string) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? -1 : 1;
      for (let i = rowIndex + step; i >= 0 && i < learners.length; i += step) {
        const next = inputRefs.current.get(cellKey(learners[i].student_id, columnKey));
        // Skip locked cells — they cannot receive a value, so stopping there
        // would strand the user mid-column.
        if (next && !next.disabled) {
          next.focus();
          next.select();
          return;
        }
      }
    },
    [learners]
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-sm',
        isFullScreen && 'fixed inset-0 z-50 rounded-none border-0 shadow-none'
      )}
    >
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5'>
          <p className='text-sm font-medium'>
            {learners.length} learner{learners.length === 1 ? '' : 's'}
            <span className='font-normal text-muted-foreground'>
              {' '}
              · {questions.length} question{questions.length === 1 ? '' : 's'}
            </span>
          </p>
          <div className='flex flex-wrap items-center gap-1.5'>
            {partGroups.map((g) => (
              <span
                key={g.label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  partColor(g.idx).chip
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', partColor(g.idx).dot)} />
                Part {g.label}
                {g.hint && <span className='font-normal opacity-75'>· {g.hint}</span>}
              </span>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-3'>
          <p className='hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex'>
            <kbd className='rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-foreground'>
              Enter
            </kbd>
            moves down the column
          </p>
          <Button variant='outline' size='sm' className='h-8 gap-1.5 px-2.5' onClick={onToggleFullScreen}>
            {isFullScreen ? (
              <>
                <Minimize2 className='h-3.5 w-3.5' /> Exit
              </>
            ) : (
              <>
                <Maximize2 className='h-3.5 w-3.5' /> Full screen
              </>
            )}
          </Button>
        </div>
      </div>

      {/* `isolate` contains the sticky z-indexes; min-w-0 keeps the wide table
          from stretching the page and dragging the frozen columns off-screen. */}
      <div
        className={cn(
          'isolate min-w-0 overflow-auto',
          isFullScreen ? 'h-[calc(100vh-3.25rem)]' : 'max-h-[70vh]'
        )}
      >
        {/* w-full + fixed layout: spare width goes to the unsized question columns.
            minWidth keeps them at COL_W when the paper is wider than the screen (the
            container scrolls instead); maxWidth stops a 3-question paper from
            spreading its inputs across a whole monitor. */}
        <table
          className='w-full border-separate border-spacing-0 text-sm'
          style={{
            tableLayout: 'fixed',
            minWidth: FIXED_W + extraW + questions.length * COL_W,
            maxWidth: FIXED_W + extraW + questions.length * COL_MAX_W,
          }}
        >
          <colgroup>
            <col style={{ width: FROZEN_W.sno }} />
            <col style={{ width: FROZEN_W.register }} />
            <col style={{ width: FROZEN_W.name }} />
            {questions.map((q) => (
              <col key={q.id} />
            ))}
            <col style={{ width: ABS_W }} />
            {hasOthers && <col style={{ width: SUB_W }} />}
            {otherComponents.map((c) => (
              <col key={c.code} style={{ width: OTHER_W }} />
            ))}
            <col style={{ width: TOTAL_W }} />
          </colgroup>
          <thead>
            {/* Row 1 — one band per part. The frozen, AB and Total heads span both rows. */}
            <tr>
              <Th left={FROZEN_LEFT.sno} width={FROZEN_W.sno} className='text-center'>
                #
              </Th>
              <Th left={FROZEN_LEFT.register} width={FROZEN_W.register}>
                Register No.
              </Th>
              <Th left={FROZEN_LEFT.name} width={FROZEN_W.name} className='border-r'>
                Learner
              </Th>

              {partGroups.map((g) => {
                const color = partColor(g.idx);
                return (
                  <th
                    key={g.label}
                    colSpan={g.span}
                    title={g.hint ? `Part ${g.label} — answer ${g.hint}` : `Part ${g.label}`}
                    className={cn(
                      'sticky top-0 z-30 px-2 py-0 text-left font-semibold',
                      color.group,
                      color.edge
                    )}
                    style={{ height: GROUP_H }}
                  >
                    <div className='flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] uppercase tracking-wide'>
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color.dot)} />
                      <span className='truncate'>Part {g.label}</span>
                      {g.hint && g.span > 2 && (
                        <span className='truncate font-normal normal-case tracking-normal opacity-70'>
                          · {g.hint}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              <th
                rowSpan={2}
                className='sticky top-0 z-30 border-b border-l bg-slate-50 px-1 py-1.5 text-center align-middle text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                style={{ width: ABS_W, minWidth: ABS_W, maxWidth: ABS_W }}
                title='Absent — the learner did not sit this assessment. Saved as grade AAA, which is a different fact from a zero.'
              >
                AB
              </th>

              {hasOthers && (
                <>
                  {/* What the question paper adds up to, before the other components. */}
                  <th
                    rowSpan={2}
                    className='sticky top-0 z-30 border-b border-l bg-slate-50 px-1 py-1.5 text-center align-middle text-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  >
                    <div className='truncate text-xs font-semibold'>{componentLabel}</div>
                    <div className='text-[10px] font-normal opacity-70'>out of {componentMax}</div>
                  </th>
                  <th
                    colSpan={otherComponents.length}
                    className='sticky top-0 z-30 border-l bg-slate-200 px-2 py-0 text-left font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                    style={{ height: GROUP_H }}
                    title='Components of this round that are not part of the question paper — one total per learner'
                  >
                    <div className='overflow-hidden whitespace-nowrap text-[11px] uppercase tracking-wide'>
                      <span className='truncate'>Other components</span>
                    </div>
                  </th>
                </>
              )}

              <th
                rowSpan={2}
                className='sticky right-0 top-0 z-40 border-b border-l bg-indigo-50 px-2 py-1.5 text-center align-middle text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100'
                style={{ width: TOTAL_W, minWidth: TOTAL_W, maxWidth: TOTAL_W }}
              >
                <div className='text-[10px] font-semibold uppercase tracking-wide opacity-70'>Total</div>
                <div className='truncate text-xs font-semibold'>{hasOthers ? 'Round' : componentLabel}</div>
                <div className='text-[10px] opacity-70'>out of {hasOthers ? roundMax : componentMax}</div>
              </th>
            </tr>

            {/* Row 2 — one cell per question, stuck directly under the part band. */}
            <tr>
              {questions.map((q, i) => {
                const idx = partIndex.get(q.part_label) ?? 0;
                const color = partColor(idx);
                const isPartStart = i === 0 || questions[i - 1].part_label !== q.part_label;
                const meta = [q.co_code, q.k_level].filter(Boolean).join(' · ');
                return (
                  <th
                    key={q.id}
                    title={q.question_text ? stripHtml(q.question_text) : undefined}
                    className={cn(
                      'sticky z-30 border-b px-1 py-1.5 align-top text-center font-medium',
                      color.header,
                      isPartStart && color.edge
                    )}
                    // 1px overlap with the band above so no sliver of a scrolling
                    // row can show between the two sticky rows.
                    style={{ top: GROUP_H - 1 }}
                  >
                    {q.is_choice_alternative && questions[i - 1]?.branch_id !== q.branch_id && (
                      // Sits on the divider between the two alternatives: "6a or 6b".
                      // Once per branch — a split alternative (6b i, 6b ii) shows it
                      // on its first sub-division only.
                      <span className='absolute left-0 top-1.5 -translate-x-1/2 rounded-full bg-amber-100 px-1 text-[9px] font-semibold uppercase leading-4 text-amber-800 ring-1 ring-amber-300'>
                        or
                      </span>
                    )}
                    <div className='text-xs font-semibold'>Q{q.label}</div>
                    <div className='text-[10px] opacity-70'>
                      {q.marks} mark{q.marks === 1 ? '' : 's'}
                    </div>
                    <div className='mt-0.5 truncate text-[9px] font-normal opacity-60'>{meta || '—'}</div>
                  </th>
                );
              })}
              {otherComponents.map((c) => (
                <th
                  key={c.code}
                  className='sticky z-30 border-b border-l bg-slate-50 px-1 py-1.5 align-top text-center font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  style={{ top: GROUP_H - 1 }}
                >
                  <div className='truncate text-xs font-semibold' title={c.name}>
                    {c.name}
                  </div>
                  <div className='text-[10px] opacity-70'>out of {c.max_marks}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {learners.map((learner, rowIndex) => {
              const paperTotal = sumMarks(learner.marks);
              const paperOver = componentMax > 0 && paperTotal > componentMax;
              const othersTotal = hasOthers
                ? otherComponents.reduce((s, c) => s + (learner.other_marks?.[c.code] ?? 0), 0)
                : 0;
              const hasOtherMark =
                hasOthers && otherComponents.some((c) => learner.other_marks?.[c.code] != null);
              // With other components the Total is the ROUND total; an absent
              // learner's paper counts as zero but their assignment still counts.
              const total = hasOthers ? (learner.is_absent ? 0 : paperTotal) + othersTotal : paperTotal;
              const over = hasOthers ? roundMax > 0 && total > roundMax : paperOver;
              const showAbsent = learner.is_absent && !hasOtherMark;
              return (
                <tr key={learner.student_id} className='group'>
                  <Td
                    left={FROZEN_LEFT.sno}
                    width={FROZEN_W.sno}
                    className='text-center text-xs tabular-nums text-muted-foreground group-focus-within:font-semibold group-focus-within:text-primary'
                  >
                    {rowIndex + 1}
                  </Td>
                  <Td left={FROZEN_LEFT.register} width={FROZEN_W.register} className='font-mono text-xs'>
                    {learner.register_number}
                  </Td>
                  <Td left={FROZEN_LEFT.name} width={FROZEN_W.name} className='border-r text-xs font-medium'>
                    {learner.student_name}
                  </Td>

                  {questions.map((q, i) => {
                    const idx = partIndex.get(q.part_label) ?? 0;
                    const color = partColor(idx);
                    const isPartStart = i === 0 || questions[i - 1].part_label !== q.part_label;
                    const lock = learner.is_absent
                      ? null
                      : lockReasonFor(q, questions, parts, learner.marks);
                    const value = learner.marks[q.id];
                    const invalid = value != null && value > q.marks;
                    return (
                      <td
                        key={q.id}
                        className={cn(
                          'border-b px-1 py-1 text-center',
                          color.cell,
                          isPartStart && color.edge
                        )}
                      >
                        <input
                          ref={(el) => {
                            const key = cellKey(learner.student_id, q.id);
                            if (el) inputRefs.current.set(key, el);
                            else inputRefs.current.delete(key);
                          }}
                          type='number'
                          inputMode='numeric'
                          step={1}
                          min={0}
                          max={q.marks}
                          disabled={readOnly || learner.is_absent || lock !== null}
                          value={learner.is_absent ? '' : (value ?? '')}
                          placeholder={learner.is_absent ? 'AB' : lock ? '—' : ''}
                          title={learner.is_absent ? 'Marked absent' : lockTitle(lock, q)}
                          aria-label={`${learner.register_number} Q${q.label}`}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, q.id)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') return onChange(learner.student_id, q.id, null);
                            const n = parseInt(raw, 10);
                            onChange(learner.student_id, q.id, Number.isFinite(n) ? n : null);
                          }}
                          className={cn(
                            'h-7 w-12 rounded-md border bg-background text-center text-xs font-medium tabular-nums shadow-sm transition-colors',
                            'focus:outline-none focus:ring-2',
                            // Up/Down already move between rows, so the native
                            // spinner only steals width from a 48px box.
                            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                            color.input,
                            color.focus,
                            q.is_choice_alternative && 'border-dashed',
                            (lock || learner.is_absent) &&
                              'cursor-not-allowed border-transparent bg-muted text-muted-foreground shadow-none',
                            invalid && 'border-red-500 text-red-600 ring-1 ring-red-500'
                          )}
                        />
                      </td>
                    );
                  })}

                  <td
                    className='border-b border-l px-1 py-1 text-center group-hover:bg-muted/60'
                    style={{ width: ABS_W, minWidth: ABS_W, maxWidth: ABS_W }}
                  >
                    <input
                      type='checkbox'
                      className='h-4 w-4 cursor-pointer rounded accent-slate-600'
                      disabled={readOnly}
                      checked={!!learner.is_absent}
                      aria-label={`Mark ${learner.register_number} absent`}
                      title='Absent — clears any marks entered for this learner'
                      onChange={(e) => onToggleAbsent(learner.student_id, e.target.checked)}
                    />
                  </td>

                  {hasOthers && (
                    <td className='border-b border-l bg-slate-50/60 px-1 py-1 text-center dark:bg-slate-900/40'>
                      <span
                        className={cn(
                          'font-mono text-xs font-semibold tabular-nums',
                          learner.is_absent
                            ? 'text-muted-foreground'
                            : paperOver
                              ? 'text-red-600'
                              : 'text-slate-700 dark:text-slate-200'
                        )}
                      >
                        {learner.is_absent ? 'AB' : Object.keys(learner.marks).length ? paperTotal : '—'}
                      </span>
                    </td>
                  )}

                  {otherComponents.map((c) => {
                    const value = learner.other_marks?.[c.code];
                    const invalid = value != null && (value > c.max_marks || value < 0);
                    const columnKey = `c:${c.code}`;
                    return (
                      <td key={c.code} className='border-b border-l px-1 py-1 text-center group-hover:bg-muted/60'>
                        <input
                          ref={(el) => {
                            const key = cellKey(learner.student_id, columnKey);
                            if (el) inputRefs.current.set(key, el);
                            else inputRefs.current.delete(key);
                          }}
                          type='number'
                          inputMode='numeric'
                          step={1}
                          min={0}
                          max={c.max_marks}
                          // Not tied to AB: a learner who missed the test can
                          // still have handed in the assignment.
                          disabled={readOnly}
                          value={value ?? ''}
                          aria-label={`${learner.register_number} ${c.name}`}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, columnKey)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') return onChangeOther?.(learner.student_id, c.code, null);
                            const n = parseInt(raw, 10);
                            onChangeOther?.(learner.student_id, c.code, Number.isFinite(n) ? n : null);
                          }}
                          className={cn(
                            'h-7 w-16 rounded-md border border-slate-300 bg-background text-center text-xs font-medium tabular-nums shadow-sm transition-colors dark:border-slate-700',
                            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25',
                            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                            readOnly && 'cursor-not-allowed bg-muted text-muted-foreground shadow-none',
                            invalid && 'border-red-500 text-red-600 ring-1 ring-red-500'
                          )}
                        />
                      </td>
                    );
                  })}

                  {/* Frozen on the right so the running total stays in view on a wide paper. */}
                  <td
                    className='sticky right-0 z-20 border-b border-l bg-indigo-50 px-2 py-1 text-center dark:bg-indigo-950'
                    style={{ width: TOTAL_W, minWidth: TOTAL_W, maxWidth: TOTAL_W }}
                  >
                    <span
                      className={cn(
                        'inline-flex min-w-[2.5rem] justify-center rounded-md px-1.5 py-0.5 font-mono text-sm font-semibold tabular-nums',
                        showAbsent
                          ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          : over
                            ? 'bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-300'
                            : 'text-indigo-700 dark:text-indigo-300'
                      )}
                    >
                      {showAbsent ? 'AB' : total}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Frozen-column header cell, spanning both header rows. z-40 so it beats the question heads. */
function Th({
  children,
  left,
  width,
  className,
}: {
  children: React.ReactNode;
  left: number;
  width: number;
  className?: string;
}) {
  return (
    <th
      rowSpan={2}
      className={cn(
        'sticky top-0 z-40 border-b bg-slate-50 px-2 py-1.5 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300',
        className
      )}
      style={{ left, width, minWidth: width, maxWidth: width }}
    >
      {children}
    </th>
  );
}

/** Frozen-column body cell. */
function Td({
  children,
  left,
  width,
  className,
}: {
  children: React.ReactNode;
  left: number;
  width: number;
  className?: string;
}) {
  return (
    <td
      className={cn(
        // Opaque background is required (hover included): a transparent frozen
        // cell lets the scrolling question columns show through underneath it.
        'sticky z-20 border-b bg-background px-2 py-1 align-middle group-hover:bg-muted',
        className
      )}
      style={{ left, width, minWidth: width, maxWidth: width }}
    >
      {children}
    </td>
  );
}

function lockTitle(lock: ReturnType<typeof lockReasonFor>, q: EntryQuestion): string {
  if (lock === 'or-sibling') return `Q${q.label} is an alternative — the other question in this choice is already answered`;
  if (lock === 'answer-limit') return `Part ${q.part_label} has reached its "answer any N" limit — clear another answer first`;
  return q.question_text ? stripHtml(q.question_text) : '';
}

/** Question text is sanitized HTML (rich editor + inline math); tooltips take plain text. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}
