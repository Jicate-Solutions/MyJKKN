'use client';

// OneMark — Wave 3 Lane A. The results index: the caller's papers, with how
// many learners sat each one.
//
// THE SERVER OWNS THE ACCESS DECISION. There is no client-side permission
// check here on purpose: ruling #1 gives a principal who holds only a
// school_jkkn_owners row the right to every cohort sheet for that school, and
// such a caller has no foundation.assessments.manage permission to test. A
// canAccess() guard on this page would lock out exactly the person the ruling
// admits. The route answers 403 with the reason, and that is what renders.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionError } from '@/components/errors/permission-error';
import type { ResultsPaperSummary } from '@/lib/services/onemark/results-service';

interface Loaded {
  papers: ResultsPaperSummary[];
}

export function ResultsIndex() {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'denied'; message: string } | { kind: 'error'; message: string } | ({ kind: 'ready' } & Loaded)
  >({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/foundation/onemark/results', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setState({ kind: 'denied', message: body?.error ?? 'You do not have access to OneMark results.' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: body?.error ?? 'Could not load OneMark results.' });
        return;
      }
      setState({ kind: 'ready', papers: Array.isArray(body?.papers) ? body.papers : [] });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server. Check your connection and try again.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (state.kind === 'denied') {
    return <PermissionError message={state.message} requiredPermission="foundation.assessments.manage" />;
  }

  if (state.kind === 'error') {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground">{state.message}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (state.papers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center shadow-sm">
        <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-4 text-base font-medium text-foreground">No papers to report on yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          A paper appears here once you have built one and a cohort has sat it. Results are counted from
          submitted sittings only.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link href="/foundation/onemark/paper">Build a paper</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.papers.map((paper) => (
        <li key={paper.id}>
          <Link
            href={`/foundation/onemark/results/${paper.id}`}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-[#0b6d41]/40 hover:shadow-md"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-foreground">{paper.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {paper.cohort_label && <span className="truncate">{paper.cohort_label}</span>}
                <span className="tabular-nums">
                  {paper.sat} of {paper.total || '—'} sat
                </span>
                <span className="tabular-nums">
                  {paper.average === null ? 'no average yet' : `average ${paper.average}`}
                  {paper.question_count > 0 && paper.average !== null ? ` / ${paper.question_count}` : ''}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide">
                  {paper.state.toLowerCase()}
                </span>
                {paper.via_school_owner && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                    your school
                  </span>
                )}
              </p>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-[#0b6d41] transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
