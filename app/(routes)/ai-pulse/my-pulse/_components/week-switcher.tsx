'use client';

// Learner "week switcher" for My AI Pulse. Lets a learner browse any past AI
// Pulse cycle read-only: the whole page re-scopes to the selected cycle via the
// `?cycle=<id>` param. Cycles arrive newest-first from the server (already
// permission-filtered), so index 0 is the newest week.
//
// No useSearchParams here on purpose — the selected id is passed in from the
// server component (which read searchParams server-side), so this stays a plain
// router.push and needs no <Suspense> wrapper.

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface SwitcherCycle {
  id: string;
  label: string;
}

export function WeekSwitcher({
  cycles,
  selectedId,
}: {
  cycles: SwitcherCycle[];
  selectedId: string | null;
}) {
  const router = useRouter();

  if (cycles.length === 0) return null;

  const idx = Math.max(
    0,
    cycles.findIndex((c) => c.id === selectedId)
  );
  // Newest-first array: a lower index is a more recent week.
  const newer = idx > 0 ? cycles[idx - 1] : null;
  const older = idx < cycles.length - 1 ? cycles[idx + 1] : null;

  const go = (id: string) => router.push(`/ai-pulse/my-pulse?cycle=${id}`);

  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-card p-1 shadow-sm">
      <button
        type="button"
        onClick={() => older && go(older.id)}
        disabled={!older}
        aria-label="Previous week"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      <label className="sr-only" htmlFor="ai-pulse-week-select">
        Select AI Pulse week
      </label>
      <select
        id="ai-pulse-week-select"
        value={selectedId ?? cycles[0]?.id ?? ''}
        onChange={(e) => go(e.target.value)}
        className="h-8 min-w-[9rem] rounded-md bg-transparent px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => newer && go(newer.id)}
        disabled={!newer}
        aria-label="Next week"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
