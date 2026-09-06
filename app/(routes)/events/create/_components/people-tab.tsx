'use client';

// People tab — a thin adapter over the SHARED in-charge / chief-guest editor.
//
// The editor itself lives in components/events/shared/event-people-fields.tsx
// because the edit dialog needs the identical fields: shipping these on create
// only is exactly how they went missing from Edit in the first place.

import { EventPeopleFields } from '@/components/events/shared/event-people-fields';
import type { EventCreateForm } from './event-create-form';

export function PeopleTab({
  form,
  set,
  pickerOpen,
  onPickerOpenChange,
  error,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  error?: string;
}) {
  return (
    <EventPeopleFields
      incharges={form.incharges}
      chiefGuests={form.chief_guests}
      onInchargesChange={(next) => set('incharges', next)}
      onChiefGuestsChange={(next) => set('chief_guests', next)}
      pickerOpen={pickerOpen}
      onPickerOpenChange={onPickerOpenChange}
      error={error}
    />
  );
}
