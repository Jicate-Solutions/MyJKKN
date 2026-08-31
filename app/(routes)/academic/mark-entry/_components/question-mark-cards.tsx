'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { lockReasonFor, sumMarks } from '@/lib/utils/mark-entry/entry-rules';
import { partColor, type EntryPart, type EntryQuestion, type LearnerEntry } from '@/types/mark-entry';

interface Props {
  questions: EntryQuestion[];
  parts: EntryPart[];
  learners: LearnerEntry[];
  componentLabel: string;
  componentMax: number;
  readOnly: boolean;
  onChange: (studentId: string, questionId: string, value: number | null) => void;
  onToggleAbsent: (studentId: string, absent: boolean) => void;
}

/**
 * Mobile entry: one learner per card, questions listed vertically.
 *
 * A 12-question matrix is unusable on a phone — the frozen columns eat most of
 * the viewport and every input needs a horizontal scroll to reach. Stepping
 * through learners keeps every field reachable with one thumb, and the progress
 * dots give back the "who is left" overview the matrix provides visually.
 */
export function QuestionMarkCards({
  questions,
  parts,
  learners,
  componentLabel,
  componentMax,
  readOnly,
  onChange,
  onToggleAbsent,
}: Props) {
  const [index, setIndex] = useState(0);
  const learner = learners[Math.min(index, learners.length - 1)];

  const partIndex = useMemo(() => {
    const map = new Map<string, number>();
    parts.forEach((p, i) => map.set(p.part_label, i));
    return map;
  }, [parts]);

  // A learner marked absent is HANDLED, not pending — counting only those with
  // marks would leave the class looking permanently incomplete.
  const enteredCount = useMemo(
    () => learners.filter((l) => l.is_absent || Object.keys(l.marks).length > 0).length,
    [learners]
  );

  if (!learner) return null;

  const total = sumMarks(learner.marks);
  const over = componentMax > 0 && total > componentMax;

  return (
    <div className='rounded-lg border bg-background'>
      {/* Learner header */}
      <div className='border-b p-3'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <p className='font-mono text-sm font-semibold'>{learner.register_number}</p>
            <p className='truncate text-xs text-muted-foreground'>{learner.student_name}</p>
          </div>
          <Badge variant='outline' className='shrink-0 text-[10px]'>
            {index + 1} / {learners.length}
          </Badge>
        </div>
        {/* Progress dots — filled = has at least one mark. */}
        <div className='mt-2 flex flex-wrap gap-1'>
          {learners.map((l, i) => (
            <button
              key={l.student_id}
              type='button'
              aria-label={`Go to ${l.register_number}`}
              onClick={() => setIndex(i)}
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors',
                i === index
                  ? 'bg-primary ring-2 ring-primary/30'
                  : l.is_absent
                    ? 'bg-slate-500'
                    : Object.keys(l.marks).length > 0
                      ? 'bg-emerald-500'
                      : 'bg-muted-foreground/30'
              )}
            />
          ))}
        </div>
        <p className='mt-1.5 text-[11px] text-muted-foreground'>
          {enteredCount} of {learners.length} learners have marks
        </p>

        {/* Absent is a distinct fact from a zero — it must be one deliberate tap,
            not something inferred from leaving the fields empty. */}
        <label
          className={cn(
            'mt-2 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm',
            learner.is_absent && 'border-slate-400 bg-muted'
          )}
        >
          <input
            type='checkbox'
            className='h-4 w-4 accent-slate-600'
            disabled={readOnly}
            checked={!!learner.is_absent}
            onChange={(e) => onToggleAbsent(learner.student_id, e.target.checked)}
          />
          <span className='flex-1'>Absent</span>
          {learner.is_absent && (
            <Badge variant='secondary' className='text-[9px]'>
              grade AAA
            </Badge>
          )}
        </label>
      </div>

      {/* Questions */}
      <div className='divide-y'>
        {questions.map((q) => {
          const color = partColor(partIndex.get(q.part_label) ?? 0);
          const lock = learner.is_absent
            ? null
            : lockReasonFor(q, questions, parts, learner.marks);
          const value = learner.marks[q.id];
          const invalid = value != null && value > q.marks;
          const disabled = readOnly || learner.is_absent || lock !== null;
          return (
            <div
              key={q.id}
              className={cn(
                'flex items-center gap-3 p-3',
                color.cell,
                (lock || learner.is_absent) && 'opacity-60'
              )}
            >
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <span className='text-sm font-semibold'>Q{q.label}</span>
                  {q.is_choice_alternative && (
                    <Badge className='bg-amber-400 px-1 py-0 text-[9px] text-amber-950 hover:bg-amber-400'>
                      OR
                    </Badge>
                  )}
                  <span className={cn('rounded px-1 py-0.5 text-[9px]', color.chip)}>
                    PART {q.part_label}
                  </span>
                </div>
                <p className='mt-0.5 text-[11px] text-muted-foreground'>
                  {q.marks} marks
                  {(q.co_code || q.k_level) &&
                    ` · ${[q.co_code, q.k_level].filter(Boolean).join(' · ')}`}
                </p>
                {lock && (
                  <p className='mt-0.5 text-[10px] text-amber-600'>
                    {lock === 'or-sibling'
                      ? 'Alternative already answered'
                      : `Part ${q.part_label} answer limit reached`}
                  </p>
                )}
              </div>
              <input
                type='number'
                // decimal keypad gives a bigger, faster target than the text
                // keyboard while still refusing letters.
                inputMode='numeric'
                step={1}
                min={0}
                max={q.marks}
                disabled={disabled}
                value={learner.is_absent ? '' : (value ?? '')}
                placeholder={learner.is_absent ? 'AB' : lock ? '—' : '0'}
                aria-label={`Q${q.label} mark for ${learner.register_number}`}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') return onChange(learner.student_id, q.id, null);
                  const n = parseInt(raw, 10);
                  onChange(learner.student_id, q.id, Number.isFinite(n) ? n : null);
                }}
                className={cn(
                  'h-11 w-16 shrink-0 rounded-md border bg-background text-center text-base font-medium',
                  'focus:outline-none focus:ring-2 focus:ring-primary/40',
                  color.input,
                  q.is_choice_alternative && 'border-dashed',
                  (lock || learner.is_absent) && 'cursor-not-allowed bg-muted',
                  invalid && 'border-red-500 text-red-600 ring-1 ring-red-500'
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Pinned footer: running total + learner stepper */}
      <div className='sticky bottom-0 flex items-center gap-2 border-t bg-background/95 p-3 backdrop-blur'>
        <Button
          variant='outline'
          size='sm'
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <div className='flex-1 text-center'>
          <span
            className={cn(
              'font-mono text-lg font-bold',
              learner.is_absent
                ? 'text-muted-foreground'
                : over
                  ? 'text-red-600'
                  : 'text-indigo-700 dark:text-indigo-300'
            )}
          >
            {learner.is_absent ? 'AB' : total}
          </span>
          <span className='text-xs text-muted-foreground'>
            {learner.is_absent ? ' · absent' : ` / ${componentMax} · ${componentLabel}`}
          </span>
        </div>
        {index === learners.length - 1 ? (
          <Button variant='outline' size='sm' disabled>
            <Check className='h-4 w-4' />
          </Button>
        ) : (
          <Button variant='outline' size='sm' onClick={() => setIndex((i) => i + 1)}>
            <ChevronRight className='h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  );
}
