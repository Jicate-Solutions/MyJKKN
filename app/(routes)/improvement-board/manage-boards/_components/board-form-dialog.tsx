'use client';

/**
 * Create / rename a board on the Improvement Board.
 *
 * One dialog serves both modes because the fields are identical — the only
 * difference is that an existing board shows its reference key as fixed text.
 * The key is slugged from the name by the RPC at creation and is never
 * editable afterwards, because other parts of the platform look boards up by
 * it. The preview shown while creating is the same slug rule; if that slug is
 * already taken the RPC appends a number, so the preview is labelled as a
 * suggestion rather than a promise.
 */

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  ImprovementAreaService,
  type ManagedImprovementArea
} from '@/lib/services/improvement/improvement-area-service';

interface BoardFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create a new board; a row = rename/re-describe that board. */
  area: ManagedImprovementArea | null;
  onSaved: () => void;
}

/** Mirror of the slug rule in fn_improvement_area_create, for the preview. */
function previewKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug || 'board';
}

export function BoardFormDialog({
  open,
  onOpenChange,
  area,
  onSaved
}: BoardFormDialogProps) {
  const isEdit = !!area;
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-seed the form every time the dialog is opened for a different board.
  useEffect(() => {
    if (!open) return;
    setLabel(area?.label ?? '');
    setDescription(area?.description ?? '');
  }, [open, area]);

  const canSubmit = label.trim().length > 0 && label.trim().length <= 120;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      if (area) {
        await ImprovementAreaService.updateArea(area.id, {
          label: label.trim(),
          description: description.trim() || null
        });
        toast.success(`"${label.trim()}" updated.`);
      } else {
        await ImprovementAreaService.createArea({
          label: label.trim(),
          description: description.trim() || null
        });
        toast.success(`"${label.trim()}" added to the Improvement Board.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save the board.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit board' : 'Add a board'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Change what this board is called and how it is described. Everything already filed against it keeps its link.'
              : 'A board is one area of the institution that improvement ideas can be filed against.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="board-label">
              Board name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="board-label"
              placeholder="e.g. Transport"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="board-description">Description</Label>
            <Textarea
              id="board-description"
              placeholder="What kind of problem belongs on this board?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            <p className="text-muted-foreground text-xs">
              Optional. Leaving this empty clears any description already saved.
            </p>
          </div>

          <div className="bg-muted/40 space-y-1 rounded-md border p-3">
            <p className="text-xs font-medium">Reference key</p>
            <p className="font-mono text-sm">
              {isEdit ? area!.key : previewKey(label)}
            </p>
            <p className="text-muted-foreground text-xs">
              {isEdit
                ? 'Fixed. Other parts of the platform find this board by its key, so it never changes once the board exists.'
                : 'Generated from the name and fixed once the board is created. If this key is already taken, a number is added.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting
              ? isEdit
                ? 'Saving…'
                : 'Adding…'
              : isEdit
                ? 'Save changes'
                : 'Add board'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
