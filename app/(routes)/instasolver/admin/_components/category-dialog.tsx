'use client';

// Create / edit a category. Categories are deactivated, never deleted.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverReferenceService } from '@/lib/services/instasolver/reference-service';
import type { Category, CategoryKind, SaveCategoryDto } from '@/types/instasolver';

type CategoryDialogProps = {
  kind: CategoryKind;
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Remounts per open / category, so the form starts from the row each time. */
export function CategoryDialog(props: CategoryDialogProps) {
  return <CategoryDialogInner key={`${props.category?.id ?? 'new'}-${props.open}`} {...props} />;
}

function CategoryDialogInner({
  kind,
  category,
  open,
  onOpenChange
}: {
  kind: CategoryKind;
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [active, setActive] = useState(category?.is_active ?? true);
  const [errors, setErrors] = useState<{ name?: string; sort?: string }>({});

  const save = useInstaSolverMutation(
    (dto: SaveCategoryDto) => InstaSolverReferenceService.saveCategory(dto, category?.id),
    category ? 'Category updated' : 'Category created'
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Give the category a name (at least 2 characters)';
    if (sortOrder.trim() === '' || !Number.isInteger(Number(sortOrder))) next.sort = 'Enter a whole number';
    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate(
      {
        kind,
        name,
        description: description.trim() || null,
        sort_order: Number(sortOrder),
        is_active: active
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  const noun = kind === 'issue' ? 'issue' : 'requirement';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : `New ${noun} category`}</DialogTitle>
          <DialogDescription>Categories are switched off rather than deleted, so past records keep their category.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} maxLength={80} />
            {errors.name && (
              <p className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-sort">Sort order</Label>
            <Input
              id="cat-sort"
              type="number"
              step={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-invalid={!!errors.sort}
            />
            {errors.sort ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.sort}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Lower numbers are listed first.</p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="cat-active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive categories are not offered on new records.</p>
            </div>
            <Switch id="cat-active" checked={active} onCheckedChange={setActive} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : category ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
