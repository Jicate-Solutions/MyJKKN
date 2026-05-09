'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, Users } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';

import {
  useEligibleCounselors,
  type EligibleCounselor,
  type CounselorRoleKey,
} from '@/hooks/admission/use-eligible-counselors';
import { CounselorSourceService } from '@/lib/services/admission/counselor-source-service';

const ROLE_BADGE_VARIANT: Record<CounselorRoleKey, string> = {
  admission_counselor: 'bg-blue-100 text-blue-700 border-blue-200',
  expo_counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  learner_counselor: 'bg-amber-100 text-amber-700 border-amber-200',
  staff_counselor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const ROLE_SHORT_LABEL: Record<CounselorRoleKey, string> = {
  admission_counselor: 'Admission',
  expo_counselor: 'Expo',
  learner_counselor: 'Learner',
  staff_counselor: 'Staff',
};

interface CounselorPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  institutionId?: string | null;
  excludeCounselorIds: string[];
  onAssigned?: (createdCount: number) => void;
}

export function CounselorPickerDialog({
  open,
  onOpenChange,
  sourceId,
  institutionId,
  excludeCounselorIds,
  onAssigned,
}: CounselorPickerDialogProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultCap, setDefaultCap] = useState<string>('');
  const [defaultWeight, setDefaultWeight] = useState<string>('1.0');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [effectiveTo, setEffectiveTo] = useState<string>('');

  const { data: counselors, isLoading } = useEligibleCounselors({
    institutionId,
    search,
    excludeCounselorIds,
    enabled: open,
  });

  const grouped = useMemo(() => {
    const map = new Map<CounselorRoleKey, EligibleCounselor[]>();
    for (const c of counselors ?? []) {
      if (!c.role_key) continue;
      const list = map.get(c.role_key) ?? [];
      list.push(c);
      map.set(c.role_key, list);
    }
    return map;
  }, [counselors]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (role: CounselorRoleKey, ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allChecked = ids.every((id) => next.has(id));
      ids.forEach((id) => (allChecked ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const reset = () => {
    setSearch('');
    setSelected(new Set());
    setDefaultCap('');
    setDefaultWeight('1.0');
    setEffectiveFrom('');
    setEffectiveTo('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      return CounselorSourceService.bulkAttach(
        sourceId,
        Array.from(selected),
        {
          priority_weight: Number(defaultWeight) || 1.0,
          max_leads_per_day: defaultCap ? Number(defaultCap) : null,
          effective_from: effectiveFrom || null,
          effective_to: effectiveTo || null,
          is_paused: false,
        }
      );
    },
    onSuccess: ({ created, skipped }) => {
      toast.success(
        `Assigned ${created} counselor${created === 1 ? '' : 's'}` +
          (skipped > 0 ? ` (${skipped} already attached)` : '')
      );
      queryClient.invalidateQueries({
        queryKey: ['counselor-source-assignments', sourceId],
      });
      queryClient.invalidateQueries({ queryKey: ['admission-sources-master'] });
      onAssigned?.(created);
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to assign counselors'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Assign counselors to this source</DialogTitle>
          <DialogDescription>
            Pick one or more counselors. Defaults below apply to every counselor
            you select — you can fine-tune each one after assigning.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[260px] rounded-md border">
            {isLoading && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}

            {!isLoading && (counselors?.length ?? 0) === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
                No eligible counselors{' '}
                {excludeCounselorIds.length > 0 && '(remaining after exclusions) '}
                {search && `for "${search}"`}.
              </div>
            )}

            {!isLoading && (counselors?.length ?? 0) > 0 && (
              <div className="p-1">
                {Array.from(grouped.entries()).map(([role, list]) => {
                  const ids = list.map((c) => c.id);
                  const allInGroup = ids.every((id) => selected.has(id));
                  return (
                    <div key={role} className="mb-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(role, ids)}
                        className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted rounded"
                      >
                        <span>
                          {ROLE_SHORT_LABEL[role]} Counselors ({list.length})
                        </span>
                        <span className="text-[10px]">
                          {allInGroup ? 'Unselect all' : 'Select all'}
                        </span>
                      </button>
                      {list.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-3 px-2 py-2 hover:bg-muted/50 rounded text-sm"
                        >
                          <Checkbox
                            checked={selected.has(c.id)}
                            onCheckedChange={() => toggleOne(c.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {c.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${ROLE_BADGE_VARIANT[role]}`}
                              >
                                {ROLE_SHORT_LABEL[role]}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {c.designation ? `${c.designation} · ` : ''}
                              {c.email}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {c.current_leads ?? 0} active
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="col-span-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Defaults applied to selection
            </div>
            <div>
              <Label htmlFor="default-cap" className="text-xs">
                Daily cap (optional)
              </Label>
              <Input
                id="default-cap"
                type="number"
                min={1}
                value={defaultCap}
                onChange={(e) => setDefaultCap(e.target.value)}
                placeholder="No cap"
              />
            </div>
            <div>
              <Label htmlFor="default-weight" className="text-xs">
                Priority weight
              </Label>
              <Input
                id="default-weight"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={defaultWeight}
                onChange={(e) => setDefaultWeight(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="from" className="text-xs">
                Effective from
              </Label>
              <Input
                id="from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">
                Effective to
              </Label>
              <Input
                id="to"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={selected.size === 0 || mutation.isPending}
          >
            {mutation.isPending
              ? 'Assigning...'
              : `Assign ${selected.size || ''} counselor${selected.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
