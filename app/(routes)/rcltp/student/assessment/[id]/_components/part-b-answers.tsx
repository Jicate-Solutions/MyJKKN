'use client';

// =============================================================================
// Part B — comprehension answering (Phase 4b)
// =============================================================================
// Renders the assessment's APPROVED Part B questions (the take-flow only ever
// passes status='approved' — draft/AI content is never shown to a child). Answers
// are controlled by the parent so the take-flow owns the single source of truth
// it posts via RcltpAssessmentsService.recordResponses (last-wins upsert).
//
// Questions authored in the 4a console are question_type='mcq' but carry no
// structured `options` (only a hidden correct_answer), so we render a free-text
// box by default and only show radio choices when a question actually ships a
// non-empty options array. Grading is the MyJKKN-gated scoring step — we capture
// the raw response and NEVER show right/wrong here.
// =============================================================================

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { RcltpPartBQuestion } from '@/types/rcltp';

interface PartBAnswersProps {
  questions: RcltpPartBQuestion[];
  /** Controlled answer map: question_id → response text. */
  answers: Record<string, string>;
  onChange: (questionId: string, value: string) => void;
  disabled?: boolean;
}

interface Choice {
  value: string;
  label: string;
}

/**
 * Defensive normalisation of a question's `options` Json into radio choices.
 * Accepts string[] or object[] ({ text|label|value }). Returns [] when there are
 * no usable structured options, in which case the question renders as free text.
 */
function toChoices(options: unknown): Choice[] {
  if (!Array.isArray(options)) return [];
  const choices: Choice[] = [];
  for (const opt of options) {
    if (typeof opt === 'string') {
      const v = opt.trim();
      if (v) choices.push({ value: v, label: v });
    } else if (opt && typeof opt === 'object') {
      const o = opt as Record<string, unknown>;
      const label =
        (typeof o.label === 'string' && o.label) ||
        (typeof o.text === 'string' && o.text) ||
        (typeof o.value === 'string' && o.value) ||
        '';
      const value =
        (typeof o.value === 'string' && o.value) || label;
      if (label) choices.push({ value, label });
    }
  }
  return choices;
}

export function PartBAnswers({ questions, answers, onChange, disabled }: PartBAnswersProps) {
  if (questions.length === 0) {
    return (
      <p className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
        This assessment has no comprehension questions to answer.
      </p>
    );
  }

  return (
    <ol className='space-y-5'>
      {questions.map((q, idx) => {
        const choices = toChoices(q.options);
        const value = answers[q.id] ?? '';
        const fieldId = `q-${q.id}`;
        return (
          <li key={q.id} className='rounded-lg border bg-card p-4'>
            <Label htmlFor={fieldId} className='flex gap-2 text-sm font-medium'>
              <span className='text-muted-foreground'>{idx + 1}.</span>
              <span>{q.question_text}</span>
            </Label>

            <div className='mt-3'>
              {choices.length > 0 ? (
                <RadioGroup
                  value={value}
                  onValueChange={(v) => onChange(q.id, v)}
                  disabled={disabled}
                  aria-label={q.question_text}
                >
                  {choices.map((c, i) => {
                    const optId = `${fieldId}-opt-${i}`;
                    return (
                      <div key={optId} className='flex items-center gap-2'>
                        <RadioGroupItem value={c.value} id={optId} />
                        <Label htmlFor={optId} className='cursor-pointer text-sm font-normal'>
                          {c.label}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              ) : (
                <Textarea
                  id={fieldId}
                  rows={3}
                  value={value}
                  disabled={disabled}
                  placeholder='Type your answer…'
                  onChange={(e) => onChange(q.id, e.target.value)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
