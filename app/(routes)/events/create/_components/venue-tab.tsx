'use client';

// Venue tab — the booking spine.
//
// Lifted verbatim from the old single-step form, plus an optional street
// address for off-campus events (`events.venue_address`, a column the wizard
// never wrote). On-campus events MUST pick a real room, which is held so it
// cannot be double-booked; off-campus events type a free-text place (no hold).
//
// Clashes name the DAY and the HOLDER. The spine already returns both; the
// original flow threw them away for a blanket "already booked", which made the
// clash look arbitrary.

import { Loader2, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { VenueRoomPicker } from '@/components/events/venue/venue-room-picker';
import type { EventVenueClash } from '@/lib/services/events/venue/event-venue';
import type { EventCreateForm } from './event-create-form';

export function VenueTab({
  form,
  set,
  offCampus,
  onOffCampusChange,
  venueResourceId,
  onVenueResourceChange,
  checking,
  clashes,
  daySlotCount,
  dayCount,
  dayLabel,
  timeRangeLabel,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  offCampus: boolean;
  onOffCampusChange: (next: boolean) => void;
  venueResourceId: string;
  onVenueResourceChange: (id: string) => void;
  checking: boolean;
  clashes: EventVenueClash[];
  daySlotCount: number;
  dayCount: number;
  dayLabel: (iso: string) => string;
  timeRangeLabel: (startIso: string, endIso: string) => string;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 opacity-60" /> Venue
        </Label>
        <label
          htmlFor="off-campus"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          Off-campus
          <Switch id="off-campus" checked={offCampus} onCheckedChange={onOffCampusChange} />
        </label>
      </div>

      {offCampus ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="venue" className="text-xs">
              Place <span className="text-destructive">*</span>
            </Label>
            <Input
              id="venue"
              placeholder="e.g. City Convention Centre, or an online link"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venue_address" className="text-xs">
              Address
            </Label>
            <Input
              id="venue_address"
              placeholder="Street, city — shown to participants"
              value={form.venue_address}
              onChange={(e) => set('venue_address', e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            No room is held for an off-campus event — this is recorded as text only.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <VenueRoomPicker value={venueResourceId} onChange={onVenueResourceChange} />

          {checking && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking this room for {dayCount === 1 ? 'that day' : `all ${dayCount} days`}…
            </p>
          )}

          {!checking && clashes.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
              <p className="text-xs font-medium text-destructive">
                Already booked on {clashes.length} of your {daySlotCount}{' '}
                {daySlotCount === 1 ? 'day' : 'days'}:
              </p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {clashes.map((c) => (
                  <li key={c.slot.startIso}>
                    <span className="font-medium text-foreground">
                      {dayLabel(c.slot.startIso)}
                    </span>{' '}
                    — {c.holderName || 'another user'}
                    {c.holderDesignation ? ` (${c.holderDesignation})` : ''},{' '}
                    {timeRangeLabel(c.holderStart, c.holderEnd)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Pick another room, or change the day/hours on the Schedule tab.
              </p>
            </div>
          )}

          {!checking && !!venueResourceId && daySlotCount > 0 && clashes.length === 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              Free on {dayCount === 1 ? 'that day' : `all ${dayCount} days`} — the room is
              held when you create the event.
            </p>
          )}

          {!venueResourceId && (
            <p className="text-xs text-muted-foreground">
              Pick a campus room — it gets held so no one else can book it at the same time.
            </p>
          )}
          {!!venueResourceId && daySlotCount === 0 && (
            <p className="text-xs text-muted-foreground">
              Set the date and hours on the Schedule tab to check this room and hold it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
