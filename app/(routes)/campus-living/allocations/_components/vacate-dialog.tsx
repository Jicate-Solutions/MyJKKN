'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useVacateAllocation } from '@/hooks/campus-living/use-hostel-allocations';
import { Loader2, LogOut } from 'lucide-react';

// Mirrors vacate_reason_enum on prod (6 values — confirmed via mgmt API 2026-04-22).
// Medical-vacate flow requires additions (separate track, not this PR).
const VACATE_REASONS = [
  { value: 'graduation', label: 'Graduation' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'transfer', label: 'Transfer (inter-institution)' },
  { value: 'disciplinary', label: 'Disciplinary' },
  { value: 'voluntary', label: 'Voluntary' },
  { value: 'semester_end', label: 'Semester End' },
] as const;

type VacateReasonValue = (typeof VACATE_REASONS)[number]['value'];

interface VacateDialogProps {
  allocationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful vacate. Defaults to router-refresh; pass to override. */
  onSuccess?: () => void;
}

export function VacateDialog({
  allocationId,
  open,
  onOpenChange,
  onSuccess,
}: VacateDialogProps) {
  const router = useRouter();
  const vacateMutation = useVacateAllocation();
  const [reason, setReason] = useState<VacateReasonValue | ''>('');
  const [vacateDate, setVacateDate] = useState<string>(
    new Date().toISOString().split('T')[0]!
  );
  const [notes, setNotes] = useState<string>('');

  const isDisabled = !reason || vacateMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    // Service signature: vacate(id, reason) — notes + custom date not yet in the service,
    // so we pass reason only. Service stamps actual_vacate_date = today server-side.
    // Custom date + notes flow needs a service signature extension (noted for follow-up).
    await vacateMutation.mutateAsync({
      id: allocationId,
      payload: { vacate_reason: reason },
    });

    onOpenChange(false);
    setReason('');
    setNotes('');
    if (onSuccess) onSuccess();
    else router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-amber-600" />
              Vacate Allocation
            </DialogTitle>
            <DialogDescription>
              This marks the bed as vacated and stamps the actual vacate date.
              Fee reconciliation and deposit refund are handled separately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vacate-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as VacateReasonValue)}
              >
                <SelectTrigger id="vacate-reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {VACATE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vacate-date">Vacate date</Label>
              <Input
                id="vacate-date"
                type="date"
                value={vacateDate}
                onChange={(e) => setVacateDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground">
                Date picker shown for reference. Current service stamps server-side today; custom
                backdating is a separate follow-up.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vacate-notes">Notes (optional)</Label>
              <Input
                id="vacate-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context for the record"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={vacateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isDisabled}>
              {vacateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm Vacate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
