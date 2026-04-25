'use client';

/**
 * Forward Approval Dialog (v2, 2026-04-21)
 *
 * Lets the current pending approver transfer their step to another staff
 * member in the same institution, with a mandatory comment explaining why.
 *
 * Search is powered by the existing useEligibleSponsors hook (same role
 * allowlist — any faculty/staff/admin, excludes students). We reuse it
 * because the forward target is always a staff member; the search scope
 * matches 1:1 with the sponsor picker.
 *
 * @module app/(routes)/academic/leave-onduty/approvals/_components/forward-dialog
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X, Forward as ForwardIcon } from 'lucide-react';
import { useEligibleSponsors, EligibleSponsor } from '@/hooks/academic/use-leave-onduty';
import { cn } from '@/lib/utils';

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  /** Current approver's profile id — used to exclude self from results */
  approverId: string;
  isSubmitting: boolean;
  onSubmit: (forwardToId: string, comments: string) => void;
}

export function ForwardDialog({
  open,
  onOpenChange,
  institutionId,
  approverId,
  isSubmitting,
  onSubmit,
}: ForwardDialogProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<EligibleSponsor | null>(null);
  const [comments, setComments] = useState('');

  // Debounce (same 250ms as the other pickers)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Reset state each time the dialog opens — otherwise state leaks between
  // successive forward actions on different applications.
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setSelected(null);
      setComments('');
    }
  }, [open]);

  const searchResult = useEligibleSponsors(
    institutionId,
    debouncedQuery,
    !selected && debouncedQuery.length >= 1
  );
  const results = (searchResult.data || []).filter((r) => r.id !== approverId);

  const canSubmit = !!selected && comments.trim().length > 0 && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Forward Application</DialogTitle>
          <DialogDescription>
            Transfer this step to another staff member. Your current pending
            action will be recorded as "forwarded" in the timeline, and the
            forwarded-to staff will receive it as a new pending item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected staff chip */}
          {selected && (
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{selected.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selected.email}
                  {selected.role ? ` · ${selected.role.replace(/_/g, ' ')}` : ''}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected(null)}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Staff search */}
          {!selected && (
            <div className="space-y-2">
              <Label htmlFor="forward-search">Forward to</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forward-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search staff by name or email…"
                  className="pl-9"
                  disabled={isSubmitting}
                />
                {searchResult.isLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {debouncedQuery.length >= 1 && (
                <div className={cn('rounded-md border bg-popover max-h-56 overflow-y-auto')}>
                  {searchResult.isLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching…</div>
                  ) : results.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      No matching staff found.
                    </div>
                  ) : (
                    <ul className="py-1">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{r.full_name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {r.email}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs capitalize">
                              {r.role.replace(/_/g, ' ')}
                            </Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Comment (required) */}
          <div className="space-y-2">
            <Label htmlFor="forward-comments">
              Comment<span className="text-red-500 ml-1">*</span>
            </Label>
            <Textarea
              id="forward-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Tell the forwarded-to staff why you're transferring this step to them…"
              className="min-h-[100px]"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => selected && onSubmit(selected.id, comments.trim())}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Forwarding…
              </>
            ) : (
              <>
                <ForwardIcon className="h-4 w-4 mr-2" />
                Forward
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
