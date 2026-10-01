'use client';

// The review screen for one CVViZ upload: a summary strip, the two batch
// actions, then one card per candidate. Nothing reaches MyJKKN until a person
// taps "File decided candidates", and that reports every row on its own.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ListChecks, Loader2, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApplyResult, DecideRequest } from '@/types/hr-intake';
import {
  useApplyIntake,
  useDecideIntakeRow,
  useDiscardIntakeBatch,
  useIntakeBatch,
} from '@/hooks/hr/use-recruitment-intake';
import { CandidateCard } from './candidate-card';
import { IntakeEmpty, IntakeError, IntakeLoading } from './intake-states';
import { candidateName, duplicateText, formatDate, sortRows, summarise } from './intake-labels';

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.';
}

export function BatchReview({ batchId }: { batchId: string }) {
  const { data, isLoading, isError, error, refetch } = useIntakeBatch(batchId);
  const decideMutation = useDecideIntakeRow(batchId);
  const apply = useApplyIntake(batchId);
  const discard = useDiscardIntakeBatch(batchId);
  const router = useRouter();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const rows = useMemo(() => sortRows(data?.rows ?? []), [data?.rows]);
  const numberById = useMemo(() => new Map(rows.map((r, i) => [r.id, i + 1])), [rows]);
  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, candidateName(r)])), [rows]);
  const summary = useMemo(() => summarise(rows), [rows]);

  if (isLoading) return <IntakeLoading label="Loading the candidates in this upload…" />;
  if (isError || !data) {
    return (
      <IntakeError
        title="Could not load this upload"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  const { batch, open_jobs: openJobs } = data;

  async function handleDecide(rowId: string, req: DecideRequest) {
    try {
      await decideMutation.mutateAsync({ rowId, req });
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  async function handleApply() {
    setApplyError(null);
    setApplyResults(null);
    try {
      const results = await apply.mutateAsync(summary.toApply);
      setApplyResults(results);
    } catch (e) {
      setApplyError(errorMessage(e));
    }
  }

  async function handleDiscard() {
    try {
      await discard.mutateAsync();
      toast.success('Upload discarded. Candidates already filed stay in MyJKKN.');
      router.push('/hr/recruitment/intake');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const filedNow = applyResults?.filter((r) => r.ok).length ?? 0;
  const failedNow = applyResults?.filter((r) => !r.ok) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Review: {batch.file_name}</h1>
          <p className="text-sm text-muted-foreground">
            Uploaded{batch.created_by_name ? ` by ${batch.created_by_name}` : ''} on{' '}
            {formatDate(batch.created_at)} · {batch.row_count}{' '}
            {batch.row_count === 1 ? 'candidate' : 'candidates'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/hr/recruitment/intake/rules">
            <ListChecks className="mr-1.5 h-4 w-4" aria-hidden="true" /> Learned rules
          </Link>
        </Button>
      </div>

      {batch.status === 'preparing' && (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          The helper is still reading this upload. Cards may still change —{' '}
          <button type="button" className="underline underline-offset-4" onClick={() => void refetch()}>
            refresh
          </button>{' '}
          in a minute.
        </p>
      )}

      {/* Summary strip */}
      <dl
        aria-label="Summary"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {[
          { label: 'Ready to file', value: summary.readyToFile },
          { label: 'Needs a new job', value: summary.needsNewJob },
          { label: 'Duplicates', value: summary.duplicates },
          { label: 'Decided', value: `${summary.decided} of ${summary.total}` },
          { label: 'Filed', value: summary.filed },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3 shadow-sm dark:shadow-none">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-bold tracking-tight text-foreground">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Batch actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          disabled={summary.toApply.length === 0 || apply.isPending}
          onClick={() => void handleApply()}
        >
          {apply.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          File decided candidates into MyJKKN ({summary.toApply.length})
        </Button>
      </div>
      <div>
        {confirmDiscard ? (
          <div
            role="group"
            aria-label="Confirm discard"
            className="flex flex-col gap-2 rounded-lg border border-red-600/30 p-3 text-sm dark:border-red-400/30 sm:flex-row sm:items-center"
          >
            <p className="flex-1 text-foreground">
              Discard this upload? Its cards and the resume copies are deleted. Candidates already filed into MyJKKN stay.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={discard.isPending}
                onClick={() => void handleDiscard()}
              >
                {discard.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                Yes, discard
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Discard this upload
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Filing adds each decided candidate as an application under the chosen job, with their resume. Rows are filed one by one: if one fails, the others still go through.
      </p>

      {/* Per-row filing results */}
      {applyError && (
        <IntakeError title="Filing did not run" error={new Error(applyError)} />
      )}
      {applyResults && (
        <section
          aria-label="Filing results"
          className="space-y-2 rounded-xl border border-border p-4 text-sm"
        >
          <p className="font-medium text-foreground">
            Filed {filedNow} of {applyResults.length}.
            {failedNow.length > 0 && ` ${failedNow.length} could not be filed:`}
          </p>
          {failedNow.length > 0 && (
            <ul className="space-y-1">
              {failedNow.map((r) => (
                <li key={r.row_id} className="text-red-600 dark:text-red-400">
                  {nameById.get(r.row_id) ?? 'A candidate'}
                  {numberById.has(r.row_id) && ` (card ${numberById.get(r.row_id)})`}:{' '}
                  {r.error || 'no reason given'}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Cards */}
      {rows.length === 0 ? (
        <IntakeEmpty
          title="This upload has no candidates"
          detail="The export had no rows the helper could read. Check that you exported candidates, not jobs, from CVViZ."
        />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          {rows.map((row, i) => (
            <CandidateCard
              key={row.id}
              row={row}
              cardNumber={i + 1}
              openJobs={openJobs}
              duplicateNote={duplicateText(row, numberById)}
              onDecide={(req) => handleDecide(row.id, req)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
