'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowRight, AlertTriangle, Search, Check, Users } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CounselorSourceService } from '@/lib/services/admission/counselor-source-service';
import {
  useEligibleCounselors,
  type CounselorRoleKey,
} from '@/hooks/admission/use-eligible-counselors';
import type { LeadSourceEnum } from '@/lib/services/admission/source-master-service';

interface ReassignLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceEnum: LeadSourceEnum;
  institutionId?: string | null;
  fromCounselorId: string;
  fromCounselorName: string;
  fromLeadCount: number;
}

const ROLE_OPTIONS: Array<{ value: CounselorRoleKey | 'all'; label: string }> = [
  { value: 'all', label: 'All counselor roles' },
  { value: 'admission_counselor', label: 'Admission Counselor' },
  { value: 'expo_counselor', label: 'Expo Counselor' },
  { value: 'learner_counselor', label: 'Learner Counselor' },
  { value: 'staff_counselor', label: 'Staff Counselor' },
];

const ROLE_BADGE: Record<string, string> = {
  admission_counselor: 'bg-blue-100 text-blue-700 border-blue-200',
  expo_counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  learner_counselor: 'bg-amber-100 text-amber-700 border-amber-200',
  staff_counselor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const ROLE_SHORT_LABEL: Record<string, string> = {
  admission_counselor: 'Admission',
  expo_counselor: 'Expo',
  learner_counselor: 'Learner',
  staff_counselor: 'Staff',
};

export function ReassignLeadsDialog({
  open,
  onOpenChange,
  sourceEnum,
  institutionId,
  fromCounselorId,
  fromCounselorName,
  fromLeadCount,
}: ReassignLeadsDialogProps) {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<CounselorRoleKey | 'all'>('all');
  const [search, setSearch] = useState('');
  const [toCounselorId, setToCounselorId] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const { data: counselors, isLoading } = useEligibleCounselors({
    institutionId,
    excludeCounselorIds: [fromCounselorId],
    enabled: open,
  });

  const filtered = useMemo(() => {
    const all = counselors ?? [];
    return all.filter((c) => {
      if (roleFilter !== 'all' && c.role_key !== roleFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const inName = c.name.toLowerCase().includes(q);
        const inEmail = (c.email ?? '').toLowerCase().includes(q);
        if (!inName && !inEmail) return false;
      }
      return true;
    });
  }, [counselors, roleFilter, search]);

  const selectedCounselor = useMemo(
    () => (counselors ?? []).find((c) => c.id === toCounselorId) ?? null,
    [counselors, toCounselorId]
  );

  const mutation = useMutation({
    mutationFn: () =>
      CounselorSourceService.reassignLeadsBetweenCounselors({
        sourceEnum,
        fromCounselorId,
        toCounselorId,
        institutionId,
        reason: reason || undefined,
      }),
    onSuccess: ({ reassigned }) => {
      toast.success(
        `Reassigned ${reassigned} lead${reassigned === 1 ? '' : 's'}`
      );
      queryClient.invalidateQueries({ queryKey: ['counselors-holding-source-leads'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-source-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['lead-distribution'] });
      queryClient.invalidateQueries({ queryKey: ['source-counselors-with-load'] });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-leads'] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Reassignment failed');
    },
  });

  const reset = () => {
    setRoleFilter('all');
    setSearch('');
    setToCounselorId('');
    setReason('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[95vw] flex-col gap-4 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle className="pr-6">Reassign all leads from this counselor</DialogTitle>
          <DialogDescription>
            Move all {fromLeadCount.toLocaleString()} {sourceEnum} lead
            {fromLeadCount === 1 ? '' : 's'} currently held by{' '}
            <strong>{fromCounselorName}</strong> to a different counselor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6">
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            This is a bulk update — every {sourceEnum} lead currently assigned
            to {fromCounselorName} will be moved to the new counselor in one
            transaction.
          </div>

          {/* Role filter + search row — stacks on small screens */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="sm:w-[200px]">
              <Label htmlFor="role-filter" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Counselor role
              </Label>
              <Select
                value={roleFilter}
                onValueChange={(v) => setRoleFilter(v as CounselorRoleKey | 'all')}
              >
                <SelectTrigger id="role-filter" className="mt-0.5 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="role-search" className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Search
              </Label>
              <div className="relative mt-0.5">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="role-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or email"
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>

          {/* Counselor list — searchable + role-filtered. Replaces native select. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border">
            {isLoading && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
                No counselors{' '}
                {roleFilter !== 'all' && `with role "${ROLE_SHORT_LABEL[roleFilter]}" `}
                {search && `matching "${search}" `}
                available.
              </div>
            )}

            {!isLoading && filtered.length > 0 && (
              <div className="divide-y">
                {filtered.map((c) => {
                  const isSelected = c.id === toCounselorId;
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40 ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="reassign-target"
                        value={c.id}
                        checked={isSelected}
                        onChange={() => setToCounselorId(c.id)}
                        className="h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          {c.role_key && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${ROLE_BADGE[c.role_key] ?? ''}`}
                            >
                              {ROLE_SHORT_LABEL[c.role_key] ?? c.role_key}
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.designation ? `${c.designation} · ` : ''}
                          {c.email}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {c.current_leads ?? 0}
                        {c.max_leads ? ` / ${c.max_leads}` : ''}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-blue-600" />
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected-confirmation strip + reason note */}
          {selectedCounselor && (
            <div className="flex items-center gap-2 rounded-md border bg-blue-50/50 px-3 py-2 text-xs">
              <span className="font-medium">{fromCounselorName}</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className="font-medium">{selectedCounselor.name}</span>
              {selectedCounselor.role_key && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${ROLE_BADGE[selectedCounselor.role_key] ?? ''}`}
                >
                  {ROLE_SHORT_LABEL[selectedCounselor.role_key] ?? selectedCounselor.role_key}
                </Badge>
              )}
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                Load: {selectedCounselor.current_leads ?? 0}
                {selectedCounselor.max_leads ? ` / ${selectedCounselor.max_leads}` : ''}
              </span>
            </div>
          )}

          <div>
            <Label htmlFor="reason" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Reason (optional)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. counselor on leave; redistributing for balance"
              rows={2}
              className="mt-0.5"
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!toCounselorId || mutation.isPending}
          >
            {mutation.isPending
              ? 'Reassigning…'
              : `Reassign ${fromLeadCount.toLocaleString()} lead${fromLeadCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
