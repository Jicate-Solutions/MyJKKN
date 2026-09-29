'use client';

// components/events/registration/registration-schedule-card.tsx
//
// The form's own active window: a manual Active/Inactive switch plus optional
// start and end dates.
//
// AUTO-INACTIVE IS DERIVED, NEVER STORED. Nothing here writes "inactive" when
// the end date passes — `formRegistrationState` computes it at every read, so an
// expired form closes itself the moment the clock crosses the date, with no job
// to fail and nothing to fall out of sync. Extend the end date and it reopens by
// itself.
//
// Applies to both variants: a tournament's monthly form has the same need as a
// lecture's.

import { useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUpdateRegistrationForm } from '@/hooks/events/use-tournament-registration-form';
import { isoToIstLocalInput, istLocalInputToIso } from '@/lib/utils/date-format';
import {
  formRegistrationState,
  FORM_STATE_LABELS,
  type EventRegistrationFormSummary,
  type FormRegistrationState,
} from '@/types/tournament';

// Both directions are pinned to IST (lib/utils/date-format.ts): the window the
// organizer types is India time whatever their browser's clock says, and the
// value shown back is the same wall-clock time — so a saved 2:00 PM never
// re-renders as 8:30 AM on a UTC-configured machine.
const toLocalInput = (iso: string | null) => isoToIstLocalInput(iso);
const toIso = (local: string) => istLocalInputToIso(local);

const STATE_STYLES: Record<FormRegistrationState, string> = {
  active: 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400',
  scheduled: 'border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400',
  expired: 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400',
  inactive: '',
};

/** Shared 4-state badge — also used by the forms list. */
export function FormStateBadge({ form }: { form: EventRegistrationFormSummary }) {
  const state = formRegistrationState(form);
  return (
    <Badge variant="outline" className={STATE_STYLES[state]}>
      {FORM_STATE_LABELS[state]}
    </Badge>
  );
}

export function RegistrationScheduleCard({
  eventId,
  form,
}: {
  eventId: string;
  form: EventRegistrationFormSummary;
}) {
  const updateForm = useUpdateRegistrationForm(eventId);

  const [enabled, setEnabled] = useState(!!form.is_enabled);
  const [startsAt, setStartsAt] = useState(toLocalInput(form.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(form.ends_at));

  const startIso = toIso(startsAt);
  const endIso = toIso(endsAt);
  // Mirrors the DB CHECK; catching it here gives a sentence instead of a 23514.
  const invalidRange = !!startIso && !!endIso && new Date(endIso) < new Date(startIso);

  // Compare instants, not strings: Postgres spells the stored value
  // '2026-09-21T08:30:00+00:00' while toISOString gives '…08:30:00.000Z'.
  const sameInstant = (a: string | null, b: string | null | undefined) =>
    (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
  const dirty =
    enabled !== !!form.is_enabled ||
    !sameInstant(startIso, form.starts_at) ||
    !sameInstant(endIso, form.ends_at);

  // What the form WILL be once saved, so the organizer sees the consequence of
  // the dates they just typed rather than the state it is in now.
  const pendingState = formRegistrationState({
    is_enabled: enabled,
    starts_at: startIso,
    ends_at: endIso,
  });

  const save = () => {
    if (invalidRange) return;
    updateForm.mutate({
      formId: form.id,
      updates: { is_enabled: enabled, starts_at: startIso, ends_at: endIso },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          Status &amp; schedule — {form.name}
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Leave the dates blank for a form you open and close by hand. Set an end
          date and it closes itself the moment that time passes — no need to
          remember. Times are Indian Standard Time (IST).
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="min-w-0 pr-3">
            <Label htmlFor={`form_enabled_${form.id}`} className="cursor-pointer">
              Active
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Turn off to close this form regardless of its dates.
            </p>
          </div>
          <Switch
            id={`form_enabled_${form.id}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`starts_${form.id}`}>
              Start date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`starts_${form.id}`}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ends_${form.id}`}>
              End date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`ends_${form.id}`}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>

        {invalidRange && (
          <p className="text-xs text-destructive">
            The end date must be on or after the start date.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={save}
            disabled={!dirty || invalidRange || updateForm.isPending}
            className="gap-1.5"
          >
            {updateForm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save schedule
          </Button>

          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {dirty ? 'Will be' : 'Currently'}
            <Badge variant="outline" className={STATE_STYLES[pendingState]}>
              {FORM_STATE_LABELS[pendingState]}
            </Badge>
            {pendingState === 'expired' && '— its end date has passed'}
            {pendingState === 'scheduled' && '— until its start date'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
