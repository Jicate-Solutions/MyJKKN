'use client';

/**
 * The rating control every tier of the appraisal chain uses — staff
 * self-review, dept HoD, and the committee. One component so the three
 * screens cannot drift into offering different words for the same decision.
 */

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AREA_HELP,
  AREA_LABELS,
  COLLEGIALITY_EXAMPLE_MIN,
  RATING_LABELS,
  RATING_ORDER,
  RATING_SHORT,
  collegialityExampleMissing,
  collegialityExampleRequired,
  type AppraisalArea,
  type AppraisalRating,
  type AppraisalRatingMap,
  type AppraisalRatingPolicySlice,
} from '@/lib/hr/appraisal-ratings';

/** Badge colours by band. Semantic, and readable in both themes. */
const BAND_CLASS: Record<AppraisalRating, string> = {
  exceeds:
    'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300',
  meets: 'border-sky-600/40 bg-sky-600/10 text-sky-700 dark:text-sky-300',
  below: 'border-amber-600/50 bg-amber-600/10 text-amber-700 dark:text-amber-300',
};

/** Read-only badge — used to show an earlier tier's rating beside your own. */
export function RatingBadge({ rating }: { rating: AppraisalRating | undefined }) {
  if (!rating) {
    return <span className="text-xs text-muted-foreground">Not rated</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
        BAND_CLASS[rating],
      )}
    >
      {RATING_SHORT[rating]}
    </span>
  );
}

interface AreaRowProps {
  area: AppraisalArea;
  value: AppraisalRating | undefined;
  onChange: (r: AppraisalRating) => void;
  /** An earlier tier's rating for the same area, shown for reference. */
  priorLabel?: string;
  prior?: AppraisalRating;
  disabled?: boolean;
  idPrefix: string;
}

function AreaRow({
  area, value, onChange, priorLabel, prior, disabled, idPrefix,
}: AreaRowProps) {
  const group = `${idPrefix}-${area}`;
  return (
    <fieldset className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{AREA_LABELS[area]}</legend>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{AREA_LABELS[area]}</span>
        {prior && (
          <span className="text-xs text-muted-foreground">
            {priorLabel ?? 'Earlier'}: <RatingBadge rating={prior} />
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {AREA_HELP[area]}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={AREA_LABELS[area]}>
        {RATING_ORDER.map((r) => {
          const selected = value === r;
          return (
            <label
              key={r}
              className={cn(
                'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
                'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2',
                selected
                  ? BAND_CLASS[r]
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                disabled && 'pointer-events-none opacity-60',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={group}
                id={`${group}-${r}`}
                value={r}
                checked={selected}
                disabled={disabled}
                // Guarded here as well as by the disabled attribute: a
                // submitted appraisal is a record, and one stray click must
                // not be able to edit it if a style or attribute ever slips.
                onChange={() => {
                  if (disabled) return;
                  onChange(r);
                }}
              />
              {RATING_LABELS[r]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface RatingPickerProps {
  areas: readonly AppraisalArea[];
  value: AppraisalRatingMap;
  onChange: (next: AppraisalRatingMap) => void;
  /** Collegiality justification for THIS tier. */
  collegialityExample: string;
  onCollegialityExampleChange: (next: string) => void;
  policy: AppraisalRatingPolicySlice | null | undefined;
  /** Optional earlier tier to show alongside (e.g. the staff's self-rating). */
  prior?: AppraisalRatingMap;
  priorLabel?: string;
  disabled?: boolean;
  /** Distinguishes radio groups when two pickers share a page. */
  idPrefix: string;
}

export function RatingPicker({
  areas, value, onChange, collegialityExample, onCollegialityExampleChange,
  policy, prior, priorLabel, disabled, idPrefix,
}: RatingPickerProps) {
  const needExample = collegialityExampleMissing(value, collegialityExample, policy);
  const showExampleBox =
    value.collegiality === 'below' && collegialityExampleRequired(policy);

  return (
    <div>
      {areas.map((area) => (
        <AreaRow
          key={area}
          area={area}
          value={value[area]}
          prior={prior?.[area]}
          priorLabel={priorLabel}
          disabled={disabled}
          idPrefix={idPrefix}
          onChange={(r) => onChange({ ...value, [area]: r })}
        />
      ))}

      {showExampleBox && (
        <div className="mt-4 rounded-md border border-amber-600/40 bg-amber-600/5 p-4">
          <Label htmlFor={`${idPrefix}-collegiality-example`} className="text-sm font-semibold">
            Give an example of the behaviour
          </Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Collegiality leaves no record of its own, unlike a class taught or a paper
            published. A rating of Below has to say what it is based on, so the person
            can answer it.
          </p>
          <Textarea
            id={`${idPrefix}-collegiality-example`}
            className="mt-2"
            rows={3}
            disabled={disabled}
            value={collegialityExample}
            placeholder="What happened, and when. Be specific."
            onChange={(e) => onCollegialityExampleChange(e.target.value)}
          />
          {needExample && (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              At least {COLLEGIALITY_EXAMPLE_MIN} characters are needed before this can be
              submitted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
