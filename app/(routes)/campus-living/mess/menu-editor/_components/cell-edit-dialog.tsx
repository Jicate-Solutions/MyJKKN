'use client';

// ============================================================================
// CellEditDialog — modal for editing a single (week, day, meal, tier) cell.
// ============================================================================
// Wraps:
//   • ItemPicker (library-backed multi-select; bumps usage_count on save)
//   • Free-text Tamil + English textarea (for items not yet in library)
//
// On save:
//   • Computes the merged Tamil + English arrays (library items + free-text)
//   • Calls useUpsertMessMenuCell() — service layer enforces the 2-hour
//     edit cutoff and throws "meal cutoff exceeded: …" if window has passed.
//   • Fires useIncrementUsageCount() per library item picked.
// ============================================================================

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useUpsertMessMenuCell } from '@/hooks/campus-living/use-mess-menu-week';
import { useIncrementUsageCount } from '@/hooks/mess/use-item-library';
import type { MealType, MessMenu, TierKey } from '@/types/campus-living';
import type { MessLibraryCategory } from '@/types/mess-library';

import { ItemPicker, type PickedItem } from './item-picker';

interface CellEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing menu row for this cell, if any (drives initial values). */
  existing: MessMenu | null;
  /** Cell coordinates — pre-filled, not user-editable. */
  cell: {
    institutionId: string;
    catererId: string;
    weekStartDate: string;
    dayOfWeek: number;
    mealType: MealType;
    tierKey: TierKey;
  };
}

const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Map MealType → MessLibraryCategory. 'snacks' is the legacy enum value
// retained by PR 1; treat it as 'tea' for picker filtering.
function mealTypeToCategory(mt: MealType): MessLibraryCategory | undefined {
  if (mt === 'snacks') return 'tea';
  if (mt === 'breakfast' || mt === 'lunch' || mt === 'tea' || mt === 'dinner') return mt;
  return undefined;
}

export function CellEditDialog({ open, onOpenChange, existing, cell }: CellEditDialogProps) {
  // Seed initial picker state from existing items_tamil. We don't know
  // library IDs for the existing items, so they enter as "free-text" rows
  // initially — caller can re-pick from library to "promote" them.
  const initialFreeTextTamil = useMemo(() => {
    return (existing?.items_tamil ?? []).join('\n');
  }, [existing]);
  const initialFreeTextEnglish = useMemo(() => {
    return (existing?.items_english ?? []).join('\n');
  }, [existing]);

  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [freeTextTamil, setFreeTextTamil] = useState(initialFreeTextTamil);
  const [freeTextEnglish, setFreeTextEnglish] = useState(initialFreeTextEnglish);

  const upsert = useUpsertMessMenuCell();
  const incrementUsage = useIncrementUsageCount();

  const handleSave = async () => {
    // Merge library-picked items + free-text into the two arrays.
    const tamilFromPicker = picked.map((p) => p.tamil ?? p.english);
    const englishFromPicker = picked.map((p) => p.english);
    const tamilFromFreeText = freeTextTamil
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const englishFromFreeText = freeTextEnglish
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const mergedTamil = [...tamilFromPicker, ...tamilFromFreeText];
    const mergedEnglish = [...englishFromPicker, ...englishFromFreeText];

    try {
      await upsert.mutateAsync({
        institution_id: cell.institutionId,
        caterer_id: cell.catererId,
        week_start_date: cell.weekStartDate,
        day_of_week: cell.dayOfWeek,
        meal_type: cell.mealType,
        tier_key: cell.tierKey,
        items_tamil: mergedTamil,
        items_english: mergedEnglish.length > 0 ? mergedEnglish : null,
        items: mergedTamil, // keep legacy column mirrored to Tamil source
      });

      // Best-effort: bump usage_count for each library-picked item.
      for (const p of picked) {
        incrementUsage.mutate(p.libraryId);
      }

      onOpenChange(false);
    } catch {
      // useUpsertMessMenuCell already toasts the cutoff error. Keep modal
      // open so Director can correct.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            Edit {DAY_LABELS[cell.dayOfWeek] ?? '?'} · {cell.mealType} · {cell.tierKey}
          </DialogTitle>
          <DialogDescription>
            Week starting {cell.weekStartDate}. Pick items from the library or type your own.
            Tamil is the source-of-truth column; English is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Pick from library</Label>
            <div className="mt-2">
              <ItemPicker
                picked={picked}
                onPickedChange={setPicked}
                defaultCategory={mealTypeToCategory(cell.mealType)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="cell-tamil" className="text-sm font-medium">
                Free-text Tamil items (one per line)
              </Label>
              <Textarea
                id="cell-tamil"
                rows={4}
                value={freeTextTamil}
                onChange={(e) => setFreeTextTamil(e.target.value)}
                placeholder="காபி&#10;பால்"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cell-english" className="text-sm font-medium">
                Free-text English items (one per line)
              </Label>
              <Textarea
                id="cell-english"
                rows={4}
                value={freeTextEnglish}
                onChange={(e) => setFreeTextEnglish(e.target.value)}
                placeholder="Coffee&#10;Milk"
                className="mt-1.5"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save cell'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
