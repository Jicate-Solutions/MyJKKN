'use client';

// =====================================================================
// /pde/admin/feedback-moderation — moderation buttons
// =====================================================================
// Approve / redact / reject buttons per pending note. PATCHes the same
// /api/pde/feedback-moderation surface the page uses for the initial GET.
// Stateless client island; mutations reload the page via router.refresh().
// =====================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'approve' | 'redact' | 'reject';

interface Props {
  demonstrationId: string;
  noteId: string;
}

export function ModerationActions({ demonstrationId, noteId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: Decision) {
    setError(null);
    const res = await fetch('/api/pde/feedback-moderation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demonstrationId,
        noteId,
        decision,
        reason: reason || null,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="rounded border border-border bg-background px-2 py-1 text-xs"
        disabled={isPending}
      />
      <button
        onClick={() => submit('approve')}
        disabled={isPending}
        className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => submit('redact')}
        disabled={isPending}
        className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
      >
        Redact
      </button>
      <button
        onClick={() => submit('reject')}
        disabled={isPending}
        className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
      >
        Reject
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
