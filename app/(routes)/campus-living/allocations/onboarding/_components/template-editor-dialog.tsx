'use client';

/**
 * Onboarding template editor — used for both create + edit. Plain controlled
 * form with a simple item list (add / remove / reorder via up/down buttons).
 *
 * Drag-to-reorder is a follow-up. The spec calls it out but ships ~80% of
 * the value without the dnd-kit dependency we don't yet have wired.
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useCreateOnboardingTemplate,
  useUpdateOnboardingTemplate,
} from '@/hooks/campus-living/use-hostel-onboarding';
import {
  DEFAULT_ONBOARDING_ITEMS,
  type OnboardingItem,
  type OnboardingTemplate,
} from '@/types/campus-living/onboarding';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  /** When provided we're editing; otherwise we're creating. */
  template?: OnboardingTemplate | null;
}

function generateKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'item'}-${Math.random().toString(36).slice(2, 7)}`;
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
  institutionId,
  template,
}: TemplateEditorDialogProps) {
  const isEdit = !!template;
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [newItemLabel, setNewItemLabel] = useState('');

  const createMut = useCreateOnboardingTemplate();
  const updateMut = useUpdateOnboardingTemplate();
  const isPending = createMut.isPending || updateMut.isPending;

  // Reset state whenever the dialog opens or the editing target changes.
  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name ?? '');
      setIsActive(template.is_active ?? true);
      setItems(Array.isArray(template.items) ? template.items : []);
    } else {
      setName('Default Onboarding');
      setIsActive(true);
      setItems(DEFAULT_ONBOARDING_ITEMS);
    }
    setNewItemLabel('');
  }, [open, template]);

  const handleAddItem = () => {
    const label = newItemLabel.trim();
    if (!label) return;
    setItems((prev) => [
      ...prev,
      { key: generateKey(label), label, completed: false },
    ]);
    setNewItemLabel('');
  };

  const handleRemove = (key: string) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const handleMove = (key: string, dir: -1 | 1) =>
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });

  const handleDescriptionChange = (key: string, description: string) =>
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, description } : i)),
    );

  const handleLabelChange = (key: string, label: string) =>
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, label } : i)),
    );

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Strip completion state from template items — templates are blueprints.
    const cleanItems: OnboardingItem[] = items.map((i) => ({
      key: i.key,
      label: i.label,
      description: i.description,
      completed: false,
    }));
    if (isEdit && template) {
      await updateMut.mutateAsync({
        id: template.id,
        institutionId,
        updates: { name: trimmed, items: cleanItems, is_active: isActive },
      });
    } else {
      await createMut.mutateAsync({
        institution_id: institutionId,
        name: trimmed,
        items: cleanItems,
        is_active: isActive,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit template' : 'New onboarding template'}</DialogTitle>
          <DialogDescription>
            Templates are blueprints — they seed new checklists when a hosteller is allocated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Boys block — Standard onboarding"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive templates are hidden from create-checklist pickers.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label>Checklist items ({items.length})</Label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.key}
                  className="rounded-md border bg-card p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={idx === 0}
                        onClick={() => handleMove(item.key, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={idx === items.length - 1}
                        onClick={() => handleMove(item.key, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={item.label}
                      onChange={(e) => handleLabelChange(item.key, e.target.value)}
                      placeholder="Item label"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemove(item.key)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Textarea
                    value={item.description ?? ''}
                    onChange={(e) =>
                      handleDescriptionChange(item.key, e.target.value)
                    }
                    placeholder="Optional description / instructions"
                    rows={2}
                  />
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  No items yet — add the first one below.
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Input
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                placeholder="New item label, then Enter"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddItem}
                disabled={!newItemLabel.trim()}
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
