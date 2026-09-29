'use client';

/**
 * "Is this appraisal measuring anything?" — three checks on the appraisal
 * itself, shown to HR on the cycle page. None of them judges a person:
 *
 *   - Agreement: where a second head rated the same evidence blind, how often
 *     did the two land on the same band?
 *   - Spread: in each area, has nearly everyone been given the same band?
 *   - Conditions: when someone was rated Below, what did the heads say the
 *     college had not provided?
 */

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AREA_LABELS,
  RATING_ORDER,
  RATING_SHORT,
  parseRatings,
  resolveAreas,
} from '@/lib/hr/appraisal-ratings';
import {
  CONDITION_LABELS,
  computeAgreement,
  computeSaturation,
  outcomeRatings,
  tallyConditions,
  type AgreementVerdict,
  type RatingPair,
} from '@/lib/hr/appraisal-harness';
import type {
  HRPerformanceReview,
  HRPerformanceReviewPolicy,
} from '@/lib/services/hr/performance-review-service';
import type { HRSecondRating } from '@/lib/services/hr/appraisal-second-rating-service';

/** Reviews whose first head has handed on — only these have a first rating to compare. */
const PAST_HEAD = new Set(['supervisor_reviewed', 'sedc_reviewed', 'final_approved']);

export function buildPairs(
  reviews: readonly HRPerformanceReview[],
  seconds: readonly HRSecondRating[],
): RatingPair[] {
  const areas = resolveAreas();
  const byReview = new Map(seconds.filter((s) => s.submitted_at).map((s) => [s.review_id, s]));
  const pairs: RatingPair[] = [];
  for (const r of reviews) {
    const s = byReview.get(r.id);
    if (!s || !PAST_HEAD.has(r.status)) continue;
    pairs.push({
      first: parseRatings(r.supervisor_review_jsonb, areas),
      second: parseRatings(s.rating_jsonb, areas),
    });
  }
  return pairs;
}

function verdictText(v: AgreementVerdict): string {
  switch (v.kind) {
    case 'not_enough':
      return `Not enough pairs yet: ${v.pairs} of the ${v.needed} needed before agreement means anything.`;
    case 'inconsistent':
      return (
        `The appraisal is not yet measuring consistently in ${v.weakAreas
          .map((a) => AREA_LABELS[a])
          .join(', ')}: two heads reading the same evidence agreed less than ${v.minPct}% of ` +
        'the time. Ratings from this round should not be used for promotion.'
      );
    case 'consistent':
      return `Two heads reading the same evidence agreed at least ${v.minPct}% of the time in every area.`;
  }
}

export function InstrumentCheckPanel({
  reviews,
  secondRatings,
  policy,
}: {
  reviews: readonly HRPerformanceReview[];
  secondRatings: readonly HRSecondRating[];
  policy: HRPerformanceReviewPolicy | null;
}) {
  const agreement = useMemo(
    () => computeAgreement(buildPairs(reviews, secondRatings), policy),
    [reviews, secondRatings, policy],
  );
  const spread = useMemo(
    () =>
      computeSaturation(
        reviews.filter((r) => PAST_HEAD.has(r.status)).map((r) => outcomeRatings(r)),
        policy,
      ),
    [reviews, policy],
  );
  const conditions = useMemo(
    () =>
      tallyConditions([
        ...reviews.map((r) => r.supervisor_review_jsonb),
        ...secondRatings.filter((s) => s.submitted_at).map((s) => s.rating_jsonb),
      ]),
    [reviews, secondRatings],
  );

  const v = agreement.verdict;
  const verdictClass =
    v.kind === 'inconsistent'
      ? 'border-amber-600/50 bg-amber-600/10 text-amber-700 dark:text-amber-300'
      : v.kind === 'consistent'
        ? 'border-green-700/40 bg-green-700/10 text-green-700 dark:text-emerald-400'
        : 'border-border bg-muted/40 text-muted-foreground';
  const VerdictIcon = v.kind === 'inconsistent' ? AlertTriangle : v.kind === 'consistent' ? CheckCircle2 : Info;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Is this appraisal measuring anything?</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Checks on the appraisal itself, not on anyone rated in it. Nothing here changes a
          rating or feeds pay.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Agreement ─────────────────────────────────────────────── */}
        <section>
          <h4 className="text-sm font-semibold">Do two heads agree on the same evidence?</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {agreement.pairs} {agreement.pairs === 1 ? 'appraisal has' : 'appraisals have'}{' '}
            both a head&rsquo;s rating and a blind second rating.
          </p>
          <div
            role="status"
            className={`mt-2 flex items-start gap-2 rounded-md border p-3 text-sm ${verdictClass}`}
          >
            <VerdictIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{verdictText(v)}</span>
          </div>
          {v.kind !== 'not_enough' && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Area</th>
                    <th className="py-2 pr-4">Pairs</th>
                    <th className="py-2 pr-4">Same band</th>
                    <th className="py-2 pr-4">Exceeds vs Below</th>
                  </tr>
                </thead>
                <tbody>
                  {agreement.perArea.map((a) => (
                    <tr key={a.area} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium">{AREA_LABELS[a.area]}</td>
                      <td className="py-2 pr-4">{a.pairs}</td>
                      <td className="py-2 pr-4">{a.agreePct === null ? '—' : `${a.agreePct}%`}</td>
                      <td className="py-2 pr-4">{a.twoBandSplits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Spread ────────────────────────────────────────────────── */}
        <section className="border-t pt-4">
          <h4 className="text-sm font-semibold">How the ratings are spread</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            The ratings each appraisal came out with (the committee&rsquo;s where it has rated,
            otherwise the head&rsquo;s). A person&rsquo;s rating of themselves is not counted.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Area</th>
                  {RATING_ORDER.map((b) => (
                    <th key={b} className="py-2 pr-4">
                      {RATING_SHORT[b]}
                    </th>
                  ))}
                  <th className="py-2 pr-4">Rated</th>
                </tr>
              </thead>
              <tbody>
                {spread.map((s) => (
                  <tr key={s.area} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{AREA_LABELS[s.area]}</td>
                    {RATING_ORDER.map((b) => (
                      <td key={b} className="py-2 pr-4">
                        {s.counts[b]}
                      </td>
                    ))}
                    <td className="py-2 pr-4">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1">
            {spread
              .filter((s) => s.warn && s.topBand)
              .map((s) => (
                <p
                  key={s.area}
                  className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  Nearly everyone is rated {RATING_SHORT[s.topBand!]} in {AREA_LABELS[s.area]} (
                  {s.topPct}%). The appraisal has stopped telling people apart here.
                </p>
              ))}
          </div>
        </section>

        {/* ── Conditions ────────────────────────────────────────────── */}
        <section className="border-t pt-4">
          <h4 className="text-sm font-semibold">What the college did not provide</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Named by heads before rating someone Below. Most named first.
          </p>
          {conditions.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nothing named yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {conditions.map((c) => (
                <li key={c.reason} className="flex items-center justify-between gap-4 max-w-sm">
                  <span>{CONDITION_LABELS[c.reason]}</span>
                  <span className="font-medium">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
