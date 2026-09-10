'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowUpCircle, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminRoomUpgradeOptions,
  useAdminUpgradeCategoryOnly,
} from '@/hooks/campus-living/use-admin-category-upgrade';

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * Upgrade the learner's category and bill for it WITHOUT moving them.
 *
 * This is the path for a resident who is already living in the room but cannot
 * be given a bed in the target category — `fn_cl_admin_upgrade_room` refuses
 * that outright, because it validates the chosen bed against `_cl_room_options`
 * and raises "That room/bed is not an available option for this learner".
 *
 * Reuses the same eligible-category list the room dialog uses, so the two
 * cannot offer different ladders.
 */
export function CategoryOnlyUpgradeDialog({
  open,
  onOpenChange,
  learnerProfileId,
  currentCategory,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerProfileId: string | null;
  currentCategory: string | null;
  onCommitted: () => void;
}) {
  const { data: options = [], isLoading } = useAdminRoomUpgradeOptions(
    open ? learnerProfileId : null,
  );
  const upgrade = useAdminUpgradeCategoryOnly();
  // No reset effect: the parent remounts this component on each open (see its
  // `key`), so the selection starts empty naturally. Calling setState from an
  // effect to clear it would be a cascading render.
  const [categoryId, setCategoryId] = useState('');

  const picked = options.find((o) => o.category_id === categoryId) ?? null;

  const onConfirm = async () => {
    if (!learnerProfileId || !categoryId) return;
    try {
      const res = await upgrade.mutateAsync({ learnerId: learnerProfileId, categoryId });
      toast.success(
        res.state === 'pending_payment'
          ? `Category updated — upgrade bill of ${inr(res.upgrade_fee)} generated`
          : 'Category updated at no extra fee',
      );
      onCommitted();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upgrade failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5" />
            Upgrade category only
          </DialogTitle>
          <DialogDescription>
            Moves the learner to a higher category and bills for it, but leaves
            them in their current room and bed. Use this when the target category
            has no free bed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              The learner stays where they are — no room, bed or allocation
              changes. Only their category and their bill change.
            </AlertDescription>
          </Alert>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Target category {currentCategory ? `(currently ${currentCategory})` : ''}
            </Label>
            {isLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible categories…
              </div>
            ) : options.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No upgrade categories are available for this learner (gender, fee
                or current category rules out every option).
              </p>
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.category_id} value={o.category_id}>
                      {o.name} — {inr(o.upgrade_fee)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {picked && (
            <p className="text-xs text-muted-foreground">
              {(picked.upgrade_fee ?? 0) > 0 ? (
                <>
                  An upgrade bill of{' '}
                  <span className="font-semibold">{inr(picked.upgrade_fee)}</span> will
                  be generated, payable by the learner.
                </>
              ) : (
                <>This upgrade carries no fee, so no bill is raised.</>
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={upgrade.isPending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!categoryId || upgrade.isPending}>
            {upgrade.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {(picked?.upgrade_fee ?? 0) > 0 ? 'Upgrade & bill' : 'Upgrade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
