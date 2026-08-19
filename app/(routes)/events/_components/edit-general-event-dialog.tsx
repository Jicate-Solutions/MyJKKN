'use client';

// General events — full edit dialog.
//
// Was deliberately minimal (name / description / date / venue / NAAC) when the
// only other surface was a hub row. Now that /events/[id] is a real console, the
// dialog covers everything an organizer can change about the event itself:
// identity, schedule, venue, the registration window, capacity, audience and
// NAAC evidence.
//
// STATUS IS STILL NOT HERE, on purpose. Status lives on the detail console and
// goes through GeneralEventService.updateStatus, which validates the transition
// against GENERAL_EVENT_STATUS_TRANSITIONS. EventBaseService.updateEvent is a
// raw passthrough with no validation — writing status from this dialog would
// bypass the only check there is, and front-end-only status changes that miss a
// server-side allow-list are a known recurring bug class in this repo.
//
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Event, EventScope, EventVisibility } from '@/types/events';
import { NaacCriteriaField } from '@/components/events/shared/naac-criteria-field';
import {
  EventPeopleFields,
  mergeEventPeopleConfig,
  parseChiefGuestDrafts,
  parseIncharges,
  validatePeople,
} from '@/components/events/shared/event-people-fields';
import { useUpdateGeneralEvent } from '@/hooks/events/use-general-events';

/** ISO timestamp / date string → yyyy-MM-dd for <input type="date">. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/** timestamptz → value for <input type="datetime-local"> in local wall time. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * datetime-local → ISO. `new Date('2026-01-05T09:00')` parses as LOCAL time —
 * what the organizer typed — and toISOString converts to UTC for storage.
 * Sending the raw string would hand Postgres a naive timestamp and shift it by
 * the timezone offset (a 5:30h drift in this deployment).
 */
function toIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** '' → undefined so an untouched optional field is omitted, not blanked. */
const orUndef = (v: string) => (v.trim() ? v.trim() : undefined);

