'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowRight, AlertTriangle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CounselorSourceService } from '@/lib/services/admission/counselor-source-service';
import { useEligibleCounselors } from '@/hooks/admission/use-eligible-counselors';
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
  const [toCounselorId, setToCounselorId] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const { data: counselors, isLoading } = useEligibleCounselors({
    institutionId,
    excludeCounselorIds: [fromCounselorId],
    enabled: open,
  });

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
      // Invalidate everything that could reflect the move
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
    setToCounselorId('');
    setReason('');
  };

  const selectedCounselor = (counselors ?? []).find((c) => c.id === toCounselorId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Reassign all leads from this counselor</DialogTitle>
          <DialogDescription>
            Move all {fromLeadCount.toLocaleString()} {sourceEnum} lead
            {fromLeadCount === 1 ? '' : 's'} currently held by{' '}
            <strong>{fromCounselorName}</strong> to a different counselor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            This is a bulk update — every {sourceEnum} lead currently assigned
            to {fromCounselorName} will be moved to the new counselor in one
            transaction. Consider whether to also pause the source mapping for{' '}
            {fromCounselorName} so they don't immediately receive new
            auto-routed leads.
          </div>

          <div>
            <Label htmlFor="to-counselor" className="text-xs uppercase tracking-wide text-muted-foreground">
              Move leads to
            </Label>
            <select
              id="to-counselor"
              value={toCounselorId}
              onChange={(e) => setToCounselorId(e.target.value)}
              disabled={isLoading || mutation.isPending}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">— Select a counselor —</option>
              {(counselors ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.designation ? ` (${c.designation})` : ''}
                  {c.email ? ` · ${c.email}` : ''}
                </option>
              ))}
            </select>
            {selectedCounselor && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{fromCounselorName}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="font-medium">{selectedCounselor.name}</span>
                {selectedCounselor.current_leads !== null && (
                  <Badge variant="outline" className="text-[10px]">
                    Current load: {selectedCounselor.current_leads}
                    {selectedCounselor.max_leads ? ` / ${selectedCounselor.max_leads}` : ''}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="reason" className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason (optional)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. counselor on leave; redistributing for balance"
              rows={2}
              className="mt-1"
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
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
