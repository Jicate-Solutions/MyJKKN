'use client';

// Past CVViZ uploads, newest first, with how far each one has got.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { IntakeBatchStatus } from '@/types/hr-intake';
import { useIntakeBatches } from '@/hooks/hr/use-recruitment-intake';
import { IntakeEmpty, IntakeError, IntakeLoading } from './intake-states';
import { formatDate } from './intake-labels';

const STATUS_LABEL: Record<IntakeBatchStatus, string> = {
  preparing: 'Still reading',
  ready: 'Ready to review',
  closed: 'Closed',
};

export function BatchList() {
  const { data, isLoading, isError, error, refetch } = useIntakeBatches();

  if (isLoading) return <IntakeLoading label="Loading past uploads…" />;
  if (isError || !data) {
    return <IntakeError title="Could not load past uploads" error={error} onRetry={() => void refetch()} />;
  }
  if (data.length === 0) {
    return (
      <IntakeEmpty
        title="No uploads yet"
        detail="Your first CVViZ upload will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm dark:shadow-none">
      {data.map((b) => (
        <li key={b.id}>
          <Link
            href={`/hr/recruitment/intake/batch?batchId=${encodeURIComponent(b.id)}`}
            className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/40"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-medium text-foreground">{b.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(b.created_at)}
                {b.created_by_name ? ` · ${b.created_by_name}` : ''} · {STATUS_LABEL[b.status] ?? b.status}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.row_count} {b.row_count === 1 ? 'candidate' : 'candidates'} · {b.decided_count} decided ·{' '}
                {b.applied_count} filed
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
