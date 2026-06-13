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
  type UpgradeFeeKind,
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
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [amountTouched, setAmountTouched] = useState(false);
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
      setFromId(
        (row.kind === 'room' ? row.from_hostel_category_id : row.from_mess_category_id) ?? ''
      );
      setToId((row.kind === 'room' ? row.to_hostel_category_id : row.to_mess_category_id) ?? '');
      setAmount(row.amount);
      setAmountTouched(true);
    } else {
      setKind('room');
      setFromId('');
      setToId('');
      setAmount(0);
      setAmountTouched(false);
    }
  }, [open, isEdit, row]);

  const categories = kind === 'room' ? hostelCategories : messCategories;
  const baseMap = kind === 'room' ? roomBase : messBase;

  // Auto-fill the upgrade amount with (to base − from base) until the user edits it.
  useEffect(() => {
    if (amountTouched || !fromId || !toId) return;
    const from = baseMap.get(fromId);
    const to = baseMap.get(toId);
    if (from != null && to != null) setAmount(Math.max(0, to - from));
  }, [fromId, toId, baseMap, amountTouched]);

  const canSave =
    !!fromId && !!toId && fromId !== toId && Number.isFinite(amount) && amount >= 0;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSubmitting(true);
      if (isEdit && row) {
        await updateFee(row.id, { amount });
        toast.success('Upgrade fee updated');
      } else {
        await createFee({
          hostel_year_id: hostelYearId,
          from_hostel_category_id: kind === 'room' ? fromId : null,
          to_hostel_category_id: kind === 'room' ? toId : null,
          from_mess_category_id: kind === 'mess' ? fromId : null,
          to_mess_category_id: kind === 'mess' ? toId : null,
          amount,
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
          <div className="space-y-2">
            <Label>Upgrade Type</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as UpgradeFeeKind);
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
                  {categories.map((c) => (
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
                  {categories.map((c) => (
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
            <Label>Upgrade payment (INR)</Label>
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
