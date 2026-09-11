'use client';

// OneMark — Wave 3 Lane A. One cohort's sheet.
//
// Reading order is deliberate: the score list is the thing a Senior Learner
// came for, so it comes first and is NEVER gated; the analytics that follow are
// the paper judging itself.
//
// Rulings on the surface. #1/#8/#9/#14 are rows of the ruling table in
// `specs/onemark-wave3-2026-09-06.md`, "## Rulings of 2026-09-06 01:20 IST
// (Director interview, 15 answers)"; decision #17 is from the separate
// `specs/onemark-decisions-2026-09-02.md` (the 20 decisions). Two documents,
// two numbering schemes — the file is always named with the number.
//   W3 #1  No client permission test — the API and Lane S3's RPC decide who
//       reads this, and an active school-owner row alone is one of the doors.
//   W3 #8  A withdrawn question keeps its row, carries a "withdrawn" note, and
//       nothing on this screen recomputes a score because of it.
//   W3 #9  The item table hides below the min-learners threshold; the server
//       withholds the rows, this screen only explains the gap. The score list
//       above it is never gated.
//   W3 #14 The export is the score list. No answer key, no explanation.
//   Decision #17 A sitting taken on a device is flagged in the score list.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionError } from '@/components/errors/permission-error';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  itemStatsVisible,
  scoreDistribution,
  summarize,
  tagStrip,
  unitStrip,
  type CohortResults,
} from '@/lib/services/onemark/results-service';
import { AccuracyStrip, ScoreDistribution } from '../../_components/charts';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  in_progress: 'In progress',
  not_started: 'Not started',
  unknown: 'Unknown',
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function CohortSheet({ assessmentId }: { assessmentId: string }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'denied'; message: string }
    | { kind: 'notReady'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; results: CohortResults }
  >({ kind: 'loading' });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/foundation/onemark/results/${assessmentId}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setState({ kind: 'denied', message: body?.error ?? 'You do not have access to this cohort sheet.' });
        return;
      }
      if (res.status === 503) {
        setState({ kind: 'notReady', message: body?.error ?? 'Cohort results are not switched on yet.' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: body?.error ?? 'Could not load this cohort sheet.' });
        return;
      }
      setState({ kind: 'ready', results: body.results as CohortResults });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Check your connection and try again.' });
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // THE EXPORT IS FETCHED, NOT LINKED. It used to be `<Button asChild disabled>`
  // wrapping an `<a href>`: with asChild the Button renders a Slot, so
  // `disabled` landed on an anchor, which ignores it — the control was neither
  // dimmed nor blocked at zero learners and downloaded a header-only file. And
  // the anchor was a top-level navigation, so any non-200 from the export route
  // replaced the page with its raw JSON body — which, before Lane S3's
  // migration is applied, is EVERY click ("Cohort results are not switched on
  // yet."). A fetch keeps the failure on this screen, in words.
  const downloadCsv = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/foundation/onemark/results/${assessmentId}/export`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setExportError(body?.error ?? 'Could not build the score list. Please try again.');
        return;
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ??
        'onemark-scores.csv';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Could not reach the server. Check your connection and try again.');
    } finally {
      setExporting(false);
    }
  }, [assessmentId]);

  if (state.kind === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (state.kind === 'denied') {
    // No `requiredPermission` prop: the message already names BOTH doors
    // (the assessment-builder permission or a school owner row), and printing
    // "Required permission: foundation.assessments.manage" underneath it
    // contradicted the sentence above — ruling #1 makes the owner row
    // sufficient on its own.
    return <PermissionError message={state.message} />;
  }

  if (state.kind === 'notReady' || state.kind === 'error') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground">{state.message}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/foundation/onemark/results">Back to results</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { results } = state;
  const summary = summarize(results);
  const bands = scoreDistribution(results);
  const units = unitStrip(results);
  const tags = tagStrip(results);
  const showItemStats = itemStatsVisible(results);
  // A learner report is per subject, so the row only links when the payload
  // names the exam. Without it the name stays plain rather than linking to a
  // page that would 400.
  const examId = results.assessment.exam_definition_id;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Sat"
          value={`${summary.sat}${summary.total ? ` / ${summary.total}` : ''}`}
          note={summary.total ? 'submitted sittings out of the cohort' : 'submitted sittings'}
        />
        <Stat
          label="Average"
          value={summary.average === null ? '—' : String(summary.average)}
          note={
            summary.average === null
              ? 'nobody has submitted yet'
              : // A submitted-but-ungraded live sitting is in `sat` and not in
                // `graded`, so the gap is named rather than left to be noticed.
                [
                  summary.max_score ? `out of ${summary.max_score}` : null,
                  summary.average_pct === null ? null : `${summary.average_pct}%`,
                  summary.graded < summary.sat ? `over ${summary.graded} graded of ${summary.sat}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
          }
        />
        <Stat
          label="Range"
          value={summary.lowest === null ? '—' : `${summary.lowest}–${summary.highest}`}
          note="lowest to highest graded score"
        />
        <Stat
          label="On a device"
          value={summary.sat === 0 ? '—' : String(summary.digital)}
          note="of the submitted sittings, sat on a device rather than on paper"
        />
      </section>

      {bands.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <ScoreDistribution bands={bands} />
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AccuracyStrip
            title="Accuracy by unit"
            rows={units}
            emptyNote="No unit breakdown yet — it appears once a sitting is submitted."
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AccuracyStrip
            title="Accuracy by question type"
            rows={tags}
            emptyNote="No question-type breakdown yet — it appears once a sitting is submitted."
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="text-base font-medium text-foreground">Score list</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Names and scores only. The export carries the same columns — never an answer key or an
              explanation.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={results.learners.length === 0 || exporting}
              onClick={() => void downloadCsv()}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Preparing…' : 'Export CSV'}
            </Button>
            {exportError && <p className="text-xs text-destructive">{exportError}</p>}
          </div>
        </div>
        {results.learners.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nobody has been recorded against this paper yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Roll number</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.learners.map((learner) => (
                  <TableRow key={learner.student_id}>
                    <TableCell className="font-medium text-foreground">
                      {examId ? (
                        <Link
                          className="underline-offset-4 hover:underline"
                          href={`/foundation/onemark/results/learner/${learner.student_id}?exam=${examId}`}
                        >
                          {learner.name}
                        </Link>
                      ) : (
                        learner.name
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {learner.roll_no ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {learner.score === null
                        ? '—'
                        : `${learner.score}${learner.max_score === null ? '' : ` / ${learner.max_score}`}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {STATUS_LABEL[learner.status] ?? learner.status}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {learner.taken_digitally ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Smartphone className="h-3.5 w-3.5" aria-hidden />
                          On a device
                        </span>
                      ) : (
                        <span className="text-sm">On paper</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-base font-medium text-foreground">How each question behaved</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The share who got it right, and the wrong option most of them chose. A question withdrawn after
            the sitting is kept here with a note — no score is ever recalculated because of it.
          </p>
        </div>
        {!showItemStats ? (
          <p className="p-6 text-sm text-muted-foreground">
            Per-question statistics stay hidden until{' '}
            <span className="tabular-nums">{results.min_learners_for_item_stats}</span> learners have
            submitted — below that, a single row identifies a person. The server withholds the rows
            entirely, so they are not in this page&rsquo;s data either. The score list above is unaffected.
          </p>
        ) : results.items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No question-level data for this paper yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Correct</TableHead>
                  <TableHead className="text-right">Answered</TableHead>
                  <TableHead>Most-chosen wrong option</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.items.map((item) => (
                  <TableRow key={item.item_id} className={item.withdrawn ? 'opacity-70' : undefined}>
                    <TableCell className="tabular-nums text-muted-foreground">{item.position ?? '—'}</TableCell>
                    <TableCell className="text-foreground">
                      {item.unit_label ?? 'Not anchored to a unit'}
                      {item.withdrawn && (
                        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          withdrawn
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.p_value === null ? '—' : `${Math.round(item.p_value * 1000) / 10}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.answered}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.top_distractor === null
                        ? '—'
                        : `${item.top_distractor.option_key} · ${item.top_distractor.count}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
