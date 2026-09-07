'use client';

// OneMark sources — add one, or change one.
//
// The dialog exists mostly to say two things out loud, in the moment they
// matter rather than in a help page nobody opens:
//   · while ADDING — the identifier is built from this name and then fixed
//     forever, because every question from this source will store it;
//   · while EDITING — that identifier is shown, greyed and uneditable, so the
//     person can see the thing they are not allowed to change.
//
// The same rules are enforced again on the server. This is the courtesy copy.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_SORT_ORDER,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
  slugifySourceKey,
  type OneMarkSourceRow,
} from '@/lib/services/onemark/sources-service';
import { useCreateSource, useUpdateSource } from '../_lib/use-sources';

interface SourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = adding. */
  editing: OneMarkSourceRow | null;
  existingKeys: readonly string[];
}

export function SourceFormDialog({ open, onOpenChange, editing, existingKeys }: SourceFormDialogProps) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(String(DEFAULT_SORT_ORDER));

  const create = useCreateSource();
  const update = useUpdateSource();
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setLabel(editing?.label ?? '');
    setDescription(editing?.description ?? '');
    setSortOrder(String(editing?.sort_order ?? DEFAULT_SORT_ORDER));
  }, [open, editing]);

  const derivedKey = useMemo(() => slugifySourceKey(label), [label]);
  const keyTaken = !editing && derivedKey !== '' && existingKeys.includes(derivedKey);

  async function submit() {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error('A name is required.');
      return;
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order)) {
      toast.error('Position must be a whole number.');
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({
          key: editing.key,
          label: trimmed,
          description: description.trim() === '' ? null : description.trim(),
          sort_order: order,
        });
        toast.success(`"${trimmed}" saved.`);
      } else {
        await create.mutateAsync({
          label: trimmed,
          description: description.trim() === '' ? null : description.trim(),
          sort_order: order,
        });
        toast.success(`"${trimmed}" added.`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That could not be saved.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? null : onOpenChange(v))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit this source' : 'Add a question source'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'The name and the note can change whenever the wording needs to. The identifier cannot — every question that came from this source stores it.'
              : 'A source records where a question came from. The identifier is built from the name you type and is then fixed forever, so choose the name you want to live with.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="source-label">Name</Label>
            <Input
              id="source-label"
              value={label}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="District revision paper"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              {editing ? (
                <>
                  Identifier: <code className="rounded bg-muted px-1 py-0.5">{editing.key}</code> — fixed,
                  and stored on every question from this source.
                </>
              ) : derivedKey ? (
                <>
                  Will be saved as <code className="rounded bg-muted px-1 py-0.5">{derivedKey}</code>
                  {keyTaken ? ' — which is already taken. Pick another name, or switch the existing one back on.' : ''}
                </>
              ) : (
                'Type a name and the identifier appears here.'
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-description">Note (optional)</Label>
            <Textarea
              id="source-description"
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What counts as this source, so the next person tags questions the same way."
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-sort">Position in the list</Label>
            <Input
              id="source-sort"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-32"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first. The built-in rows sit at 10 to 50.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || label.trim() === '' || keyTaken}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editing ? 'Save' : 'Add source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
