'use client';

// OneMark — Wave 3 Lane A. One learner's report.
//
// Wraps Lane S3's fn_onemark_learner_report, which itself wraps the existing
// fn_fp_student_progress — nothing here recomputes progress. The RPC's caller
// check is fn_fp_can_view_student, which admits the learner themselves, so this
// screen carries no client permission test; a refusal renders as an explicit
// message (CLAUDE.md #27), never a redirect.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionError } from '@/components/errors/permission-error';
import type { LearnerReport } from '@/lib/services/onemark/results-service';
import { AccuracyStrip } from '../../../_components/charts';

const MODE_LABEL: Record<string, string> = {
  practice: 'Practice',
  timed: 'Timed',
  live: 'Live paper',
  vault_review: 'Vault review',
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

export function LearnerReportView({ studentId, examId }: { studentId: string; examId: string | null }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'needsExam' }
    | { kind: 'denied'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; report: LearnerReport }
  >({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!examId) {
      setState({ kind: 'needsExam' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const res = await fetch(
        `/api/foundation/onemark/results/learner/${studentId}?exam=${encodeURIComponent(examId)}`,
        { cache: 'no-store' },
      );
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setState({ kind: 'denied', message: body?.error ?? 'You do not have access to this report.' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: body?.error ?? 'Could not load this report.' });
        return;
      }
      setState({ kind: 'ready', report: body.report as LearnerReport });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Check your connection and try again.' });
    }
  }, [studentId, examId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (state.kind === 'needsExam') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground">
          A report is per subject, so this page needs to know which one. Open it from a cohort sheet, where
          the subject is already known.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/foundation/onemark/results">Back to results</Link>
        </Button>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return <PermissionError message={state.message} showBackButton />;
  }

  if (state.kind === 'error') {
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

  const { report } = state;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-medium text-foreground">{report.student.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {[report.student.roll_no, report.student.cohort_label, report.exam.name]
            .filter((part) => typeof part === 'string' && part)
            .join(' · ') || 'OneMark report'}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Questions attempted" value={String(report.progress.attempted)} />
        <Stat label="Correct" value={String(report.progress.correct)} />
        <Stat
          label="Accuracy"
          value={report.progress.accuracy === null ? '—' : `${report.progress.accuracy}%`}
          note={report.progress.accuracy === null ? 'nothing attempted yet' : undefined}
        />
        <Stat
          label="Mistake vault"
          value={`${report.vault.active} active`}
          note={
            report.vault.next_due_at
              ? `${report.vault.mastered} mastered · next review ${new Date(report.vault.next_due_at).toLocaleDateString()}`
              : `${report.vault.mastered} mastered`
          }
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <AccuracyStrip
          title="Accuracy by unit"
          rows={report.topics}
          emptyNote="No unit breakdown yet — it appears once questions have been answered."
        />
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h3 className="text-base font-medium text-foreground">Recent sittings</h3>
          <p className="mt-1 text-sm text-muted-foreground">The last ten, most recent first.</p>
        </div>
        {report.sittings.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No sittings recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {report.sittings.map((sitting) => (
              <li key={sitting.attempt_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {sitting.mode ? (MODE_LABEL[sitting.mode] ?? sitting.mode) : 'Sitting'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {sitting.taken_at ? new Date(sitting.taken_at).toLocaleString() : 'Date not recorded'}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-foreground">
                  {sitting.score === null
                    ? '—'
                    : `${sitting.score}${sitting.max_score === null ? '' : ` / ${sitting.max_score}`}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
