'use client';

import { useEffect, useState } from 'react';
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
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import {
  CATEGORY_FEE_KINDS,
  FEE_TARGET_LABELS,
  FEE_FREQUENCY_LABELS,
  getFeeTargetId,
  getFeeTargetKind,
  type FeeTargetKind,
  type FeeFrequency,
  type HostelFee,
} from '@/types/hostel-fees';

type GenderType = 'boys' | 'girls';

const GENDER_OPTIONS: { value: GenderType; label: string }[] = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  hostelYearId: string;
  fee?: HostelFee | null;
}

export function CategoryFeeDialog({ open, onOpenChange, mode, hostelYearId, fee }: Props) {
  const isEdit = mode === 'edit';
  const { createFee, updateFee } = useHostelFees(hostelYearId);

  const { hostelCategories } = useActiveHostelCategories();
  const { messCategories } = useActiveMessCategories();

  const [kind, setKind] = useState<FeeTargetKind>('hostel_room');
  const [categoryId, setCategoryId] = useState<string>('');
  const [genderType, setGenderType] = useState<GenderType>('boys');
  const [amount, setAmount] = useState<number>(0);
  const [frequency, setFrequency] = useState<FeeFrequency>('annual');
  const [submitting, setSubmitting] = useState(false);

  // Both hostel-room and mess categories carry a boys/girls `type`.
  const kindHasGender = kind === 'hostel_room' || kind === 'mess';

  useEffect(() => {
    if (!open) return;
    if (isEdit && fee) {
      setKind(getFeeTargetKind(fee));
      setCategoryId(getFeeTargetId(fee) ?? '');
      setAmount(fee.amount);
      setFrequency(fee.frequency);
    } else {
      setKind('hostel_room');
      setCategoryId('');
      setGenderType('boys');
      setAmount(0);
      setFrequency('annual');
    }
  }, [open, isEdit, fee]);

  const genderList: { id: string; name: string; type: string }[] =
    kind === 'hostel_room' ? hostelCategories : messCategories;

  // In edit mode the category is locked, so the gender selector just reflects
  // the saved category's type. In create mode it's user-driven and filters the
  // category list. 'mixed' categories apply to both and always show.
  const lockedGender: GenderType = isEdit
    ? genderList.find((c) => c.id === categoryId)?.type === 'girls'
      ? 'girls'
      : 'boys'
    : genderType;

  const categoryOptions = (isEdit
    ? genderList
    : genderList.filter((c) => c.type === genderType || c.type === 'mixed')
  ).map((c) => ({ id: c.id, name: c.name }));

  const canSave = !!categoryId && Number.isFinite(amount) && amount >= 0;

  const handleSave = async () => {
    try {
      setSubmitting(true);
      if (isEdit && fee) {
        await updateFee(fee.id, { amount, frequency });
        toast.success('Category fee updated');
      } else {
        await createFee({
          hostel_year_id: hostelYearId,
          hostel_category_id: kind === 'hostel_room' ? categoryId : null,
          mess_category_id: kind === 'mess' ? categoryId : null,
          amount,
          frequency,
        });
        toast.success('Category fee added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save category fee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category Fee' : 'Add Category Fee'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the amount or frequency. The category cannot be changed.'
              : 'Set a fee for a single category. Fees are shared across all institutions.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category Type</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as FeeTargetKind);
                setCategoryId('');
              }}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_FEE_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {FEE_TARGET_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kindHasGender ? (
            <div className="space-y-2">
              <Label>For</Label>
              <Select
                value={lockedGender}
                onValueChange={(v) => {
                  setGenderType(v as GenderType);
                  setCategoryId('');
                }}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label>Category</Label>
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              disabled={isEdit || categoryOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    categoryOptions.length === 0
                      ? kindHasGender
                        ? `No active ${lockedGender} categories`
                        : 'No active categories'
                      : 'Select category'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
