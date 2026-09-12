'use client';

// OneMark — "My progress" on the learner's own home (Lane L item 3).
//
// The learner report itself is Lane A's: `fn_onemark_learner_report`, served at
// GET /api/foundation/onemark/results/learner/<studentId>, which a learner may
// call for THEMSELVES (fn_fp_can_view_student admits the person). This card is
// the learner-side reader for it — score trend of the last ten sittings, how
// many vault questions are due, and the unit that is going worst.
//
// IT NEVER SHOWS AN ANSWER. Scores, counts and a unit name; nothing that could
// be read back as a key.
//
// DEGRADES TO NOTHING. Lane A merges after this, so until then the route is a
// 404 and the card renders nothing at all — no error, no empty box, no
// "coming soon". The report's field names are read tolerantly (snake_case and
// camelCase both) because the jsonb shape is Lane A's to settle.
//
// ORDER IS THE ONE THING TOLERANCE CANNOT COVER. Newest-first and oldest-first
// carry identical field names, so a tolerant reader that assumed one would
// render a WRONG "last time" and a backwards trend rather than nothing. The
// sittings are therefore sorted here from their own timestamps, and when the
// timestamps are not all there the ordered views are simply not drawn.

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';

interface LearnerReport {
  /** NEWEST FIRST, always — see `readLearnerReport`. */
  sittings: Array<{ score: number | null; total: number | null; submittedAt: string | null }>;
  /** False when the report's sittings carry no usable timestamps, so their
   *  order cannot be established. The trend strip and the "last time" line are
   *  then hidden: an unordered strip and a wrong "last time" are worse than no
   *  strip at all, and the card's whole promise is that it degrades to NOTHING
   *  rather than to a wrong number. */
  ordered: boolean;
  vaultDue: number | null;
  weakestUnit: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A submittedAt as epoch ms, or null when it is missing or unparseable. */
function stamp(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Lane A's jsonb, read defensively. Anything missing simply does not render. */
export function readLearnerReport(raw: any): LearnerReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const sittingsRaw = raw.sittings ?? raw.last_sittings ?? raw.lastSittings ?? [];
  const parsed = (Array.isArray(sittingsRaw) ? sittingsRaw : [])
    .map((s: any) => ({
      score: num(s?.score),
      total: num(s?.total ?? s?.question_count ?? s?.questionCount),
      submittedAt: typeof s?.submitted_at === 'string' ? s.submitted_at : typeof s?.submittedAt === 'string' ? s.submittedAt : null,
    }))
    .filter((s: any) => s.score !== null);
  // ORDER IS NOT ASSUMED. Lane A has not merged, and "newest first" is a
  // property no tolerant field-name reader can detect: oldest-first data has
  // exactly the same shape and would render a WRONG "last time" and a
  // backwards trend, not nothing. So the order is established HERE, from the
  // timestamps, and when they are not all there the ordered views are dropped.
  const ordered = parsed.length > 0 && parsed.every((s) => stamp(s.submittedAt) !== null);
  const sittings = (
    ordered ? [...parsed].sort((a, b) => (stamp(b.submittedAt)! - stamp(a.submittedAt)!)) : parsed
  ).slice(0, 10);
  const vault = raw.vault ?? raw.vault_state ?? raw.vaultState ?? {};
  const vaultDue = num(vault?.due ?? vault?.eligible_now ?? vault?.eligibleNow ?? vault?.active);
  const weakRaw = raw.weakest_unit ?? raw.weakestUnit ?? null;
  const weakestUnit =
    typeof weakRaw === 'string'
      ? weakRaw
      : typeof weakRaw?.name === 'string'
        ? weakRaw.name
        : typeof weakRaw?.label === 'string'
          ? weakRaw.label
          : typeof weakRaw?.topic_name === 'string'
            ? weakRaw.topic_name
            : null;
  if (sittings.length === 0 && vaultDue === null && !weakestUnit) return null;
  return { sittings, ordered, vaultDue, weakestUnit };
}

/** A ten-step bar strip. No chart library for ten numbers. */
function Trend({ sittings }: { sittings: LearnerReport['sittings'] }) {
  // `sittings` is newest-first; the strip reads left-to-right in time.
  const points = [...sittings].reverse();
  return (
    <div className="flex items-end gap-1.5" aria-hidden="true">
      {points.map((s, i) => {
        const total = s.total && s.total > 0 ? s.total : null;
        const pct = total && s.score !== null ? Math.max(6, Math.round((s.score / total) * 100)) : 6;
        return (
          <span
            key={i}
            className="w-3 rounded-sm bg-primary/70"
            style={{ height: `${Math.round(pct * 0.4) + 4}px` }}
          />
        );
      })}
    </div>
  );
}

export function ProgressCard({ learnerId }: { learnerId: string }) {
  const [report, setReport] = useState<LearnerReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/foundation/onemark/results/learner/${encodeURIComponent(learnerId)}`,
          { headers: { 'Content-Type': 'application/json' } },
        );
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        if (!cancelled) setReport(readLearnerReport(body?.report ?? body));
      } catch {
        /* Lane A is not merged yet, or the network blinked — show nothing. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [learnerId]);

  if (!report) return null;

  // Only when the order was established from timestamps — otherwise sittings[0]
  // is just "the first one Lane A happened to send".
  const last = report.ordered ? report.sittings[0] : null;
  const lastLine =
    last && last.score !== null
      ? last.total
        ? `${last.score} of ${last.total} last time`
        : `${last.score} correct last time`
      : null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">My progress</h2>
      </div>
      <div className="rounded-2xl bg-card p-5">
        {report.ordered && report.sittings.length > 0 && (
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <Trend sittings={report.sittings} />
            {lastLine && <p className="text-sm text-muted-foreground">{lastLine}</p>}
          </div>
        )}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {report.vaultDue !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Due for review</dt>
              <dd className="text-base tabular-nums text-foreground">
                {report.vaultDue} question{report.vaultDue === 1 ? '' : 's'}
              </dd>
            </div>
          )}
          {report.weakestUnit && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Weakest unit</dt>
              <dd className="text-base text-foreground">{report.weakestUnit}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {report.ordered && report.sittings.length > 0
            ? `Your last ${report.sittings.length} sitting${report.sittings.length === 1 ? '' : 's'}. `
            : ''}
          Answers are never shown here &mdash; they are in each sitting&rsquo;s own review.
        </p>
      </div>
    </section>
  );
}
