'use client';

import { format } from 'date-fns';
import { Flame, Inbox, Loader2, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UnassignedLead } from '@/lib/services/admission/lead-distribution-service';

interface UnassignedLeadListProps {
  leads: UnassignedLead[];
  totalCount: number;
  isLoading: boolean;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  toggleAllVisible: () => void;
  /**
   * Lazy-fetch ALL matching IDs (paginated server-side past PostgREST's 1k cap)
   * and select them. Replaces the legacy 500-cap behaviour.
   */
  selectAllMatching: () => void;
  /** Async state for the lazy "select all" action. */
  isSelectingAll: boolean;
  /** Clear the entire selection across all pages. */
  clearSelection: () => void;
}

export function UnassignedLeadList({
  leads,
  totalCount,
  isLoading,
  selectedIds,
  toggleOne,
  toggleAllVisible,
  selectAllMatching,
  isSelectingAll,
  clearSelection,
}: UnassignedLeadListProps) {
  const allVisibleSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
  const allMatchingSelected =
    totalCount > 0 && selectedIds.size >= totalCount;

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
        No unassigned leads match these filters.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={toggleAllVisible}
          />
          <span>
            Selected: <strong>{selectedIds.size.toLocaleString()}</strong>
            {totalCount > leads.length
              ? ` of ${totalCount.toLocaleString()} matching`
              : ''}
          </span>
        </label>
        <div className="flex items-center gap-1.5">
          {!allMatchingSelected && totalCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={selectAllMatching}
              disabled={isSelectingAll}
            >
              {isSelectingAll ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Loading {totalCount.toLocaleString()}…
                </>
              ) : (
                <>Select all {totalCount.toLocaleString()}</>
              )}
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={clearSelection}
              disabled={isSelectingAll}
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto">
        {leads.map((lead) => (
          <label
            key={lead.id}
            className="flex cursor-pointer items-center gap-3 border-b px-2 py-1.5 text-sm last:border-b-0 hover:bg-muted/40"
          >
            <Checkbox
              checked={selectedIds.has(lead.id)}
              onCheckedChange={() => toggleOne(lead.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{lead.full_name}</span>
                {lead.is_hot_lead && (
                  <Flame className="h-3 w-3 shrink-0 text-orange-500" />
                )}
                {lead.funnel_stage && (
                  <Badge variant="outline" className="text-[10px]">
                    {lead.funnel_stage.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {lead.email ?? lead.phone ?? '—'}
              </div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {format(new Date(lead.created_at), 'MMM d')}
            </span>
          </label>
        ))}
      </div>
      {totalCount > leads.length && (
        <div className="border-t bg-muted/10 px-2 py-1 text-[11px] text-muted-foreground">
          Showing {leads.length.toLocaleString()} of{' '}
          {totalCount.toLocaleString()} unassigned leads. Use "Select all{' '}
          {totalCount.toLocaleString()}" above to include the rest in this run.
        </div>
      )}
    </div>
  );
}
