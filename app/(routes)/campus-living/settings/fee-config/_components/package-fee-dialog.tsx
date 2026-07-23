'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useHostelFees } from '@/hooks/campus-living/use-hostel-fees';
import { useActiveHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import {
  FEE_FREQUENCY_LABELS,
  type FeeFrequency,
  type HostelFee,
} from '@/types/hostel-fees';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Default hostel year for a new fee (from the page's year selector). */
  hostelYearId: string;
  fee?: HostelFee | null;
}

export function PackageFeeDialog({ open, onOpenChange, mode, hostelYearId, fee }: Props) {
  const isEdit = mode === 'edit';
  const { hostelYears } = useActiveHostelYears();
  const { packages } = useAdmissionPackages({ is_active: true, limit: 1000 });

  const [yearId, setYearId] = useState<string>(hostelYearId);
  const [packageId, setPackageId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [frequency, setFrequency] = useState<FeeFrequency>('annual');
  const [submitting, setSubmitting] = useState(false);

  // Mutations + existing rows are scoped to the selected year, so the
  // "already priced" exclusion is per package + year (matches uq_hf_package).
  const { fees, createFee, updateFee } = useHostelFees(yearId);

  useEffect(() => {
    if (!open) return;
    if (isEdit && fee) {
      setYearId(fee.hostel_year_id);
      setPackageId(fee.package_id ?? '');
      setAmount(fee.amount);
      setFrequency(fee.frequency);
    } else {
      setYearId(hostelYearId);
      setPackageId('');
      setAmount(0);
      setFrequency('annual');
    }
  }, [open, isEdit, fee, hostelYearId]);

  const pricedPackageIds = useMemo(
    () =>
      new Set(
        fees
          .filter((f) => f.package_id && f.id !== fee?.id)
          .map((f) => f.package_id as string)
      ),
    [fees, fee?.id]
  );
  const packageOptions = useMemo(
    () => (packages ?? []).filter((p) => isEdit || !pricedPackageIds.has(p.id)),
    [packages, pricedPackageIds, isEdit]
  );

  const canSave = !!yearId && !!packageId && Number.isFinite(amount) && amount >= 0;

  const handleSave = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      if (isEdit && fee) {
        await updateFee(fee.id, { amount, frequency });
        toast.success('Package fee updated');
      } else {
        await createFee({
          hostel_year_id: yearId,
          package_id: packageId,
          amount,
          frequency,
        });
        toast.success('Package fee added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save package fee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Package Fee' : 'Add Package Fee'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the amount or frequency. The package and hostel year cannot be changed.'
              : 'Set a single flat all-in fee for a package (bundled room + mess) for a hostel year.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Hostel Year</Label>
            <Select
              value={yearId}
              onValueChange={(v) => {
                setYearId(v);
                setPackageId(''); // a package may already be priced in another year
              }}
              disabled={isEdit || (hostelYears?.length ?? 0) === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select hostel year" />
              </SelectTrigger>
              <SelectContent>
                {(hostelYears ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Package</Label>
            <Select
              value={packageId}
              onValueChange={setPackageId}
              disabled={isEdit || packageOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    packageOptions.length === 0
                      ? 'No packages available for this year'
                      : 'Select package'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {packageOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount (INR)</Label>
              <Input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as FeeFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(FEE_FREQUENCY_LABELS) as [FeeFrequency, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? 'Save Changes' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
