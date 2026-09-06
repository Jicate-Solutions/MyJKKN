'use client';

/**
 * Assign one or more staff onto this pattern from a date.
 *
 * A row already on this exact pattern is shown disabled — re-assigning
 * someone already here from the same or an earlier date is a no-op the RPC
 * would otherwise silently accept. A row on ANOTHER pattern stays selectable:
 * picking it here moves them, which is the whole point of the picker.
 */

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/utils';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import {
  useAssignWorkPattern,
  useAssignableStaff,
  type AssignWorkPatternOutcome,
} from '@/hooks/hr/use-work-patterns';
import type { WorkPatternSummary } from '@/types/hr-work-patterns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: WorkPatternSummary;
  institutionId: string;
  onAssigned: (outcome: AssignWorkPatternOutcome) => void;
}

export function AssignStaffDialog({ open, onOpenChange, pattern, institutionId, onAssigned }: Props) {
  const { data: staff = [], isLoading } = useAssignableStaff(open ? institutionId : null);
  const assign = useAssignWorkPattern();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const [notes, setNotes] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q)
        || (s.staff_code ?? '').toLowerCase().includes(q)
        || (s.category_name ?? '').toLowerCase().includes(q),
    );
  }, [staff, query]);

  const toggle = (staffId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(staffId);
      else next.delete(staffId);
      return next;
    });
  };

  const reset = () => {
    setQuery('');
    setSelected(new Set());
    setEffectiveFrom(todayISO());
    setNotes('');
  };

  const handleAssign = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one staff member.');
      return;
    }
    try {
      const result = await assign.mutateAsync({
        staffIds: Array.from(selected),
        patternId: pattern.id,
        effectiveFrom,
        notes: notes.trim() || null,
        institutionId,
      });
      reset();
      onAssigned(result);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign staff to {pattern.name}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, code or category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
            ) : filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No staff match.</p>
            ) : (
              filtered.map((s) => {
                const alreadyHere = s.current_pattern_id === pattern.id;
                const onAnother = s.current_pattern_id && !alreadyHere;
                return (
                  <label
                    key={s.staff_id}
                    className={`flex items-center gap-2 rounded-md p-2 text-sm ${
                      alreadyHere ? 'opacity-50' : 'cursor-pointer hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={alreadyHere || selected.has(s.staff_id)}
                      disabled={alreadyHere}
                      onCheckedChange={(checked) => toggle(s.staff_id, checked === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {s.name}
                        {s.staff_code && (
                          <span className="ml-1 text-xs text-muted-foreground">({s.staff_code})</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.category_name ?? s.designation ?? ''}
                        {alreadyHere && ' · already on this pattern'}
                        {onAnother && ` · on ${s.current_pattern_name}`}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="grid shrink-0 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="assign-effective-from">Effective from</Label>
              <Input
                id="assign-effective-from"
                type="date"
                className="mt-1"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="assign-notes">Notes (optional)</Label>
              <Textarea
                id="assign-notes"
                className="mt-1"
                rows={1}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={assign.isPending || selected.size === 0}>
            {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign {selected.size > 0 ? selected.size : ''} staff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
