'use client';

// General events — minimal edit dialog. Scope kept deliberately small:
// name / description / date / venue plus the NAAC evidence criteria field
// (the writer for the events → quality-evidence-spine emitter, PR #2408).
// No status control here — EventBaseService.updateEvent has no transition
// validation, and the NaacCriteriaField's helper text already sets the honest
// expectation that evidence emits only once the event completes.
// The inner form is keyed by event id so it remounts with fresh initial state
// per event (same pattern as edit-tournament-dialog, #2413).

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Event } from '@/types/events';
import { NaacCriteriaField } from '@/components/events/shared/naac-criteria-field';
import { useUpdateGeneralEvent } from '@/hooks/events/use-general-events';

/** ISO timestamp / date string → yyyy-MM-dd for <input type="date">. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

function EditGeneralEventForm({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
}) {
  const update = useUpdateGeneralEvent();

  const [form, setForm] = useState({
    name: event.name ?? '',
    description: event.description ?? '',
    event_date: toDateInput(event.event_date),
    venue: event.venue ?? '',
    // NAAC evidence tags — preserves uncurated codes verbatim (the field
    // only toggles curated options; empty array = untagged).
    naac_criteria: event.naac_criteria ?? [],
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isPending = update.isPending;

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      await update.mutateAsync({
        id: event.id,
        dto: {
          name: form.name.trim(),
          description: form.description || undefined,
          event_date: form.event_date || undefined,
          venue: form.venue.trim() || undefined,
          naac_criteria: form.naac_criteria,
        },
      });
      onClose();
    } catch {
      // handled by mutation toasts
    }
  };

  return (
    <>
      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="ge-name">
            Event Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ge-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ge-date">Event Date</Label>
            <Input
              id="ge-date"
              type="date"
              value={form.event_date}
              onChange={(e) => set('event_date', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ge-venue">Venue</Label>
            <Input
              id="ge-venue"
              placeholder="e.g. Main Auditorium"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
            />
          </div>
        </div>

        {/* NAAC evidence tags — writes events.naac_criteria; the evidence
            emitter picks tagged events up once they complete. */}
        <NaacCriteriaField
          value={form.naac_criteria}
          onChange={(next) => setForm((prev) => ({ ...prev, naac_criteria: next }))}
          disabled={isPending}
        />

        <div className="space-y-1.5">
          <Label htmlFor="ge-desc">Description</Label>
          <Textarea
            id="ge-desc"
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending || !form.name.trim()}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditGeneralEventDialog({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event: Event | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
        </DialogHeader>
        {event && (
          <EditGeneralEventForm key={event.id} event={event} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
