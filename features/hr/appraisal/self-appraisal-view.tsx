'use client';

/**
 * A read-only, readable view of an appraisal payload — what a person wrote
 * about themselves, or what a reviewer recorded.
 *
 * The payloads are free-form JSONB. Before this, the head of department saw
 * the self-appraisal as raw JSON. Now each area shows its band, the
 * Collegiality example and the written answers show as paragraphs, and
 * anything this screen does not know about is still listed in plain words
 * rather than hidden or dumped as code, so nothing a person wrote is lost.
 *
 * Shared by the head's team board and the committee / Director panel.
 */

import { RatingBadge } from '@/features/hr/appraisal/rating-picker';
import {
  AREA_LABELS,
  COLLEGIALITY_EXAMPLE_FIELD,
  parseCollegialityExample,
  parseRatings,
  resolveAreas,
} from '@/lib/hr/appraisal-ratings';

export interface PayloadField {
  key: string;
  label: string;
}

/** The written answers on the self-appraisal form, in the order it asks them. */
export const SELF_APPRAISAL_FIELDS: readonly PayloadField[] = [
  { key: 'achievements', label: 'Achievements' },
  { key: 'goals_next_year', label: 'Goals for next year' },
  { key: 'challenges', label: 'Challenges' },
];

/** The written parts of the head of department's review. */
export const HEAD_REVIEW_FIELDS: readonly PayloadField[] = [
  { key: 'validation_notes', label: 'Validation notes' },
  { key: 'recommendations', label: 'Recommendations' },
];

/**
 * Keys every screen already shows in its own way (the ratings, the example,
 * and a send-back note, which appears as its own notice), so they are not
 * repeated among the other details.
 */
const HANDLED_KEYS = new Set([
  'ratings',
  COLLEGIALITY_EXAMPLE_FIELD,
  'sent_back_reason',
  'sent_back_by',
  'sent_back_at',
]);

/** "goals_next_year" -> "Goals next year". */
export function humaniseKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A value in plain words, or null when there is nothing to show. */
export function plainValue(v: unknown, depth = 0): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() ? v : null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => plainValue(x, depth + 1)).filter((x): x is string => !!x);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object') {
    if (depth >= 1) return '(further detail not shown)';
    const parts = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => {
        const pv = plainValue(x, depth + 1);
        return pv ? `${humaniseKey(k)}: ${pv}` : null;
      })
      .filter((x): x is string => !!x);
    return parts.length ? parts.join('; ') : null;
  }
  return null;
}

interface Props {
  payload: Record<string, unknown> | null | undefined;
  /** Which written answers to show as paragraphs, and what to call them. */
  fields?: readonly PayloadField[];
  /** Shown when nothing at all has been written or rated. */
  emptyText?: string;
}

export function SelfAppraisalView({
  payload,
  fields = SELF_APPRAISAL_FIELDS,
  emptyText = 'Nothing written yet.',
}: Props) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const areas = resolveAreas();
  const ratings = parseRatings(p, areas);
  const example = parseCollegialityExample(p).trim();

  const written = fields
    .map((f) => ({ ...f, text: typeof p[f.key] === 'string' ? (p[f.key] as string).trim() : '' }))
    .filter((f) => f.text);

  const known = new Set([...HANDLED_KEYS, ...fields.map((f) => f.key)]);
  const others = Object.entries(p)
    .filter(([k]) => !known.has(k))
    .map(([k, v]) => ({ key: k, label: humaniseKey(k), text: plainValue(v) }))
    .filter((o): o is { key: string; label: string; text: string } => !!o.text);

  const hasRatings = Object.keys(ratings).length > 0;
  if (!hasRatings && !example && written.length === 0 && others.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {areas.map((a) => (
          <div
            key={a}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            data-area={a}
          >
            <dt className="font-medium">{AREA_LABELS[a]}</dt>
            <dd>
              <RatingBadge rating={ratings[a]} />
            </dd>
          </div>
        ))}
      </dl>

      {example && (
        <section>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {ratings.collegiality === 'below'
              ? 'Example given for the Below in Collegiality'
              : 'Collegiality example'}
          </h5>
          <p className="mt-1 whitespace-pre-wrap">{example}</p>
        </section>
      )}

      {written.map((f) => (
        <section key={f.key}>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {f.label}
          </h5>
          <p className="mt-1 whitespace-pre-wrap">{f.text}</p>
        </section>
      ))}

      {others.length > 0 && (
        <section>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other details
          </h5>
          <ul className="mt-1 space-y-1">
            {others.map((o) => (
              <li key={o.key} className="whitespace-pre-wrap">
                <span className="font-medium">{o.label}:</span> {o.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
