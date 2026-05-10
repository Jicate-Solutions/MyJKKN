'use client';

import { format } from 'date-fns';
import { Flame, Inbox } from 'lucide-react';
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
  selectAllMatching: () => void;
}

const MAX_SELECT_ALL = 500;

export function UnassignedLeadList({
  leads,
  totalCount,
  isLoading,
  selectedIds,
  toggleOne,
  toggleAllVisible,
  selectAllMatching,
}: UnassignedLeadListProps) {
  const allVisibleSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

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
      <div className="flex items-center justify-between border-b bg-muted/30 px-2 py-1.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
          <span>
            Selected: <strong>{selectedIds.size}</strong>
            {totalCount > leads.length ? ` (across all matching: ${totalCount})` : ''}
          </span>
        </label>
        {totalCount > leads.length && totalCount <= MAX_SELECT_ALL && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={selectAllMatching}>
            Select all {totalCount} matching
          </Button>
        )}
        {totalCount > MAX_SELECT_ALL && (
          <span className="text-orange-600">More than {MAX_SELECT_ALL} matching — narrow filters</span>
        )}
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
    </div>
  );
}
