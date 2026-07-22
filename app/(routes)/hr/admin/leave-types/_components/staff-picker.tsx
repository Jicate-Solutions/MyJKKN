'use client';

/**
 * Type-ahead multi-select over active staff in one institution.
 *
 * Queries the staff table directly, not a role allow-list — a role list
 * answers "who may log in", which is a different set from "who works here".
 *
 * The search term is debounced rather than firing per keystroke, and the
 * previous result set stays visible while a new one loads so the list does not
 * flash empty as you type.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useStaffSearch } from '@/hooks/hr/use-leave-assignments';
import { LeaveAssignmentService } from '@/lib/services/hr/leave-assignment-service';
import type { StaffPickerOption } from '@/types/hr-leave-assignments';

export function StaffPicker({
  institutionId,
  selected,
  onChange,
  excludeIds,
}: {
  institutionId: string | undefined;
  selected: StaffPickerOption[];
  onChange: (next: StaffPickerOption[]) => void;
  /** Already-assigned staff — shown as unavailable rather than hidden. */
  excludeIds?: Set<string>;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce in an effect is the legitimate case: it synchronises with a timer,
  // an external system, and cleans up on change.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isLoading } = useStaffSearch(institutionId, debounced);

  // The service fetches cap+1 so "exactly the cap" and "more than the cap" are
  // distinguishable. Show the cap, and only claim truncation when the extra
  // row actually came back.
  const LIMIT = LeaveAssignmentService.STAFF_SEARCH_LIMIT;
  const truncated = (data?.length ?? 0) > LIMIT;
  const options = useMemo(() => (data ?? []).slice(0, LIMIT), [data, LIMIT]);
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const toggle = (opt: StaffPickerOption) => {
    if (excludeIds?.has(opt.id)) return;
    onChange(
      selectedIds.has(opt.id)
        ? selected.filter((s) => s.id !== opt.id)
        : [...selected, opt]
    );
  };

  return (
    <div className="space-y-2">
      <Label>Search team members</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search by name or code…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      <div className="max-h-52 overflow-y-auto rounded-md border">
        {isLoading && !data ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : options.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {debounced ? 'No team member matches that.' : 'No active team members found.'}
          </p>
        ) : (
          options.map((o) => {
            const isSelected = selectedIds.has(o.id);
            const isExcluded = excludeIds?.has(o.id) ?? false;
            return (
              <button
                key={o.id}
                type="button"
                disabled={isExcluded}
                onClick={() => toggle(o)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  isExcluded
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-muted/60',
                  isSelected && 'bg-primary/5'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {o.staff_code ?? 'no code'}
                    {o.department_name ? ` · ${o.department_name}` : ' · no department'}
                  </span>
                </span>
                {isExcluded ? (
                  <span className="shrink-0 text-xs text-muted-foreground">assigned</span>
                ) : isSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {LIMIT} matches — narrow the search to see others.
        </p>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1 font-normal">
              {s.staff_code ?? s.name}
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 p-0 hover:bg-transparent"
                aria-label={`Remove ${s.name}`}
                onClick={() => toggle(s)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
