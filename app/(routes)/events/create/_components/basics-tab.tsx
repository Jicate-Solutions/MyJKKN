'use client';

// Basics tab — identity + audience.
//
// Scope, Visibility and "Participants come from" are the fields this wizard
// never asked for: every event it created was stored with scope NULL and
// visibility NULL, while a tournament created through /events/tournament/new
// carried both. The audience rules downstream read those columns, so the two
// kinds of event behaved differently for no reason a user could see.

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
import type { EventScope, EventVisibility } from '@/types/events';
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
  institutionId,
  institutionsLoading,
  onHostChange,
}: {
  form: EventCreateForm;
  set: <K extends keyof EventCreateForm>(field: K, value: EventCreateForm[K]) => void;
  institutions: { id: string; name: string }[];
  institutionId: string;
  institutionsLoading: boolean;
  onHostChange: (id: string) => void;
}) {
  // Show what an unset visibility will actually be saved as, rather than an
  // empty select that reads as "nothing will be written".
  const derivedVisibility = resolveVisibility(form.scope, '');

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
        />
      </div>

      {/* Host institution — it decides whether picking a room is a same-college
          hold or a cross-college request, so it sits above Venue. */}
      <div className="space-y-2">
        <Label htmlFor="host_institution">
          Host Institution <span className="text-destructive">*</span>
        </Label>
        <Select value={institutionId} onValueChange={onHostChange}>
          <SelectTrigger id="host_institution">
            <SelectValue
              placeholder={
                institutionsLoading ? 'Loading institutions…' : 'Select host institution'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {institutions.map((inst) => (
              <SelectItem key={inst.id} value={inst.id}>
                {inst.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The college this event is filed under. Booking a room owned by a different
          college needs that college&apos;s approval, and registration fees settle into
          this institution&apos;s payment account.
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
            onValueChange={(v) => set('participant_org_type', v as 'school' | 'college')}
          >
            <SelectTrigger id="participant_org" className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="school">Schools</SelectItem>
              <SelectItem value="college">Colleges</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sets what external entrants are asked on the public registration form:
            Schools shows &ldquo;School / club&rdquo; with the school-directory picker;
            Colleges shows &ldquo;College&rdquo; as free text.
          </p>
        </div>
      </div>
    </div>
  );
}