/** '' → undefined; a non-numeric string is dropped rather than sent as NaN. */
function numOrUndef(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const SCOPES: { value: EventScope; label: string }[] = [
  { value: 'institution', label: 'This institution only' },
  { value: 'all_jkkn', label: 'All JKKN institutions' },
  { value: 'chapter', label: 'Chapter' },
];

const VISIBILITIES: { value: EventVisibility; label: string }[] = [
  { value: 'institution', label: 'Institution' },
  { value: 'all_jkkn', label: 'All JKKN' },
  { value: 'public', label: 'Public' },
  { value: 'invited', label: 'Invited only' },
];

function EditGeneralEventForm({ event, onClose }: { event: Event; onClose: () => void }) {
  const update = useUpdateGeneralEvent();

  const [form, setForm] = useState({
    name: event.name ?? '',
    tagline: event.tagline ?? '',
    theme: event.theme ?? '',
    description: event.description ?? '',
    event_date: toDateInput(event.event_date),
    start_date: toLocalInput(event.start_date),
    end_date: toLocalInput(event.end_date),
    start_time: event.start_time ?? '',
    end_time: event.end_time ?? '',
    venue: event.venue ?? '',
    venue_text: event.venue_text ?? '',
    registration_open_date: toLocalInput(event.registration_open_date),
    registration_close_date: toLocalInput(event.registration_close_date),
    max_registrations: event.max_registrations != null ? String(event.max_registrations) : '',
    target_registrations:
      event.target_registrations != null ? String(event.target_registrations) : '',
    year: event.year != null ? String(event.year) : '',
    scope: (event.scope ?? 'institution') as EventScope,
    visibility: (event.visibility ?? 'institution') as EventVisibility,
    is_public: !!event.is_public,
    allow_external_registration: !!event.allow_external_registration,
    // NAAC evidence tags — preserves uncurated codes verbatim (the field only
    // toggles curated options; empty array = untagged).
    naac_criteria: event.naac_criteria ?? [],
    // People. Both live in `events.config`, not in columns — see
    // event-people-fields.tsx. In-charge is an ACCESS GRANT
    // (fn_is_event_incharge reads config->incharges[].member_id); chief guest
    // is display data.
    incharges: parseIncharges(event.config as Record<string, unknown> | null),
    chief_guests: parseChiefGuestDrafts(event.config as Record<string, unknown> | null),
  });

  const [pickerOpen, setPickerOpen] = useState(false);

  const set = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isPending = update.isPending;

  const regOpen = toIso(form.registration_open_date);
  const regClose = toIso(form.registration_close_date);
  const badRegWindow = !!regOpen && !!regClose && new Date(regClose) < new Date(regOpen);

  const startIso = toIso(form.start_date);
  const endIso = toIso(form.end_date);
  const badRunWindow = !!startIso && !!endIso && new Date(endIso) < new Date(startIso);

  const peopleError = validatePeople({
    incharges: form.incharges,
    chiefGuests: form.chief_guests,
  });

  const canSave =
    !!form.name.trim() && !badRegWindow && !badRunWindow && !peopleError && !isPending;

  const submit = async () => {
    if (!canSave) return;
    try {
      await update.mutateAsync({
        id: event.id,
        dto: {
          name: form.name.trim(),
          tagline: orUndef(form.tagline),
          theme: orUndef(form.theme),
          description: orUndef(form.description),
          event_date: orUndef(form.event_date),
          start_date: startIso,
          end_date: endIso,
          start_time: orUndef(form.start_time),
          end_time: orUndef(form.end_time),
          venue: orUndef(form.venue),
          venue_text: orUndef(form.venue_text),
          registration_open_date: regOpen,
          registration_close_date: regClose,
          max_registrations: numOrUndef(form.max_registrations),
          target_registrations: numOrUndef(form.target_registrations),
          year: numOrUndef(form.year),
          scope: form.scope,
          visibility: form.visibility,
          is_public: form.is_public,
          allow_external_registration: form.allow_external_registration,
          naac_criteria: form.naac_criteria,
          // MERGE, never replace. `config` is one jsonb column and
          // EventBaseService.updateEvent is a raw passthrough, so sending a bare
          // { incharges, chief_guests } here would silently discard `home`,
          // `format`, `enabled_tools`, `preset_id` and `fee` — everything the
          // create wizard filed the event under.
          config: mergeEventPeopleConfig(
            event.config as Record<string, unknown> | null,
            { incharges: form.incharges, chiefGuests: form.chief_guests },
          ),
        },
      });
      onClose();
    } catch {
      // handled by mutation toasts
    }
  };

  return (
    <>
      <div className="space-y-5 py-1">
        {/* ── Identity ── */}
        <div className="space-y-4">
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
              <Label htmlFor="ge-tagline">Tagline</Label>
              <Input
                id="ge-tagline"
                value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                placeholder="One-line summary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-theme">Theme</Label>
              <Input
                id="ge-theme"
                value={form.theme}
                onChange={(e) => set('theme', e.target.value)}
                placeholder="e.g. Sustainability"
              />
            </div>
          </div>

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

        {/* ── When ── */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">When</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ge-date">Event date</Label>
              <Input
                id="ge-date"
                type="date"
                value={form.event_date}
                onChange={(e) => set('event_date', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-start-time">Start time</Label>
              <Input
                id="ge-start-time"
                type="time"
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-end-time">End time</Label>
              <Input
                id="ge-end-time"
                type="time"
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ge-start">Runs from</Label>
              <Input
                id="ge-start"
                type="datetime-local"
                value={form.start_date}
                onChange={(e) => set('start_date', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-end">Runs until</Label>
              <Input
                id="ge-end"
                type="datetime-local"
                value={form.end_date}
                onChange={(e) => set('end_date', e.target.value)}
              />
            </div>
          </div>
          {badRunWindow && (
            <p className="text-xs text-destructive">
              &ldquo;Runs until&rdquo; must be on or after &ldquo;Runs from&rdquo;.
            </p>
          )}
        </div>

        {/* ── Where ── */}
        <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ge-venue">Venue</Label>
            <Input
              id="ge-venue"
              placeholder="e.g. Main Auditorium"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ge-venue-text">Venue notes</Label>
            <Input
              id="ge-venue-text"
              placeholder="Directions, block, floor…"
              value={form.venue_text}
              onChange={(e) => set('venue_text', e.target.value)}
            />
          </div>
        </div>

        {/* ── Registration ── */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Registration</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ge-reg-open">Opens</Label>
              <Input
                id="ge-reg-open"
                type="datetime-local"
                value={form.registration_open_date}
                onChange={(e) => set('registration_open_date', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-reg-close">Closes</Label>
              <Input
                id="ge-reg-close"
                type="datetime-local"
                value={form.registration_close_date}
                onChange={(e) => set('registration_close_date', e.target.value)}
              />
            </div>
          </div>
          {badRegWindow && (
            <p className="text-xs text-destructive">
              Registration must close on or after it opens.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            This is the event-wide window. Each registration form can also carry
            its own start and end dates.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ge-max">Max registrations</Label>
              <Input
                id="ge-max"
                type="number"
                min={0}
                value={form.max_registrations}
                onChange={(e) => set('max_registrations', e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-target">Target</Label>
              <Input
                id="ge-target"
                type="number"
                min={0}
                value={form.target_registrations}
                onChange={(e) => set('target_registrations', e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ge-year">Year</Label>
              <Input
                id="ge-year"
                type="number"
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
                placeholder="e.g. 2026"
              />
            </div>
          </div>
        </div>

        {/* ── Audience ── */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Audience</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => set('scope', v as EventScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select
                value={form.visibility}
                onValueChange={(v) => set('visibility', v as EventVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITIES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0 pr-3">
              <Label htmlFor="ge-is-public" className="cursor-pointer">
                Publicly visible
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Still hidden while the event is a Draft — status is a separate
                lever, set on the event console.
              </p>
            </div>
            <Switch
              id="ge-is-public"
              checked={form.is_public}
              onCheckedChange={(v) => set('is_public', v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0 pr-3">
              <Label htmlFor="ge-external" className="cursor-pointer">
                Allow external registration
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Let people outside JKKN register.
              </p>
            </div>
            <Switch
              id="ge-external"
              checked={form.allow_external_registration}
              onCheckedChange={(v) => set('allow_external_registration', v)}
            />
          </div>
        </div>

        {/* ── People ── Same editor the create wizard's People tab renders, so
            the two entry points cannot drift. Both fields live in
            events.config, and the write above merges rather than replaces. */}
        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-semibold">People</h3>
          <EventPeopleFields
            incharges={form.incharges}
            chiefGuests={form.chief_guests}
            onInchargesChange={(next) => setForm((prev) => ({ ...prev, incharges: next }))}
            onChiefGuestsChange={(next) =>
              setForm((prev) => ({ ...prev, chief_guests: next }))
            }
            pickerOpen={pickerOpen}
            onPickerOpenChange={setPickerOpen}
            error={peopleError}
            disabled={isPending}
          />
        </div>

        {/* NAAC evidence tags — writes events.naac_criteria; the evidence
            emitter picks tagged events up once they complete. */}
        <div className="border-t pt-4">
          <NaacCriteriaField
            value={form.naac_criteria}
            onChange={(next) => setForm((prev) => ({ ...prev, naac_criteria: next }))}
            disabled={isPending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSave}>
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
