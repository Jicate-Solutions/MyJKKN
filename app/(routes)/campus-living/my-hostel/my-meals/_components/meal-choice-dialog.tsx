'use client';

// ============================================================================
// My Meals — meal choice dialog (Mode A "pick your meal", ships dark)
// ----------------------------------------------------------------------------
// Lists the swap options for one meal cell ("either menu line" ∪ curated,
// from fn_mess_choose_swap_options) and saves the resident's pick via
// fn_mess_choose_set_choice — every guard (master switch, plan enabled,
// cutoff, option validity) re-checks SERVER-side, this dialog is just the
// hands. Option rows are plain buttons (no Radix Tabs/Select — CFT flake).
// Pattern source: rate-meal-dialog (mess menu page) for the Dialog idiom.
// ============================================================================

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Check, UtensilsCrossed } from 'lucide-react';
import {
  useSwapOptions,
  useSetChoice,
  useClearChoice,
} from '@/hooks/campus-living/use-choose-your-menu';
import type { MenuGender } from '@/lib/services/campus-living/choose-your-menu-service';

const ERROR_COPY: Record<string, string> = {
  feature_disabled: 'Meal choice is not switched on right now.',
  no_mess_plan: 'You need a mess plan to pick meals.',
  plan_not_enabled: 'Your mess plan does not include meal choice.',
  cutoff_passed: 'Too late for this meal — the kitchen already has its counts.',
  invalid_option: 'That dish is no longer offered for this meal.',
};

export function MealChoiceDialog({
  open,
  onOpenChange,
  weekStart,
  dayOfWeek,
  mealType,
  mealLabel,
  gender,
  currentChoiceDish,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weekStart: string;
  dayOfWeek: number | null;
  mealType: string | null;
  mealLabel: string;
  gender: MenuGender;
  /** The dish currently picked for this cell, if any. */
  currentChoiceDish: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const { data: options, isLoading } = useSwapOptions(
    weekStart,
    dayOfWeek,
    mealType,
    gender,
    open
  );
  const setChoice = useSetChoice();
  const clearChoice = useClearChoice();

  async function save() {
    if (!picked || !dayOfWeek || !mealType) return;
    const res = await setChoice.mutateAsync({
      weekStart,
      dayOfWeek,
      mealType,
      itemId: picked,
    });
    if (res.ok) {
      toast.success(`Saved — ${res.dish ?? 'your pick'} for ${mealLabel}.`);
      onOpenChange(false);
      setPicked(null);
    } else {
      toast.error(ERROR_COPY[res.error ?? ''] ?? `Could not save (${res.error}).`);
    }
  }

  async function clear() {
    if (!dayOfWeek || !mealType) return;
    const res = await clearChoice.mutateAsync({ weekStart, dayOfWeek, mealType });
    if (res.ok) {
      toast.success(`Back to the regular menu for ${mealLabel}.`);
      onOpenChange(false);
      setPicked(null);
    } else {
      toast.error(ERROR_COPY[res.error ?? ''] ?? `Could not clear (${res.error}).`);
    }
  }

  const busy = setChoice.isPending || clearChoice.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            Pick your {mealLabel.toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            {currentChoiceDish
              ? `Current pick: ${currentChoiceDish}. Choose another, or clear to eat the regular menu.`
              : 'Choose what you want — the kitchen gets your pick in its counts.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !options || options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">
            No alternatives are offered for this meal yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {options.map((o) => {
              const selected = picked === o.item_id;
              return (
                <button
                  key={o.item_id}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy}
                  onClick={() => setPicked(selected ? null : o.item_id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:bg-accent'
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    <span className="truncate font-medium">{o.dish}</span>
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {o.source_plan === 'curated' ? 'Special' : o.source_plan}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {currentChoiceDish && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={clear} className="mr-auto">
              Clear pick
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!picked || busy} onClick={save}>
            {setChoice.isPending ? 'Saving…' : 'Save pick'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
