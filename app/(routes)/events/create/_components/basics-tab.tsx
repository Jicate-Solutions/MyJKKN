'use client';

// Basics tab — identity + audience.
//
// Scope, Visibility and "Participants come from" are the fields this wizard
// never asked for: every event it created was stored with scope NULL and
// visibility NULL, while a tournament created through /events/tournament/new
// carried both. The audience rules downstream read those columns, so the two
// kinds of event behaved differently for no reason a user could see.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EventScope, EventVisibility, ParticipantOrgType } from '@/types/events';
import type { EventCreateForm } from './event-create-form';
import { resolveVisibility } from './event-create-form';

const SCOPES: { value: EventScope; label: string; hint: string }[] = [
  { value: 'institution', label: 'This institution only', hint: 'Only the host college takes part.' },
  { value: 'all_jkkn', label: 'All JKKN institutions', hint: 'Open across every JKKN college.' },
  { value: 'chapter', label: 'Chapter', hint: 'A chapter-level programme.' },
];

const VISIBILITIES: { value: EventVisibility; label: string }[] = [
  { value: 'institution', label: 'Institution' },
  { value: 'all_jkkn', label: 'All JKKN' },
  { value: 'public', label: 'Public' },
  { value: 'invited', label: 'Invited only' },
];

export function BasicsTab({
  form,
  set,
  institutions,
  allInstitutions,
  institutionId,
  institutionsLoading,
  onHostChange,
  showRequired = false,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  /** Institutions this user may file an event under — the first host must be one. */
  institutions: { id: string; name: string }[];
  /** Every active college — any of them can be a joint host. */
  allInstitutions: { id: string; name: string }[];
  institutionId: string;
  institutionsLoading: boolean;
  onHostChange: (id: string) => void;
  /** Set after "Save & Next" / "Create event" was pressed with this tab incomplete —
   *  turns the missing mandatory fields red with an inline message. */
  showRequired?: boolean;
}) {
  const nameMissing = showRequired && !form.name.trim();
  const hostMissing = showRequired && !institutionId;

  // Show what an unset visibility will actually be saved as, rather than an
  // empty select that reads as "nothing will be written".
  const derivedVisibility = resolveVisibility(form.scope, '');

  // HOSTS — one multi-select. The first selected institution is stored as
  // `institution_id` (fees settle there and it decides same- vs cross-college room
  // holds), so it must be one this user may file an event under; every other one
  // — any active college — goes to `config.co_hosts`.
  const [hostsOpen, setHostsOpen] = useState(false);
  const accessibleIds = new Set(institutions.map((i) => i.id));
  const options = [
    ...institutions,
    ...allInstitutions.filter((i) => !accessibleIds.has(i.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const coHosts = form.co_hosts.filter((h) => h.id !== institutionId);
  const primary = institutions.find((i) => i.id === institutionId);
  const hosts = [...(primary ? [primary] : []), ...coHosts];
  const toggleHost = (inst: { id: string; name: string }) => {
    if (inst.id === institutionId) {
      // At least one host is required, and the first must be a college this user
      // can file under. Removing it hands that role to the next such college.
      const next = coHosts.find((h) => accessibleIds.has(h.id));
      if (!next) {
        if (coHosts.length) {
          toast.error(
            `${inst.name} can't be removed — at least one host must be a college you can create events for.`,
          );
        }
        return;
      }
      onHostChange(next.id);
      set('co_hosts', coHosts.filter((h) => h.id !== next.id));
      return;
    }
    set(
      'co_hosts',
      coHosts.some((h) => h.id === inst.id)
        ? coHosts.filter((h) => h.id !== inst.id)
        : [...coHosts, { id: inst.id, name: inst.name }],
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">
          Event Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          placeholder="e.g. Industry Connect — Resume Workshop"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
          aria-invalid={nameMissing || undefined}
          className={nameMissing ? 'border-destructive focus-visible:ring-destructive' : undefined}
        />
        {nameMissing && <p className="text-xs text-destructive">Event name is required.</p>}
      </div>

      {/* Host institutions — the first one decides whether picking a room is a
          same-college hold or a cross-college request, so this sits above Venue. */}
      <div className="space-y-2">
        <Label htmlFor="host_institutions">
          Host Institutions <span className="text-destructive">*</span>
        </Label>
        <Popover open={hostsOpen} onOpenChange={setHostsOpen}>
          <PopoverTrigger asChild>
            <Button
              id="host_institutions"
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={hostsOpen}
              aria-invalid={hostMissing || undefined}
              className={`h-auto min-h-10 w-full justify-between font-normal ${
                hostMissing ? 'border-destructive' : ''
              }`}
              disabled={institutionsLoading || institutions.length === 0}
            >
              <span className={`text-left ${hosts.length ? '' : 'text-muted-foreground'}`}>
                {institutionsLoading
                  ? 'Loading institutions…'
                  : hosts.length === 0
                    ? 'Select host institutions'
                    : hosts.length === 1
                      ? hosts[0].name
                      : `${hosts.length} institutions selected`}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search institutions…" />
              <CommandList>
                <CommandEmpty>No institution found.</CommandEmpty>
                <CommandGroup>
                  {options.map((inst) => {
                    const selected = hosts.some((h) => h.id === inst.id);
                    return (
                      <CommandItem
                        key={inst.id}
                        value={inst.name}
                        onSelect={() => toggleHost(inst)}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${selected ? 'opacity-100' : 'opacity-0'}`}
                        />
                        {inst.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {hosts.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {hosts.map((h) => (
              <Badge key={h.id} variant="secondary" className="gap-1 pr-1 font-normal">
                {h.name}
                <button
                  type="button"
                  onClick={() => toggleHost(h)}
                  className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`Remove ${h.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {hostMissing && (
          <p className="text-xs text-destructive">Pick the host institution.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Select every college hosting this event. The first one must be a college
          you can create events for — registration fees settle into its payment
          account, and booking a room owned by a different college needs that
          college&apos;s approval.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            placeholder="One-line summary"
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="theme">Theme</Label>
          <Input
            id="theme"
            placeholder="e.g. Sustainability"
            value={form.theme}
            onChange={(e) => set('theme', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Brief description of the event…"
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      {/* ── Audience ── */}
      <div className="space-y-4 rounded-lg border p-3">
        <Label className="text-sm font-semibold">Audience</Label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="scope" className="text-xs">
              Scope
            </Label>
            <Select
              value={form.scope}
              onValueChange={(v) => set('scope', v as EventScope)}
            >
              <SelectTrigger id="scope">
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
            <p className="text-xs text-muted-foreground">
              {SCOPES.find((s) => s.value === form.scope)?.hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="visibility" className="text-xs">
              Visibility
            </Label>
            <Select
              value={form.visibility || '__derived'}
              onValueChange={(v) =>
                set('visibility', v === '__derived' ? '' : (v as EventVisibility))
              }
            >
              <SelectTrigger id="visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__derived">
                  Match the scope ({derivedVisibility})
                </SelectItem>
                {VISIBILITIES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Who this event is listed to. Left to match the scope unless you choose.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="participant_org" className="text-xs">
            Participants come from
          </Label>
          <Select
            value={form.participant_org_type}
            onValueChange={(v) => set('participant_org_type', v as ParticipantOrgType)}
          >
            <SelectTrigger id="participant_org" className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="school">Schools</SelectItem>
              <SelectItem value="college">Colleges</SelectItem>
              <SelectItem value="both">Both schools and colleges</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sets what external entrants are asked on the public registration form:
            Schools shows &ldquo;School / club&rdquo; with the school-directory picker;
            Colleges shows &ldquo;College&rdquo; as free text; Both lets each entrant
            choose school or college first.
          </p>
        </div>
      </div>
    </div>
  );
}
