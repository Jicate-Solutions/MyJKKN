'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, Users, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      <DialogContent className="flex max-h-[92vh] w-[95vw] flex-col gap-4 overflow-hidden sm:max-w-[640px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Assign counselors to this source</DialogTitle>
          <DialogDescription>
            Pick one or more counselors. Defaults below apply to every counselor
            you select — you can fine-tune each one after assigning.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9"
            />
          </div>

          {/* Quick assign by role — chips for each of the 4 counselor roles
              with current/visible counts. Clicking toggles ALL users of that
              role (within the active search filter) into the selection. */}
          {!isLoading && (counselors?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/20 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                Assign by role:
              </span>
              {(Object.keys(ROLE_SHORT_LABEL) as CounselorRoleKey[]).map((roleKey) => {
                const groupUsers = grouped.get(roleKey) ?? [];
                if (groupUsers.length === 0) {
                  return (
                    <span
                      key={roleKey}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground/60"
                      title={`No ${ROLE_SHORT_LABEL[roleKey].toLowerCase()} counselors available`}
                    >
                      {ROLE_SHORT_LABEL[roleKey]} (0)
                    </span>
                  );
                }
                const ids = groupUsers.map((c) => c.id);
                const allSelected = ids.every((id) => selected.has(id));
                const someSelected = !allSelected && ids.some((id) => selected.has(id));
                return (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => toggleGroup(roleKey, ids)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                      allSelected
                        ? `${ROLE_BADGE_VARIANT[roleKey]} ring-2 ring-offset-1 ring-current`
                        : someSelected
                          ? ROLE_BADGE_VARIANT[roleKey]
                          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    title={
                      allSelected
                        ? `Click to unselect all ${ROLE_SHORT_LABEL[roleKey].toLowerCase()} counselors`
                        : `Click to select all ${ids.length} ${ROLE_SHORT_LABEL[roleKey].toLowerCase()} counselors`
                    }
                  >
                    {allSelected && <Check className="h-3 w-3" />}
                    {!allSelected && <Users className="h-3 w-3" />}
                    {ROLE_SHORT_LABEL[roleKey]} ({ids.length})
                  </button>
                );
              })}
            </div>
          )}

          {/* Native overflow-y-auto is more flex-friendly than Radix ScrollArea
              here. The Root → Viewport chain in ScrollArea doesn't always
              propagate flex-derived heights, leaving the inner Viewport at
              content-height and disabling scrolling. */}
          <div className="min-h-[180px] flex-1 overflow-y-auto overscroll-contain rounded-md border">
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
                        className="sticky top-0 z-10 flex w-full items-center justify-between rounded bg-background/95 px-2 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80 hover:bg-muted"
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
                          className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selected.has(c.id)}
                            onCheckedChange={() => toggleOne(c.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {c.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${ROLE_BADGE_VARIANT[role]}`}
                              >
                                {ROLE_SHORT_LABEL[role]}
                              </Badge>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {c.designation ? `${c.designation} · ` : ''}
                              {c.email}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {c.current_leads ?? 0} active
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3 border-t pt-3">
            <div className="col-span-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
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
