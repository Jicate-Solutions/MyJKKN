'use client';

// ============================================================================
// Item Edit Dialog — add / edit / mark-reviewed for one library row.
// Handles BOTH create and edit modes (item === null → create).
// ============================================================================

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

import {
  useCreateItem,
  useUpdateItem,
  useMarkNativeReviewed,
} from '@/hooks/mess/use-item-library';
import {
  MESS_LIBRARY_CATEGORIES,
  type MessLibraryCategory,
  type MessMenuItemLibrary,
} from '@/types/mess-library';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MessMenuItemLibrary | null; // null = create mode
  reviewerId: string;
}

/**
 * Public wrapper. Re-keys the form body on the (item-id, open) pair so each
 * fresh open mounts a clean form. This sidesteps the
 * `react-hooks/set-state-in-effect` lint rule that fires when you hydrate
 * state via useEffect on prop changes.
 */
export function ItemEditDialog(props: Props) {
  const formKey = `${props.item?.id ?? 'new'}::${props.open ? 'open' : 'closed'}`;
  return <ItemEditDialogBody key={formKey} {...props} />;
}

const CATEGORY_LABEL: Record<MessLibraryCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  tea: 'Tea / snacks',
  dinner: 'Dinner',
  sweet: 'Sweet',
  condiment: 'Condiment',
  beverage: 'Beverage',
  side: 'Side',
};

const COMMON_DIETARY_TAGS = ['veg', 'egg', 'non_veg', 'jain', 'gluten_free', 'dairy_free'];

/**
 * Internal component that holds the form state. The parent keys this on
 * `item?.id ?? 'new'` + `open` so each open-for-a-different-row remounts
 * fresh — no useEffect-hydration needed (and no lint rule about setState
 * in effects to dodge).
 */
function ItemEditDialogBody({ open, onOpenChange, item, reviewerId }: Props) {
  const isEditMode = item !== null;

  const [nameEnglish, setNameEnglish] = useState(item?.name_english ?? '');
  const [nameTamil, setNameTamil] = useState(item?.name_tamil ?? '');
  const [category, setCategory] = useState<MessLibraryCategory>(
    item?.category ?? 'breakfast'
  );
  const [dietaryTags, setDietaryTags] = useState<Set<string>>(
    new Set(item?.dietary_tags ?? [])
  );
  const [regionTypical, setRegionTypical] = useState(item?.region_typical ?? '');
  const [needsNativeReview, setNeedsNativeReview] = useState(
    item?.needs_native_review ?? true
  );

  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const reviewMutation = useMarkNativeReviewed();

  const toggleTag = (tag: string) => {
    setDietaryTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    reviewMutation.isPending;

  const handleSubmit = async () => {
    const trimmedEnglish = nameEnglish.trim();
    if (!trimmedEnglish) return;

    const payload = {
      name_english: trimmedEnglish,
      category,
      name_tamil: nameTamil.trim() ? nameTamil.trim() : null,
      dietary_tags: Array.from(dietaryTags),
      region_typical: regionTypical.trim() ? regionTypical.trim() : null,
      needs_native_review: needsNativeReview,
    };

    try {
      if (isEditMode && item) {
        await updateMutation.mutateAsync({ id: item.id, patch: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // toast handled by mutation hooks
    }
  };

  const handleMarkReviewed = async () => {
    if (!isEditMode || !item || !reviewerId) return;
    try {
      await reviewMutation.mutateAsync({ id: item.id, reviewedBy: reviewerId });
      setNeedsNativeReview(false);
    } catch {
      // toast handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit library item' : 'Add library item'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the name, Tamil translation, dietary tags, or category. Changes propagate to every menu editor pulling from the library.'
              : 'Add a new item to the global catalogue. It becomes available to every weekly-menu editor immediately.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="lib-english">Name (English) *</Label>
            <Input
              id="lib-english"
              value={nameEnglish}
              onChange={(e) => setNameEnglish(e.target.value)}
              placeholder="e.g. Masala Dosa"
            />
          </div>

          <div>
            <Label htmlFor="lib-tamil">Name (Tamil)</Label>
            <Input
              id="lib-tamil"
              value={nameTamil}
              onChange={(e) => setNameTamil(e.target.value)}
              placeholder="e.g. மசாலா தோசை"
              className="font-tamil text-base"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank if you don&apos;t have a confirmed Tamil rendering — the
              menu editor will fall back to English.
            </p>
          </div>

          <div>
            <Label htmlFor="lib-category">Category *</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as MessLibraryCategory)}
            >
              <SelectTrigger id="lib-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESS_LIBRARY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Dietary tags</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {COMMON_DIETARY_TAGS.map((tag) => {
                const checked = dietaryTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="lib-region">Region typical</Label>
            <Input
              id="lib-region"
              value={regionTypical}
              onChange={(e) => setRegionTypical(e.target.value)}
              placeholder="tamil_nadu / south_indian / pan_indian"
            />
          </div>

          {isEditMode && (
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
              <input
                id="lib-needs-review"
                type="checkbox"
                checked={needsNativeReview}
                onChange={(e) => setNeedsNativeReview(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <div className="flex-1">
                <Label htmlFor="lib-needs-review" className="cursor-pointer">
                  Needs native-Tamil review
                </Label>
                <p className="text-xs text-muted-foreground">
                  Uncheck once a native Tamil reader confirms the rendering (or
                  the deliberate absence of Tamil) is correct. You can also use
                  the &ldquo;Mark as reviewed&rdquo; button below to clear this
                  flag without re-saving the whole row.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:flex-row">
          {isEditMode && item?.needs_native_review && (
            <Button
              variant="secondary"
              onClick={handleMarkReviewed}
              disabled={!reviewerId || isSubmitting}
            >
              {reviewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Mark as reviewed
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !nameEnglish.trim()}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEditMode ? 'Save changes' : 'Add to library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
