'use client';

// app/(routes)/bos/compositions/_components/add-committee-dialog.tsx
// "Add Committee" picker for a BoS Composition.
//
// A composition holds several committees, and each committee has its own
// members. This dialog does NOT create a committee from scratch — it lists the
// master committees defined at /bos/committees (the "template" pool,
// composition_id IS NULL) and COPIES the picked ones into this composition.
//
// Copy, not move: the master row is left untouched so the same master committee
// (e.g. Curriculum Development Cell) can be added to every composition. An
// earlier version re-parented the master row instead, which silently drained
// the pool — each committee could only ever be used once.
//
// Because copies are per-composition, a master already copied here is shown as
// "Added" and can't be picked twice (the DB's (composition_id, name) unique
// index would reject it anyway).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  useBosCommitteeTemplates,
  useBosCommitteesByComposition,
  useCopyBosCommitteeToComposition,
} from '@/hooks/bos/use-bos-committees';
import { logger } from '@/lib/utils/enhanced-logger';

interface AddCommitteeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Composition the picked committees are copied into. */
  compositionId: string;
  /** Institution the copies are anchored to (the composition's own). */
  institutionsId: string;
  /** CAS-expanded csv of the composition's institution siblings. */
  institutionIdsCsv: string;
}

export function AddCommitteeDialog({
  open,
  onClose,
  compositionId,
  institutionsId,
  institutionIdsCsv,
}: AddCommitteeDialogProps) {
  // Only fetch the template pool while the dialog is open (and the institution
  // is resolved) — keeps the query disabled on background renders.
  const { data: templates = [], isLoading } = useBosCommitteeTemplates(
    open ? institutionIdsCsv : undefined
  );
  // Already-copied masters — matched by name, the same key the DB's
  // (composition_id, name) unique index uses.
  const { data: existing = [] } = useBosCommitteesByComposition(compositionId);
  const { copy, isPending } = useCopyBosCommitteeToComposition();

  const addedNames = useMemo(
    () => new Set(existing.map((c) => c.name.trim().toLowerCase())),
    [existing]
  );
  const isAdded = (c: { name: string }) =>
    addedNames.has(c.name.trim().toLowerCase());

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection/search each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.short_code ?? '').toLowerCase().includes(q)
    );
  }, [templates, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    let ok = 0;
    // Copy sequentially so each success reconciles the cache in turn and a
    // mid-list failure doesn't abort the rest.
    for (const id of ids) {
      const template = templates.find((t) => t.id === id);
      if (!template) continue;
      try {
        await copy(template, compositionId, institutionsId);
        ok += 1;
      } catch (err) {
        logger.error('academic/bos', 'Failed to copy committee', err);
        toast.error(`Could not add "${template.name}": ${(err as Error).message}`);
      }
    }
    if (ok > 0) {
      toast.success(ok === 1 ? 'Committee added' : `${ok} committees added`);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Committee</DialogTitle>
          <DialogDescription>
            Pick from your master committees. Each one is copied into this
            composition, where you can then add its members. The master stays
            available for other compositions.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <Input
            placeholder='Search committees…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {isLoading ? (
            <div className='flex items-center justify-center py-10 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
            </div>
          ) : templates.length === 0 ? (
            <div className='rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
              <p>No committees available to add.</p>
              <p className='mt-1'>
                Create them first on the{' '}
                <Link href='/bos/committees' className='text-primary underline'>
                  Committees
                </Link>{' '}
                page.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className='rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
              No committees match “{search}”.
            </div>
          ) : (
            <ScrollArea className='h-64 rounded-md border'>
              <ul className='divide-y'>
                {filtered.map((c) => {
                  const added = isAdded(c);
                  return (
                    <li key={c.id}>
                      <label
                        className={
                          added
                            ? 'flex items-center gap-3 px-3 py-2.5 opacity-60'
                            : 'flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50'
                        }
                      >
                        <Checkbox
                          checked={added || selected.has(c.id)}
                          disabled={added}
                          onCheckedChange={() => toggle(c.id)}
                        />
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate text-sm font-medium'>
                            {c.name}
                          </span>
                          {c.short_code && (
                            <span className='block truncate text-xs text-muted-foreground'>
                              {c.short_code}
                            </span>
                          )}
                        </span>
                        {added && (
                          <span className='shrink-0 text-xs text-muted-foreground'>
                            Added
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='button'
            onClick={handleAdd}
            disabled={selected.size === 0 || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Adding…
              </>
            ) : selected.size > 0 ? (
              `Add ${selected.size} committee${selected.size > 1 ? 's' : ''}`
            ) : (
              'Add'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
