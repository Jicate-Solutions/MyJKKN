'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useCreateHRAcademicYear,
  useUpdateHRAcademicYear,
} from '@/hooks/hr/use-hr-academic-years';
import { deriveHRYearDates, type HRAcademicYear } from '@/types/hr-academic-years';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year?: HRAcademicYear | null;
}

const EMPTY = {
  year_name: '',
  start_date: '',
  end_date: '',
  is_active: true,
  notes: '',
};

export function HRAcademicYearFormDialog({ open, onOpenChange, year }: Props) {
  const [form, setForm] = useState(EMPTY);
  const create = useCreateHRAcademicYear();
  const update = useUpdateHRAcademicYear();
  const isEdit = !!year;

  useEffect(() => {
    if (!open) return;
    setForm(
      year
        ? {
            year_name: year.year_name,
            start_date: year.start_date,
            end_date: year.end_date,
            is_active: year.is_active,
            notes: year.notes ?? '',
          }
        : EMPTY
    );
  }, [open, year]);

  /**
   * Typing '2027-2028' fills Jun 1 2027 -> May 31 2028. Only ever fills blanks:
   * silently rewriting dates an operator has already adjusted would undo a
   * deliberate change.
   */
  const onYearNameChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, year_name: value };
      const derived = deriveHRYearDates(value);
      if (derived && !prev.start_date && !prev.end_date) {
        next.start_date = derived.start_date;
        next.end_date = derived.end_date;
      }
      return next;
    });
  };

  const canSave =
    !!form.year_name.trim() &&
    !!form.start_date &&
    !!form.end_date &&
    !create.isPending &&
    !update.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const payload = {
      year_name: form.year_name.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: year!.id, patch: payload });
        toast.success(`${payload.year_name} updated`);
      } else {
        await create.mutateAsync(payload);
        toast.success(`${payload.year_name} created`);
      }
      onOpenChange(false);
    } catch (err) {
      // The service translates 23505 / 23P01 / 23514 into sentences; anything
      // else falls through with its own message.
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit HR academic year' : 'New HR academic year'}</DialogTitle>
            <DialogDescription>
              HR years run Jun 1 to May 31 and apply to every institution.
              Active years may not overlap.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="year_name">Year name</Label>
              <Input
                id="year_name"
                value={form.year_name}
                onChange={(e) => onYearNameChange(e.target.value)}
                placeholder="2027-2028"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Entering <code>YYYY-YYYY</code> fills the dates below.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="start_date">Start date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="end_date">End date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="mt-1"
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v === true }))}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="is_active" className="font-normal">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Only active years are offered for new leave and balance generation.
                  Deactivating keeps existing rows intact — it is the safe alternative
                  to deleting a year that is already in use.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
