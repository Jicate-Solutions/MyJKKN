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
import { useHostelUpgradeFees } from '@/hooks/campus-living/use-hostel-upgrade-fees';
import { useHostelFees } from '@/hooks/campus-living/use-hostel-fees';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import {
  UPGRADE_FEE_KIND_LABELS,
  UPGRADE_FEE_GENDER_LABELS,
  UPGRADE_DISCOUNT_TYPE_LABELS,
  computeUpgradeNetAmount,
  type UpgradeFeeKind,
  type UpgradeFeeGender,
  type UpgradeDiscountType,
  type UpgradeFeeRow,
} from '@/types/hostel-category-upgrade-fees';

const inr = (n: number | null) =>
  n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  hostelYearId: string;
  row?: UpgradeFeeRow | null;
}

export function UpgradeFeeDialog({ open, onOpenChange, mode, hostelYearId, row }: Props) {
  const isEdit = mode === 'edit';
  const { createFee, updateFee } = useHostelUpgradeFees(hostelYearId);
  const { fees } = useHostelFees(hostelYearId);
  const { hostelCategories } = useActiveHostelCategories();
  const { messCategories } = useActiveMessCategories();

  const [kind, setKind] = useState<UpgradeFeeKind>('room');
  const [gender, setGender] = useState<UpgradeFeeGender | ''>('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [discountType, setDiscountType] = useState<UpgradeDiscountType>('amount');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // Base (full) per-category fee maps for this year — drive the auto-fill suggestion.
  const { roomBase, messBase } = useMemo(() => {
    const r = new Map<string, number>();
    const m = new Map<string, number>();
    for (const f of fees) {
      if (f.hostel_category_id && !f.mess_category_id) r.set(f.hostel_category_id, f.amount);
      else if (f.mess_category_id) m.set(f.mess_category_id, f.amount);
    }
    return { roomBase: r, messBase: m };
  }, [fees]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && row) {
      setKind(row.kind);
      setGender(row.from_type ?? '');
      setFromId(
        (row.kind === 'room' ? row.from_hostel_category_id : row.from_mess_category_id) ?? ''
      );
      setToId((row.kind === 'room' ? row.to_hostel_category_id : row.to_mess_category_id) ?? '');
      setAmount(row.amount);
      setAmountTouched(true);
      setDiscountType(row.discount_type ?? 'amount');
      setDiscountValue(row.discount_value ?? 0);
    } else {
      setKind('room');
      setGender('');
      setFromId('');
      setToId('');
      setAmount(0);
      setAmountTouched(false);
      setDiscountType('amount');
      setDiscountValue(0);
    }
  }, [open, isEdit, row]);

  const categories = kind === 'room' ? hostelCategories : messCategories;
  const baseMap = kind === 'room' ? roomBase : messBase;

  // Categories are gender-typed; the operator picks a hostel type first, then the
  // From/To lists narrow to that gender so every pair is same-gender by construction.
  const genders = useMemo(() => {
    const seen = new Set<UpgradeFeeGender>();
    const out: UpgradeFeeGender[] = [];
    for (const c of categories) {
      if (!seen.has(c.type)) {
        seen.add(c.type);
        out.push(c.type);
      }
    }
    return out;
  }, [categories]);

  // On create, default to the first available hostel type once categories load.
  useEffect(() => {
    if (isEdit || gender || genders.length === 0) return;
    setGender(genders[0]);
  }, [isEdit, gender, genders]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === gender),
    [categories, gender]
  );

  // Auto-fill the upgrade amount with (to base − from base) until the user edits it.
  useEffect(() => {
    if (amountTouched || !fromId || !toId) return;
    const from = baseMap.get(fromId);
    const to = baseMap.get(toId);
    if (from != null && to != null) setAmount(Math.max(0, to - from));
  }, [fromId, toId, baseMap, amountTouched]);

  // Mirrors the Postgres net_amount generated column — what the resident actually pays.
  const netAmount = useMemo(
    () => computeUpgradeNetAmount(amount, discountType, discountValue),
    [amount, discountType, discountValue]
  );
  const discountOff = Math.max(0, amount - netAmount);
  // Matches chk_upgrade_discount_bounds, so a bad value is caught here rather than
  // coming back as a raw 23514 from the database.
  const discountInvalid =
    !Number.isFinite(discountValue) ||
    discountValue < 0 ||
    (discountType === 'percent' ? discountValue > 100 : discountValue > amount);

  const canSave =
    !!fromId &&
    !!toId &&
    fromId !== toId &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    !discountInvalid;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSubmitting(true);
      if (isEdit && row) {
        await updateFee(row.id, {
          amount,
          discount_type: discountType,
          discount_value: discountValue,
        });
        toast.success('Upgrade fee updated');
      } else {
        await createFee({
          hostel_year_id: hostelYearId,
          from_hostel_category_id: kind === 'room' ? fromId : null,
          to_hostel_category_id: kind === 'room' ? toId : null,
          from_mess_category_id: kind === 'mess' ? fromId : null,
          to_mess_category_id: kind === 'mess' ? toId : null,
          amount,
          discount_type: discountType,
          discount_value: discountValue,
        });
        toast.success('Upgrade fee added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save upgrade fee');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Upgrade Fee' : 'Add Upgrade Fee'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the upgrade payment. The From / To categories cannot be changed.'
              : 'Set the payment to move from one category to a higher one. Shared across all institutions.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Upgrade Type</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as UpgradeFeeKind);
                  setGender('');
                  setFromId('');
                  setToId('');
                  setAmountTouched(false);
                }}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['room', 'mess'] as UpgradeFeeKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {UPGRADE_FEE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Hostel Type</Label>
              <Select
                value={gender}
                onValueChange={(v) => {
                  setGender(v as UpgradeFeeGender);
                  setFromId('');
                  setToId('');
                  setAmountTouched(false);
                }}
                disabled={isEdit || genders.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {genders.map((g) => (
                    <SelectItem key={g} value={g}>
                      {UPGRADE_FEE_GENDER_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>From category</Label>
              <Select
                value={fromId}
                onValueChange={(v) => {
                  setFromId(v);
                  setAmountTouched(false);
                }}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {visibleCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c.id === toId}>
                      {c.name}
                      {baseMap.get(c.id) != null ? ` · ${inr(baseMap.get(c.id)!)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>To category</Label>
              <Select
                value={toId}
                onValueChange={(v) => {
                  setToId(v);
                  setAmountTouched(false);
                }}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {visibleCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c.id === fromId}>
                      {c.name}
                      {baseMap.get(c.id) != null ? ` · ${inr(baseMap.get(c.id)!)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Upgrade fee (INR)</Label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => {
                setAmount(Number(e.target.value));
                setAmountTouched(true);
              }}
            />
            {!isEdit && fromId && toId && baseMap.get(fromId) != null && baseMap.get(toId) != null && (
              <p className="text-xs text-muted-foreground">
                Suggested (difference): {inr(Math.max(0, baseMap.get(toId)! - baseMap.get(fromId)!))}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Discount (optional)</Label>
            <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2">
              <Select
                value={discountType}
                onValueChange={(v) => {
                  setDiscountType(v as UpgradeDiscountType);
                  setDiscountValue(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['amount', 'percent'] as UpgradeDiscountType[]).map((d) => (
                    <SelectItem key={d} value={d}>
                      {UPGRADE_DISCOUNT_TYPE_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                max={discountType === 'percent' ? 100 : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                placeholder={discountType === 'percent' ? '0 – 100' : '0'}
              />
            </div>
            {discountInvalid ? (
              <p className="text-xs font-medium text-destructive">
                {discountType === 'percent'
                  ? 'Percentage discount must be between 0 and 100.'
                  : `Flat discount cannot exceed the upgrade fee of ${inr(amount)}.`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave at 0 for no discount. A 100% (or full-amount) discount makes the upgrade
                free — the resident is moved instantly with no bill raised.
              </p>
            )}
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">Resident pays</span>
              <span className="flex items-baseline gap-2">
                {discountOff > 0 && (
                  <span className="text-sm text-muted-foreground line-through">{inr(amount)}</span>
                )}
                <span className="text-lg font-semibold">
                  {netAmount === 0 ? 'Free' : inr(netAmount)}
                </span>
              </span>
            </div>
            {discountOff > 0 && (
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                Discount applied: {inr(discountOff)}
                {discountType === 'percent' ? ` (${discountValue}% off)` : ''}
              </p>
            )}
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
