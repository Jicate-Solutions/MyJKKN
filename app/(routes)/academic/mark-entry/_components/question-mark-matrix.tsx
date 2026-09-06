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
}

const COL_W = 62;

/**
 * Desktop entry grid: learners down, questions across.
 *
 * Two layout traps live here, both of which look fine until you scroll:
 *
 *  1. **Frozen columns need PINNED widths.** Each column's `left` offset is the
 *     sum of the widths before it (FROZEN_LEFT). If a column is left to
 *     `table-layout: auto` it sizes to its content, drifts from that offset, and
 *     the frozen columns overlap. Every frozen cell therefore carries explicit
 *     width/minWidth/maxWidth, and names WRAP rather than `whitespace-nowrap` so
 *     a long name cannot widen the column.
 *  2. **The scroll container needs its own stacking context.** The app header is
 *     `sticky z-20`; sticky header cells at z-30/z-40 would paint over it.
 *     `isolate` keeps those z-indexes contained.
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
}: Props) {
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const cellKey = (studentId: string, questionId: string) => `${studentId}:${questionId}`;

  const partIndex = useMemo(() => {
    const map = new Map<string, number>();
    parts.forEach((p, i) => map.set(p.part_label, i));
    return map;
  }, [parts]);

  /** Enter moves DOWN the same question — the way a stack of scripts is graded. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, question: EntryQuestion) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? -1 : 1;
      for (let i = rowIndex + step; i >= 0 && i < learners.length; i += step) {
        const next = inputRefs.current.get(cellKey(learners[i].student_id, question.id));
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
        'rounded-lg border bg-background',
        isFullScreen && 'fixed inset-0 z-50 rounded-none border-0'
      )}
    >
      <div className='flex items-center justify-between border-b px-3 py-2'>
        <p className='text-xs text-muted-foreground'>
          {learners.length} learner{learners.length === 1 ? '' : 's'} · {questions.length} question
          {questions.length === 1 ? '' : 's'} · Enter moves down the column
        </p>
        <Button variant='ghost' size='sm' className='h-7 px-2' onClick={onToggleFullScreen}>
          {isFullScreen ? (
            <>
              <Minimize2 className='h-4 w-4 mr-1' /> Exit
            </>
          ) : (
            <>
              <Maximize2 className='h-4 w-4 mr-1' /> Full screen
            </>
          )}
        </Button>
      </div>

      {/* `isolate` contains the sticky z-indexes; min-w-0 keeps the wide table
          from stretching the page and dragging the frozen columns off-screen. */}
      <div
        className={cn(
          'isolate min-w-0 overflow-auto',
          isFullScreen ? 'h-[calc(100vh-3rem)]' : 'max-h-[70vh]'
        )}
      >
        <table className='border-separate border-spacing-0 text-sm' style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <Th sticky left={FROZEN_LEFT.sno} width={FROZEN_W.sno}>
                S.No
              </Th>
              <Th sticky left={FROZEN_LEFT.register} width={FROZEN_W.register}>
                Register Number
              </Th>
              <Th sticky left={FROZEN_LEFT.name} width={FROZEN_W.name}>
                Name of the Learner
              </Th>

              {questions.map((q, i) => {
                const idx = partIndex.get(q.part_label) ?? 0;
                const color = partColor(idx);
                const isPartStart = i === 0 || questions[i - 1].part_label !== q.part_label;
                return (
                  <th
                    key={q.id}
                    title={q.question_text ? stripHtml(q.question_text) : undefined}
                    className={cn(
                      'sticky top-0 z-30 border-b px-1 py-1.5 align-top text-center font-medium',
                      color.header,
                      isPartStart && color.edge
                    )}
                    style={{ width: COL_W, minWidth: COL_W, maxWidth: COL_W }}
                  >
                    <div className='text-[10px] opacity-80'>
                      {q.is_choice_alternative ? (
                        <span className='rounded bg-amber-400 px-1 text-amber-950'>OR</span>
                      ) : (
                        `PART ${q.part_label}`
                      )}
                    </div>
                    <div className='text-xs font-semibold'>Q{q.label}</div>
                    <div className='text-[10px] opacity-80'>{q.marks} marks</div>
                    <div className='text-[10px] opacity-70'>
                      {[q.co_code, q.k_level].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </th>
                );
              })}

              <th
                className='sticky top-0 z-30 border-b bg-slate-600 px-1 py-1.5 text-center font-medium text-slate-50'
                style={{ width: 46, minWidth: 46, maxWidth: 46 }}
                title='Absent — the learner did not sit this assessment. Saved as grade AAA, which is a different fact from a zero.'
              >
                <div className='text-[10px] opacity-80'>ABS</div>
                <div className='text-xs font-semibold'>AB</div>
              </th>

              <th
                className='sticky top-0 z-30 border-b bg-indigo-800 px-2 py-1.5 text-center font-medium text-indigo-50'
                style={{ width: 80, minWidth: 80, maxWidth: 80 }}
              >
                <div className='text-[10px] opacity-80'>TOTAL</div>
                <div className='text-xs font-semibold'>{componentLabel}</div>
                <div className='text-[10px] opacity-80'>Max: {componentMax}</div>
              </th>
            </tr>
          </thead>

          <tbody>
            {learners.map((learner, rowIndex) => {
              const total = sumMarks(learner.marks);
              const over = componentMax > 0 && total > componentMax;
              return (
                <tr key={learner.student_id} className='even:bg-muted/30'>
                  <Td sticky left={FROZEN_LEFT.sno} width={FROZEN_W.sno} className='text-center text-xs text-muted-foreground'>
                    {rowIndex + 1}
                  </Td>
                  <Td sticky left={FROZEN_LEFT.register} width={FROZEN_W.register} className='font-mono text-xs'>
                    {learner.register_number}
                  </Td>
                  <Td sticky left={FROZEN_LEFT.name} width={FROZEN_W.name} className='text-xs'>
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
                        style={{ width: COL_W, minWidth: COL_W, maxWidth: COL_W }}
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
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, q)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') return onChange(learner.student_id, q.id, null);
                            const n = parseInt(raw, 10);
                            onChange(learner.student_id, q.id, Number.isFinite(n) ? n : null);
                          }}
                          className={cn(
                            'h-7 w-12 rounded border bg-background text-center text-xs',
                            'focus:outline-none focus:ring-2 focus:ring-primary/40',
                            color.input,
                            q.is_choice_alternative && 'border-dashed',
                            (lock || learner.is_absent) &&
                              'cursor-not-allowed bg-muted text-muted-foreground',
                            invalid && 'border-red-500 text-red-600 ring-1 ring-red-500'
                          )}
                        />
                      </td>
                    );
                  })}

                  <td
                    className='border-b px-1 py-1 text-center'
                    style={{ width: 46, minWidth: 46, maxWidth: 46 }}
                  >
                    <input
                      type='checkbox'
                      className='h-4 w-4 cursor-pointer accent-slate-600'
                      disabled={readOnly}
                      checked={!!learner.is_absent}
                      aria-label={`Mark ${learner.register_number} absent`}
                      title='Absent — clears any marks entered for this learner'
                      onChange={(e) => onToggleAbsent(learner.student_id, e.target.checked)}
                    />
                  </td>

                  <td
                    className='border-b bg-indigo-50/70 px-2 py-1 text-center dark:bg-indigo-950/40'
                    style={{ width: 80, minWidth: 80, maxWidth: 80 }}
                  >
                    <span
                      className={cn(
                        'font-mono text-sm font-semibold',
                        learner.is_absent
                          ? 'text-muted-foreground'
                          : over
                            ? 'text-red-600'
                            : 'text-indigo-700 dark:text-indigo-300'
                      )}
                    >
                      {learner.is_absent ? 'AB' : total}
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

/** Sticky header cell for the frozen columns. z-40 so it beats the question heads. */
function Th({
  children,
  sticky,
  left,
  width,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  left: number;
  width: number;
}) {
  return (
    <th
      className={cn(
        'sticky top-0 border-b bg-slate-800 px-2 py-1.5 text-left text-xs font-medium text-slate-50',
        sticky && 'z-40'
      )}
      style={{ left, width, minWidth: width, maxWidth: width }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  sticky,
  left,
  width,
  className,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  left: number;
  width: number;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'border-b px-2 py-1 align-middle',
        // Opaque background is required: a transparent frozen cell lets the
        // scrolling question columns show through underneath it.
        sticky && 'sticky z-20 bg-background',
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
