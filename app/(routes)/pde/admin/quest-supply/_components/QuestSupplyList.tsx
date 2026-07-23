'use client';

/**
 * QuestSupplyList — client subcomponent for /pde/admin/quest-supply.
 *
 * Renders the proposed-quest list with an "Approve" button per row that
 * PATCHes /api/pde/quest-supply?id=<id>&action=approve. Optimistically
 * removes the row from view; refreshes the route on completion.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ProposedQuestRow } from '@/lib/services/pde-quest-supply-service';

interface Props {
  initialRows: ProposedQuestRow[];
}

export function QuestSupplyList({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ProposedQuestRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function approve(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/pde/quest-supply?id=${id}&action=approve`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Approve failed (${res.status})`);
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e?.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        No proposed quests pending review.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((q) => (
          <li key={q.id} className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{q.title}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {q.source_type ?? 'unknown source'}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {q.description}
              </p>
              {q.source_contact ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Contact: {q.source_contact}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => approve(q.id)}
              disabled={busyId === q.id || isPending}
              className="inline-flex shrink-0 items-center rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busyId === q.id ? 'Approving…' : 'Approve'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
