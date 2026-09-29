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
import {
  CONDITION_LABELS,
  CONDITION_REASONS,
  CONDITIONS_NOTE_MIN,
  conditionAnswered,
  conditionsFirstRequired,
  resolveBandStatements,
  type AppraisalHarnessPolicySlice,
  type ConditionAnswer,
  type ConditionAnswers,
  type ConditionReason,
  type TickedStatements,
} from '@/lib/hr/appraisal-harness';

type PickerPolicy = (AppraisalRatingPolicySlice & AppraisalHarnessPolicySlice) | null | undefined;

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
  policy: PickerPolicy;
  /** Statements ticked for this area, when the college has written some. */
  ticked?: string[];
  onTickedChange?: (next: string[]) => void;
  /** Answer to "what did the college not provide", when this tier owes one. */
  condition?: ConditionAnswer;
  onConditionChange?: (next: ConditionAnswer) => void;
}

function AreaRow({
  area, value, onChange, priorLabel, prior, disabled, idPrefix,
  policy, ticked, onTickedChange, condition, onConditionChange,
}: AreaRowProps) {
  const group = `${idPrefix}-${area}`;
  const statementBands = RATING_ORDER.map((band) => ({
    band,
    list: resolveBandStatements(policy, area, band),
  })).filter((x) => x.list.length > 0);
  const askConditions =
    value === 'below' && !!onConditionChange && conditionsFirstRequired(policy);
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

      {askConditions && (
        <ConditionsBox
          id={`${group}-conditions`}
          areaLabel={AREA_LABELS[area]}
          value={condition ?? { missing: [], note: '' }}
          onChange={(next) => onConditionChange?.(next)}
          disabled={disabled}
        />
      )}

      {statementBands.length > 0 && (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            {onTickedChange
              ? 'Tick what the evidence supports. These are statements a second person could check.'
              : 'What each band means here, in statements a second person could check.'}
          </p>
          {statementBands.map(({ band, list }) => (
            <div key={band}>
              <div className="text-xs font-medium">{RATING_SHORT[band]}</div>
              <ul className="mt-1 space-y-1">
                {list.map((text, i) => {
                  const id = `${group}-st-${band}-${i}`;
                  const checked = (ticked ?? []).includes(text);
                  return (
                    <li key={id} className="flex items-start gap-2 text-xs">
                      {onTickedChange ? (
                        <input
                          id={id}
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 accent-primary"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => {
                            if (disabled) return;
                            const cur = ticked ?? [];
                            onTickedChange(
                              e.target.checked
                                ? [...cur.filter((t) => t !== text), text]
                                : cur.filter((t) => t !== text),
                            );
                          }}
                        />
                      ) : (
                        <span aria-hidden className="mt-0.5 text-muted-foreground">·</span>
                      )}
                      <label htmlFor={onTickedChange ? id : undefined} className="leading-relaxed">
                        {text}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * Asked before a Below counts: what did the college not provide? The finding
 * may be about JKKN, not about the person, and this is where that is recorded.
 */
function ConditionsBox({
  id, areaLabel, value, onChange, disabled,
}: {
  id: string;
  areaLabel: string;
  value: ConditionAnswer;
  onChange: (next: ConditionAnswer) => void;
  disabled?: boolean;
}) {
  const done = conditionAnswered(value);
  const toggle = (r: ConditionReason, on: boolean) => {
    if (disabled) return;
    const rest = value.missing.filter((x) => x !== r);
    onChange({ ...value, missing: on ? [...rest, r] : rest });
  };
  return (
    <div
      className="mt-3 rounded-md border border-amber-600/40 bg-amber-600/5 p-3"
      role="group"
      aria-labelledby={`${id}-title`}
    >
      <p id={`${id}-title`} className="text-sm font-semibold">
        First: what did the college not provide? ({areaLabel})
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        A Below can be about the conditions as much as the person. Pick everything that
        applies, then say what happened.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {CONDITION_REASONS.map((r) => {
          const cid = `${id}-${r}`;
          return (
            <label key={r} htmlFor={cid} className="flex items-center gap-1.5 text-xs">
              <input
                id={cid}
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={value.missing.includes(r)}
                disabled={disabled}
                onChange={(e) => toggle(r, e.target.checked)}
              />
              {CONDITION_LABELS[r]}
            </label>
          );
        })}
      </div>
      <Label htmlFor={`${id}-note`} className="mt-3 block text-xs">
        What was missing, briefly
      </Label>
      <Textarea
        id={`${id}-note`}
        className="mt-1"
        rows={2}
        disabled={disabled}
        value={value.note}
        placeholder="e.g. The projector in the learning studio was broken for most of the second term."
        onChange={(e) => onChange({ ...value, note: e.target.value })}
      />
      {!done && (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          Pick at least one and write at least {CONDITIONS_NOTE_MIN} characters before this
          can be submitted.
        </p>
      )}
    </div>
  );
}

export interface RatingPickerProps {
  areas: readonly AppraisalArea[];
  value: AppraisalRatingMap;
  onChange: (next: AppraisalRatingMap) => void;
  /** Collegiality justification for THIS tier. */
  collegialityExample: string;
  onCollegialityExampleChange: (next: string) => void;
  policy: PickerPolicy;
  /**
   * Statements ticked per area. Pass the change handler to let this tier tick
   * them; without it the statements are shown for reference only. Nothing is
   * shown at all unless the college has written statements.
   */
  tickedStatements?: TickedStatements;
  onTickedStatementsChange?: (next: TickedStatements) => void;
  /**
   * "What did the college not provide" answers per area. Pass the change
   * handler on the tiers that owe one (the head and the second rater); a Below
   * then asks the question before it can be submitted.
   */
  conditions?: ConditionAnswers;
  onConditionsChange?: (next: ConditionAnswers) => void;
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
  tickedStatements, onTickedStatementsChange, conditions, onConditionsChange,
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
          policy={policy}
          ticked={tickedStatements?.[area]}
          onTickedChange={
            onTickedStatementsChange
              ? (next) => onTickedStatementsChange({ ...(tickedStatements ?? {}), [area]: next })
              : undefined
          }
          condition={conditions?.[area]}
          onConditionChange={
            onConditionsChange
              ? (next) => onConditionsChange({ ...(conditions ?? {}), [area]: next })
              : undefined
          }
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
