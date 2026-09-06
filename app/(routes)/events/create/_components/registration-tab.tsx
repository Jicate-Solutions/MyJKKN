'use client';

// Registration tab — when people may sign up, how many, at what price, and
// which Event Logistics tools the event runs with.
//
// The registration window keeps its own columns (registration_open_date /
// registration_close_date) and says plainly that it does NOT book the room.
// With no field for it, organizers put the registration window into the run
// window, which held the venue for weeks.
//
// Capacity, entry fee, external registration and public visibility are new
// here: is_public was hardcoded `false` on this page and
// allow_external_registration was never written at all, so a wizard event was
// always JKKN-only and always private while a tournament could be neither.

import { Ticket, Wrench } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EVENT_TOOL_KEYS, EVENT_TOOL_LABELS } from '@/types/events-presets';
import type { EventToolKey } from '@/types/events-presets';
import type { EventCreateForm } from './event-create-form';

export function RegistrationTab({
  form,
  set,
  badRegWindow,
  capacityError,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  badRegWindow: boolean;
  capacityError?: string;
}) {
  const toggleTool = (key: EventToolKey, checked: boolean) =>
    set(
      'enabled_tools',
      checked
        ? form.enabled_tools.includes(key)
          ? form.enabled_tools
          : [...form.enabled_tools, key]
        : form.enabled_tools.filter((k) => k !== key),
    );

  return (
    <div className="space-y-4">
      {/* ── Window ── */}
      <div className="space-y-3 rounded-lg border p-3">
        <Label className="flex items-center gap-1.5">
          <Ticket className="h-4 w-4 opacity-60" /> Registration window
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reg_open" className="text-xs">
              Opens
            </Label>
            <Input
              id="reg_open"
              type="datetime-local"
              value={form.registration_open}
              onChange={(e) => set('registration_open', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg_close" className="text-xs">
              Closes
            </Label>
            <Input
              id="reg_close"
              type="datetime-local"
              value={form.registration_close}
              onChange={(e) => set('registration_close', e.target.value)}
            />
          </div>
        </div>
        {badRegWindow && (
          <p className="text-xs text-destructive">
            Registration must close on or after it opens.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          When people can sign up. This does <span className="font-medium">not</span> book
          the venue — only the hours under &ldquo;When it runs&rdquo; do.
        </p>
      </div>

      {/* ── Capacity + fee ── */}
      <div className="space-y-3 rounded-lg border p-3">
        <Label className="text-sm font-semibold">Capacity &amp; fee</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="max_reg" className="text-xs">
              Max registrations
            </Label>
            <Input
              id="max_reg"
              type="number"
              min={0}
              placeholder="Unlimited"
              value={form.max_registrations}
              onChange={(e) => set('max_registrations', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target_reg" className="text-xs">
              Target
            </Label>
            <Input
              id="target_reg"
              type="number"
              min={0}
              placeholder="—"
              value={form.target_registrations}
              onChange={(e) => set('target_registrations', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry_fee" className="text-xs">
              Entry fee (₹)
            </Label>
            <Input
              id="entry_fee"
              type="number"
              min={0}
              step={1}
              placeholder="0 = free entry"
              value={form.entry_fee}
              onChange={(e) => set('entry_fee', e.target.value)}
            />
          </div>
        </div>
        {capacityError && <p className="text-xs text-destructive">{capacityError}</p>}
        <p className="text-xs text-muted-foreground">
          The entry fee applies to every category that doesn&apos;t set its own on the
          Categories tab.
        </p>
      </div>

      {/* ── Who may register ── */}
      <div className="space-y-3 rounded-lg border p-3">
        <Label className="text-sm font-semibold">Who may register</Label>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="is_public" className="cursor-pointer">
              Publicly visible
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Allow a no-login public view. Still hidden while the event is a Draft —
              status is a separate lever on the event console.
            </p>
          </div>
          <Switch
            id="is_public"
            checked={form.is_public}
            onCheckedChange={(v) => set('is_public', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="allow_external" className="cursor-pointer">
              Allow external registration
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Let people outside JKKN register.
            </p>
          </div>
          <Switch
            id="allow_external"
            checked={form.allow_external_registration}
            onCheckedChange={(v) => set('allow_external_registration', v)}
          />
        </div>
      </div>

      {/* ── Event tools ── The Event Logistics tabs this event runs with.
          Selecting none means "all tools" — see EventLogistics. */}
      <div className="space-y-3 rounded-lg border p-3">
        <Label className="flex items-center gap-1.5">
          <Wrench className="h-4 w-4 opacity-60" /> Event tools
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EVENT_TOOL_KEYS.map((key) => (
            <label
              key={key}
              htmlFor={`tool-${key}`}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
            >
              <Checkbox
                id={`tool-${key}`}
                checked={form.enabled_tools.includes(key)}
                onCheckedChange={(v) => toggleTool(key, v === true)}
              />
              <span className="min-w-0 truncate">{EVENT_TOOL_LABELS[key]}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {form.enabled_tools.length === 0
            ? 'Nothing selected — the event console shows every tool. Pick some to show only those.'
            : `The event console will show only these ${form.enabled_tools.length} tools (plus Registrations).`}
        </p>
      </div>
    </div>
  );
}
