'use client';

// ProgramTabs — horizontal-scroll tab strip showing the list of programs for
// the current institution scope, with per-program lead counts. Clicking a
// chip filters the leads table by that program_id. "All" clears the filter.
//
// Rendered inside the LeadsDataTable toolbar; hides itself until a valid
// institutionId is known (non-global users always have one, global users must
// pick one from the College dropdown first).

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ProgramCount {
  program_id: string;
  program_name: string;
  count: number;
}

interface ProgramCountsResponse {
  data: ProgramCount[];
  total: number;
  totalWithProgram?: number;
}

interface ProgramTabsProps {
  institutionId: string | null | undefined;
  selectedProgramId: string | null;
  onSelect: (programId: string | null) => void;
  /** Key that changes to force a refetch (e.g. after create/delete). */
  refetchKey?: number;
}

export function ProgramTabs({
  institutionId,
  selectedProgramId,
  onSelect,
  refetchKey = 0,
}: ProgramTabsProps) {
  const [counts, setCounts] = useState<ProgramCount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Without an institution we can't render sensible counts. Global
    // (super_admin / admission_global) users will pick a college first —
    // until then, the tab strip stays hidden.
    if (!institutionId) {
      setCounts([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ institution_id: institutionId });
        const res = await fetch(
          `/api/admission/leads/program-counts?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (HTTP ${res.status})`);
        }
        const json: ProgramCountsResponse = await res.json();
        if (cancelled) return;
        setCounts(json.data || []);
        setTotal(json.total || 0);
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.error('[ProgramTabs] fetch error:', err);
        setError(err?.message || 'Failed to load programs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [institutionId, refetchKey]);

  if (!institutionId) return null;

  if (loading && counts.length === 0) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Skeleton className="h-8 w-20 shrink-0" />
        <Skeleton className="h-8 w-32 shrink-0" />
        <Skeleton className="h-8 w-32 shrink-0" />
        <Skeleton className="h-8 w-28 shrink-0" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-destructive py-1">
        Couldn&apos;t load programs: {error}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <Button
          type="button"
          variant={selectedProgramId === null ? 'default' : 'outline'}
          size="sm"
          className="h-8 shrink-0 px-3 text-xs"
          onClick={() => onSelect(null)}
        >
          All
          <span
            className={cn(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              selectedProgramId === null
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {total}
          </span>
        </Button>

        {counts.map((p) => {
          const active = selectedProgramId === p.program_id;
          return (
            <Button
              key={p.program_id}
              type="button"
              variant={active ? 'default' : 'outline'}
              size="sm"
              className="h-8 shrink-0 px-3 text-xs"
              onClick={() => onSelect(active ? null : p.program_id)}
              title={p.program_name}
            >
              <span className="max-w-[180px] truncate">{p.program_name}</span>
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {p.count}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
