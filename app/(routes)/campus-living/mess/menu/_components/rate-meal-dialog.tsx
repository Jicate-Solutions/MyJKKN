'use client';

// ============================================================================
// RateMealDialog — resident-facing per-item rating modal.
// ============================================================================
// Triggered by a "Rate this meal" button on the resident menu view. Renders
// the items of a single (week, day, meal, tier) cell with 5-star widgets +
// optional 200-char comment per item.
//
// Visibility:
//   - Only renders the trigger button when useCanRate({ profileId, menu })
//     returns { allowed: true }.
//   - If gate denies (not Premium-Plus, window closed, no active allocation),
//     the trigger is hidden and the parent menu cell shows the menu read-only.
//
// On submit:
//   - Bulk upsert via useSubmitRatingsBulk so re-rating within the window
//     UPDATEs instead of duplicating.
//   - Pre-fills sliders from useMyRatingsForMenu when re-opened.
// ============================================================================

import { useMemo, useState } from 'react';
import { Loader2, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useCanRate,
  useMyRatingsForMenu,
  useSubmitRatingsBulk,
} from '@/hooks/campus-living/use-mess-ratings';
import type { MessMenu, CreateMessMealRatingDTO } from '@/types/campus-living';

interface RateMealDialogProps {
  menu: Pick<
    MessMenu,
    'id' | 'institution_id' | 'week_start_date' | 'day_of_week' | 'meal_type'
  > & {
    items_tamil?: string[] | null;
    items_english?: string[] | null;
    items?: string[];
  };
  profileId: string | undefined;
  /** Optional trigger override (e.g. inline icon button). Default = full button. */
  trigger?: React.ReactNode;
}

interface ItemDraft {
  text: string;
  rating: number; // 0 = unrated
  comment: string;
}

function pickItems(menu: RateMealDialogProps['menu']): string[] {
  // Prefer Tamil, then English, then legacy `items`.
  const ta = (menu.items_tamil ?? []).filter((s) => s && s.trim().length > 0);
  if (ta.length > 0) return ta;
  const en = (menu.items_english ?? []).filter((s) => s && s.trim().length > 0);
  if (en.length > 0) return en;
  return (menu.items ?? []).filter((s) => s && s.trim().length > 0);
}

// ── Star widget ───────────────────────────────────────────────────────────
function StarRow({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={filled}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={
              'rounded p-0.5 transition-colors ' +
              (disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted')
            }
          >
            <Star
              className={
                'h-5 w-5 ' +
                (filled ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground')
              }
            />
          </button>
        );
      })}
    </div>
  );
}

export function RateMealDialog({ menu, profileId, trigger }: RateMealDialogProps) {
  const [open, setOpen] = useState(false);

  const items = useMemo(() => pickItems(menu), [menu]);

  const { data: gate, isLoading: gateLoading } = useCanRate(
    profileId ? { profileId, menu } : null,
  );

  const { data: existing } = useMyRatingsForMenu(profileId, menu.id);
  const submitBulk = useSubmitRatingsBulk();

  // Stable seed computed from items + existing ratings. Resets per
  // dialog-open transition (lastOpenKey ref). Avoids setState-in-effect by
  // computing the seed only when the open transition changes.
  const seed = useMemo<ItemDraft[]>(() => {
    const byItem = new Map<string, { rating: number; comment: string | null }>();
    for (const r of existing ?? []) {
      byItem.set(r.item_text, { rating: r.rating, comment: r.comment });
    }
    return items.map((text) => {
      const prev = byItem.get(text);
      return {
        text,
        rating: prev?.rating ?? 0,
        comment: prev?.comment ?? '',
      };
    });
  }, [items, existing]);

  // Track the seed identity that produced the current drafts. When the
  // dialog opens or the seed materially changes (different menu, different
  // item count, different existing-rating count), re-seed drafts. Uses the
  // canonical React "Adjusting state during render" pattern — see
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const seedKey = open ? `${menu.id}::${items.length}::${(existing ?? []).length}` : '';
  const [lastSeedKey, setLastSeedKey] = useState<string>('');
  const [drafts, setDrafts] = useState<ItemDraft[]>(seed);

  if (seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey);
    setDrafts(seed);
  }

  // Hide trigger entirely when gate denies — UI says less is more.
  if (!profileId || gateLoading) {
    return null;
  }
  if (!gate?.allowed) {
    return null;
  }
  if (items.length === 0) {
    return null;
  }

  const handleSubmit = async () => {
    if (!profileId) return;
    const payloads: CreateMessMealRatingDTO[] = drafts
      .filter((d) => d.rating >= 1 && d.rating <= 5)
      .map((d) => ({
        institution_id: menu.institution_id,
        profile_id: profileId,
        menu_id: menu.id,
        item_text: d.text,
        rating: d.rating,
        comment: d.comment.trim() === '' ? null : d.comment.trim().slice(0, 200),
      }));

    if (payloads.length === 0) return;

    await submitBulk.mutateAsync(payloads);
    setOpen(false);
  };

  const windowEndsLabel = gate.windowEndsUtc
    ? new Date(gate.windowEndsUtc).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Star className="h-4 w-4 text-yellow-500" />
            Rate this meal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rate this meal</DialogTitle>
          <DialogDescription>
            Tap a star for each item you ate. Skip items you didn&apos;t try.
            {windowEndsLabel && (
              <> Window closes around <strong>{windowEndsLabel}</strong>.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          {drafts.map((draft, idx) => (
            <div key={`${draft.text}-${idx}`} className="space-y-2 border-b pb-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{draft.text}</span>
                <StarRow
                  value={draft.rating}
                  disabled={submitBulk.isPending}
                  onChange={(v) =>
                    setDrafts((cur) =>
                      cur.map((d, i) => (i === idx ? { ...d, rating: v } : d)),
                    )
                  }
                />
              </div>
              {draft.rating > 0 && (
                <Textarea
                  placeholder="Optional comment (200 chars)"
                  value={draft.comment}
                  maxLength={200}
                  disabled={submitBulk.isPending}
                  onChange={(e) =>
                    setDrafts((cur) =>
                      cur.map((d, i) =>
                        i === idx ? { ...d, comment: e.target.value } : d,
                      ),
                    )
                  }
                  className="min-h-[60px] text-sm"
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitBulk.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitBulk.isPending || drafts.every((d) => d.rating === 0)
            }
            className="gap-1.5"
          >
            {submitBulk.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Submit ratings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
