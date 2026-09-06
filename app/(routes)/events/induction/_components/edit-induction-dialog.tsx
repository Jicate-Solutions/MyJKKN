'use client';

// Induction — edit dialog for the list row.
//
// FIRST EDIT SURFACE THE MODULE HAS HAD. Until now an induction could be
// created (/events/induction/new) and run (/events/induction/[id]) but never
// corrected: a typo in the name or a wrong end date meant re-creating the
// programme, which is not a thing you do to 435 enrolled learners.
//
// WHAT IT EDITS: the `events` row only — identity, schedule, venue text. NOT
// induction_programs (admission year, enrol scope, degree/department targets):
// those decide WHO gets auto-enrolled, and changing them after enrolment has run
// would leave the cohort and its definition disagreeing with no reconciliation
// path. They stay a create-time decision.
//
// STATUS IS NOT HERE either, matching edit-general-event-dialog: transitions run
// through their own validated path, and a front-end-only status write that
// misses the server-side allow-list is a known recurring bug class in this repo.
//
// GATING: rendered only when canEditEvent() passes — super admin, or the row's
// created_by. That mirrors events_auth_update clause for clause. Anyone else
// gets no Edit item rather than a button the database then refuses.

import { useState } from 'react';
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
import { useUpdateGeneralEvent } from '@/hooks/events/use-general-events';
import type { InductionListRow } from '@/lib/services/induction/induction-service';

/** timestamptz / date string → yyyy-MM-dd for <input type="date">. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/** '' → undefined so an untouched optional field is omitted, not blanked. */
const orUndef = (v: string) => (v.trim() ? v.trim() : undefined);

interface EditInductionDialogProps {
  induction: InductionListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInductionDialog({
  induction,
  open,
  onOpenChange,
}: EditInductionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Keyed by id so the form remounts with fresh initial state per row
            rather than carrying the previously-opened induction's values. */}
        {induction && (
          <EditInductionForm
            key={induction.id}
            induction={induction}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditInductionForm({
  induction,
  onDone,
}: {
  induction: InductionListRow;
  onDone: () => void;
}) {
  const [name, setName] = useState(induction.name ?? '');
  const [description, setDescription] = useState(induction.description ?? '');
  const [startDate, setStartDate] = useState(toDateInput(induction.start_date));
  const [endDate, setEndDate] = useState(toDateInput(induction.end_date));
  const [venueText, setVenueText] = useState(induction.venue_text ?? '');

  const { mutateAsync, isPending } = useUpdateGeneralEvent();

  // A room booked from Resource Management wins over the free-text venue, so
  // editing the text here would change nothing the user can see. Say so instead
  // of offering a field that silently does nothing.
  const roomBooked = !!induction.venue_resource_id;

  const dateOrderInvalid =
    !!startDate && !!endDate && new Date(endDate) < new Date(startDate);
  const canSubmit = !!name.trim() && !dateOrderInvalid && !isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // Dates go as plain yyyy-MM-dd, the same shape the create page sends. The
    // columns are timestamptz, so Postgres reads them as midnight — an induction
    // is a day-granularity programme and every surface renders it as a date.
    await mutateAsync({
      id: induction.id,
      dto: {
        name: name.trim(),
        description: orUndef(description),
        start_date: orUndef(startDate),
        end_date: orUndef(endDate),
        ...(roomBooked ? {} : { venue_text: orUndef(venueText) }),
      },
    });
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Edit induction</DialogTitle>
        <DialogDescription>
          Name, schedule and venue. Who gets enrolled — admission year, colleges,
          degrees and departments — is set when the induction is created and is
          not editable here.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-ind-name">Name</Label>
          <Input
            id="edit-ind-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {!name.trim() && (
            <p className="text-xs text-destructive">An induction needs a name.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-ind-start">Starts</Label>
            <Input
              id="edit-ind-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-ind-end">Ends</Label>
            <Input
              id="edit-ind-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        {dateOrderInvalid && (
          <p className="text-xs text-destructive">
            The end date is before the start date.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="edit-ind-venue">Venue</Label>
          <Input
            id="edit-ind-venue"
            value={roomBooked ? '' : venueText}
            onChange={(e) => setVenueText(e.target.value)}
            disabled={roomBooked}
            placeholder={roomBooked ? 'A room is booked for this induction' : 'e.g. Main Auditorium'}
          />
          {roomBooked && (
            <p className="text-xs text-muted-foreground">
              This induction holds a room booked from Resource Management, which
              takes precedence over free text. Change it from the induction
              console.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-ind-desc">Description</Label>
          <Textarea
            id="edit-ind-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}
