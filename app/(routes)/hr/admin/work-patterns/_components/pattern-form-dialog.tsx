'use client';

/**
 * Create / edit dialog for one work pattern's name and description.
 * The pattern's week, entitlements and members are edited elsewhere — this
 * dialog only ever writes hr_work_patterns.name / .description.
 */

import { useState } from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/utils';
import { useCreateWorkPattern, useUpdateWorkPattern } from '@/hooks/hr/use-work-patterns';
import type { HRWorkPattern } from '@/types/hr-work-patterns';

const NAME_MAX = 80;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The institution a NEW pattern belongs to. Null under "All institutions",
   * in which case the dialog asks — a pattern is always one institution's.
   */
  institutionId: string | null;
  /** The institutions the user may create under; shown only when institutionId is null. */
  institutions?: ReadonlyArray<{ id: string; name: string }>;
  /** Present = editing this pattern's name/description. Absent = creating. */
  pattern?: HRWorkPattern | null;
  /** Fired after a successful save, before the dialog closes. */
  onSaved?: (pattern: HRWorkPattern) => void;
}

export function PatternFormDialog({
  open,
  onOpenChange,
  institutionId,
  institutions = [],
  pattern,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chosenInstitution, setChosenInstitution] = useState('');
  const isEdit = Boolean(pattern);
  const needsInstitution = !isEdit && !institutionId;

  const create = useCreateWorkPattern();
  const update = useUpdateWorkPattern();
  const isPending = create.isPending || update.isPending;

  // Seed the fields when the dialog OPENS (or opens for a different pattern),
  // during render rather than in an effect — an effect would paint one frame
  // with the previous pattern's name. Same idiom as the page's selection reset.
  const seedKey = open ? (pattern?.id ?? 'new') : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    if (seedKey) {
      setName(pattern?.name ?? '');
      setDescription(pattern?.description ?? '');
      setChosenInstitution('');
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required.');
      return;
    }
    if (trimmed.length > NAME_MAX) {
      toast.error(`Name must be ${NAME_MAX} characters or fewer.`);
      return;
    }

    const targetInstitution = institutionId ?? chosenInstitution;
    if (!isEdit && !targetInstitution) {
      toast.error('Choose the institution this pattern belongs to.');
      return;
    }

    try {
      if (isEdit && pattern) {
        const saved = await update.mutateAsync({
          id: pattern.id,
          patch: { name: trimmed, description: description.trim() || null },
        });
        toast.success('Work pattern updated');
        onSaved?.(saved);
      } else {
        const saved = await create.mutateAsync({
          institution_id: targetInstitution,
          name: trimmed,
          description: description.trim() || null,
        });
        toast.success('Work pattern created');
        onSaved?.(saved);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit work pattern' : 'Add work pattern'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {needsInstitution && (
            <div>
              <Label htmlFor="wp-institution">Institution</Label>
              <Select value={chosenInstitution || undefined} onValueChange={setChosenInstitution}>
                <SelectTrigger id="wp-institution" className="mt-1">
                  <SelectValue placeholder="Select an institution" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="wp-name">Name</Label>
            <Input
              id="wp-name"
              className="mt-1"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 3-day Tue/Wed/Thu"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="wp-description">Description</Label>
            <Textarea
              id="wp-description"
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — who this pattern is for, or why it exists"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isEdit ? 'Save changes' : 'Create pattern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
