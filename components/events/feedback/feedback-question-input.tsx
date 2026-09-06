'use client';

// Renders ONE feedback question by its question_type. Shared by the
// coordinator's builder preview and the participant's respond page — one
// rendering implementation, so "what the coordinator designed" and "what a
// participant sees" can never drift.
//
// The direct analogue of components/events/dynamic-field-input.tsx, and
// deliberately a separate component rather than a branch inside it: that one
// carries the private-bucket upload machinery a survey has no use for, and its
// FormFieldType has no 'rating' — the one type this whole feature exists for.

import { Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DEFAULT_RATING_SCALE } from '@/types/event-feedback';
import type { EventFeedbackQuestion, FormFieldCondition } from '@/types/event-feedback';

/** Whether `question` should be shown given the current answers to ALL questions. */
export function isQuestionVisible(
  question: EventFeedbackQuestion,
  allValues: Record<string, unknown>
): boolean {
  const condition = question.condition as FormFieldCondition | null;
  if (!condition) return true;
  const dependentValue = allValues[condition.field];
  const asString = dependentValue == null ? '' : String(dependentValue);
  switch (condition.op) {
    case 'eq':
      return asString === condition.value;
    case 'neq':
      return asString !== condition.value;
    case 'contains':
      return asString.includes(condition.value);
    case 'not_empty':
      return asString.trim() !== '';
    case 'empty':
      return asString.trim() === '';
    default:
      return true;
  }
}

/**
 * The rating control.
 *
 * Stars up to a 5-point scale, numbered pills beyond it — ten stars in a row is
 * unreadable on a phone and impossible to hit accurately, which is exactly
 * where most feedback gets filled in.
 *
 * Clicking the currently selected value CLEARS it (back to 0). Without that
 * there is no way to undo a mis-tap on an optional question: every other
 * control here can be emptied, and a rating that can only ever go up quietly
 * inflates the average.
 */
function RatingInput({
  value,
  scale,
  onChange,
  disabled,
}: {
  value: number;
  scale: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const points = Array.from({ length: scale }, (_, i) => i + 1);
  const useStars = scale <= 5;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup">
      {points.map((point) => {
        const active = value >= point;
        const exact = value === point;
        return (
          <button
            key={point}
            type="button"
            role="radio"
            aria-checked={exact}
            aria-label={`${point} out of ${scale}`}
            disabled={disabled}
            onClick={() => onChange(exact ? 0 : point)}
            className={cn(
              'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              useStars
                ? 'rounded p-0.5 hover:scale-110'
                : cn(
                    'h-9 w-9 rounded-md border text-sm font-medium',
                    // For a numbered scale only the CHOSEN point is filled.
                    // Filling everything below it would read as "I picked 1
                    // through 7", which is not what a 7/10 means.
                    exact
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary hover:bg-accent'
                  )
            )}
          >
            {useStars ? (
              <Star
                className={cn(
                  'h-7 w-7',
                  active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
                )}
              />
            ) : (
              point
            )}
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-1.5 text-sm text-muted-foreground">
          {value} / {scale}
        </span>
      )}
    </div>
  );
}

interface Props {
  question: EventFeedbackQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  /** True on the builder's live preview, where answering must change nothing. */
  disabled?: boolean;
}

export function FeedbackQuestionInput({ question, value, onChange, disabled }: Props) {
  const label = (
    <Label htmlFor={question.id}>
      {question.question_label}
      {question.is_required && <span className="text-destructive"> *</span>}
    </Label>
  );
  const help = question.help_text ? (
    <p className="text-xs text-muted-foreground">{question.help_text}</p>
  ) : null;

  switch (question.question_type) {
    // Asks nothing — guidance the coordinator wrote between questions. Never
    // writes to `value`, so it contributes nothing to the answer set.
    case 'section_note':
      return (
        <div className="rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2">
          {question.question_label && (
            <p className="text-sm font-medium">{question.question_label}</p>
          )}
          {question.help_text && (
            <p className="mt-0.5 text-sm text-muted-foreground">{question.help_text}</p>
          )}
        </div>
      );

    case 'rating':
      return (
        <div className="space-y-1.5">
          {label}
          <RatingInput
            value={Number(value) || 0}
            scale={question.rating_scale ?? DEFAULT_RATING_SCALE}
            onChange={onChange}
            disabled={disabled}
          />
          {help}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={question.id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? undefined}
            maxLength={question.max_length ?? undefined}
            disabled={disabled}
            rows={4}
          />
          {help}
        </div>
      );

    // Unlike the registration renderer, 'radio' is a REAL radio group, not a
    // dropdown. A survey's choices are meant to be read and compared at a
    // glance; hiding three options behind a click is what makes people pick
    // whichever one the dropdown happened to show first.
    case 'radio':
      return (
        <div className="space-y-1.5">
          {label}
          <RadioGroup
            value={(value as string) ?? ''}
            onValueChange={onChange}
            disabled={disabled}
            className="gap-2"
          >
            {(question.options ?? []).map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <RadioGroupItem value={opt.value} id={`${question.id}-${opt.value}`} />
                {opt.label}
              </label>
            ))}
          </RadioGroup>
          {help}
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          {label}
          <Select
            value={(value as string) ?? ''}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger id={question.id}>
              <SelectValue placeholder={question.placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {(question.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
        </div>
      );

    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div className="space-y-1.5">
          {label}
          <div className="space-y-2 rounded-md border p-2.5">
            {(question.options ?? []).map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(opt.value)}
                  onCheckedChange={() => toggle(opt.value)}
                  disabled={disabled}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {help}
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={question.id}
              checked={!!value}
              onCheckedChange={(checked) => onChange(!!checked)}
              disabled={disabled}
            />
            {label}
          </div>
          {help}
        </div>
      );

    case 'date':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={question.id}
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          {help}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={question.id}
            type="number"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? undefined}
            min={question.min_value ?? undefined}
            max={question.max_value ?? undefined}
            disabled={disabled}
          />
          {help}
        </div>
      );

    case 'text':
    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={question.id}
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? undefined}
            maxLength={question.max_length ?? undefined}
            disabled={disabled}
          />
          {help}
        </div>
      );
  }
}
