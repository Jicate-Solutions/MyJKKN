'use client';

// components/events/shared/event-people-fields.tsx
//
// The In-charge + Chief guest editor, shared by the create wizard's People tab
// and the general-event edit dialog. ONE editor so the two entry points cannot
// drift — the same reason /events/tournament/[id] reuses the list page's edit
// dialog rather than growing its own.
//
// The two fields are different in KIND and are deliberately not styled alike:
//
//   IN-CHARGE is an ACCESS GRANT. It lives in `events.config.incharges` as
//   [{member_id, name}], and the SECURITY DEFINER function
//   fn_is_event_incharge(uuid) matches auth.uid() against member_id there to
//   back RLS policies and API gates (including the general event
//   registration-form builder). So it must be a real MyJKKN user picked from
//   the directory — free text would grant nothing and quietly look like it had.
//
//   CHIEF GUEST is display data. A chief guest is usually an outsider with no
//   MyJKKN account, so it is free text; a directory picker would exclude the
//   common case.

import { Plus, ShieldCheck, Star, Trash2, UserPlus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MemberPickerDialog,
  type PickedMember,
} from '@/components/events/shared/member-picker-dialog';

// ── Types ───────────────────────────────────────────────────────────────────

/** Exactly the shape fn_is_event_incharge() reads. `member_id` is an auth uid. */
export interface EventInchargeDraft {
  member_id: string;
  name: string;
}

/** A chief guest being edited. `key` is a client-side list key and never ships. */
export interface ChiefGuestDraft {
  key: string;
  name: string;
  designation: string;
  organization: string;
}

/** The persisted chief-guest shape in `events.config.chief_guests`. */
export interface ChiefGuest {
  name: string;
  designation?: string;
  organization?: string;
}

let chiefGuestSeq = 0;
export function emptyChiefGuestDraft(): ChiefGuestDraft {
  chiefGuestSeq += 1;
  return { key: `guest-${chiefGuestSeq}`, name: '', designation: '', organization: '' };
}

// ── config <-> drafts ───────────────────────────────────────────────────────

/**
 * Read in-charges out of an event's config. Defensive about shape because
 * `config` is untyped jsonb that several surfaces write.
 */
export function parseIncharges(
  config: Record<string, unknown> | null | undefined,
): EventInchargeDraft[] {
  const raw = config?.incharges;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (i): i is { member_id: string; name?: unknown } =>
        !!i && typeof (i as { member_id?: unknown }).member_id === 'string',
    )
    .map((i) => ({
      member_id: i.member_id,
      name: typeof i.name === 'string' ? i.name : i.member_id,
    }));
}

/** Read chief guests out of an event's config, as editable drafts. */
export function parseChiefGuestDrafts(
  config: Record<string, unknown> | null | undefined,
): ChiefGuestDraft[] {
  const raw = config?.chief_guests;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (g): g is { name: string; designation?: unknown; organization?: unknown } =>
        !!g && typeof (g as { name?: unknown }).name === 'string',
    )
    .map((g) => ({
      ...emptyChiefGuestDraft(),
      name: g.name,
      designation: typeof g.designation === 'string' ? g.designation : '',
      organization: typeof g.organization === 'string' ? g.organization : '',
    }));
}

/** Drafts → the persisted shape. Unnamed rows are dropped; `key` never ships. */
export function serializeChiefGuests(drafts: ChiefGuestDraft[]): ChiefGuest[] {
  return drafts
    .filter((g) => g.name.trim())
    .map((g) => ({
      name: g.name.trim(),
      ...(g.designation.trim() ? { designation: g.designation.trim() } : {}),
      ...(g.organization.trim() ? { organization: g.organization.trim() } : {}),
    }));
}

/**
 * Merge people into an event's EXISTING config for an update.
 *
 * `EventBaseService.updateEvent` is a raw passthrough and `config` is one jsonb
 * column, so sending `{ config: { incharges } }` REPLACES the whole object —
 * silently discarding `home`, `format`, `enabled_tools`, `preset_id` and `fee`.
 * Every write of config from an edit surface has to spread the current value
 * first (the same pattern the tournament in-charge panel uses).
 *
 * Unlike the create path, the keys are written even when EMPTY: on edit, "no
 * in-charges" has to be distinguishable from "don't touch in-charges", or
 * removing the last one would silently do nothing.
 */
export function mergeEventPeopleConfig(
  existing: Record<string, unknown> | null | undefined,
  people: { incharges: EventInchargeDraft[]; chiefGuests: ChiefGuestDraft[] },
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    incharges: people.incharges.map((i) => ({ member_id: i.member_id, name: i.name })),
    chief_guests: serializeChiefGuests(people.chiefGuests),
  };
}

/** Problems worth blocking a save on. Empty object = fine. */
export function validatePeople(people: {
  incharges: EventInchargeDraft[];
  chiefGuests: ChiefGuestDraft[];
}): string | undefined {
  const nameless = people.chiefGuests.find(
    (g) => !g.name.trim() && (g.designation.trim() || g.organization.trim()),
  );
  if (nameless) return 'Every chief guest needs a name.';

  const ids = people.incharges.map((i) => i.member_id);
  if (new Set(ids).size !== ids.length) {
    return 'The same person is listed as in-charge twice.';
  }
  return undefined;
}

// ── UI ──────────────────────────────────────────────────────────────────────

export function EventPeopleFields({
  incharges,
  chiefGuests,
  onInchargesChange,
  onChiefGuestsChange,
  pickerOpen,
  onPickerOpenChange,
  error,
  disabled = false,
}: {
  incharges: EventInchargeDraft[];
  chiefGuests: ChiefGuestDraft[];
  onInchargesChange: (next: EventInchargeDraft[]) => void;
  onChiefGuestsChange: (next: ChiefGuestDraft[]) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  error?: string;
  disabled?: boolean;
}) {
  const addIncharges = (people: PickedMember[]) => {
    const existing = new Set(incharges.map((i) => i.member_id));
    const fresh = people
      .filter((p) => !existing.has(p.member_id))
      .map((p) => ({ member_id: p.member_id, name: p.name }));
    if (fresh.length) onInchargesChange([...incharges, ...fresh]);
    onPickerOpenChange(false);
  };

  const removeIncharge = (memberId: string) =>
    onInchargesChange(incharges.filter((i) => i.member_id !== memberId));

  const addGuest = () => onChiefGuestsChange([...chiefGuests, emptyChiefGuestDraft()]);

  const removeGuest = (key: string) =>
    onChiefGuestsChange(chiefGuests.filter((g) => g.key !== key));

  const editGuest = (key: string, field: keyof ChiefGuestDraft, value: string) =>
    onChiefGuestsChange(
      chiefGuests.map((g) => (g.key === key ? { ...g, [field]: value } : g)),
    );

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* ── In-charge ── */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Label className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 opacity-60" /> Event in-charge
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              MyJKKN users given full control of this one event — without needing the
              module-wide manage permission. This is a real access grant, so pick people
              from the directory.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled}
            onClick={() => onPickerOpenChange(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add in-charge
          </Button>
        </div>

        {incharges.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
            No in-charge yet — only people who already hold the events manage permission
            will be able to run this event.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {incharges.map((i) => (
              <Badge
                key={i.member_id}
                variant="secondary"
                className="gap-1.5 py-1 pl-2.5 pr-1"
              >
                {i.name}
                <button
                  type="button"
                  aria-label={`Remove ${i.name} as in-charge`}
                  className="rounded-full p-0.5 hover:bg-background/60 disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => removeIncharge(i.member_id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* ── Chief guests ── */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Label className="flex items-center gap-1.5 text-sm font-semibold">
              <Star className="h-4 w-4 opacity-60" /> Chief guest
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Who is being honoured or invited to preside. Shown on the event console and
              in the programme — this grants no access.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled}
            onClick={addGuest}
          >
            <Plus className="h-3.5 w-3.5" />
            Add guest
          </Button>
        </div>

        {chiefGuests.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
            No chief guest recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {chiefGuests.map((g, i) => (
              <div key={g.key} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Guest {i + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => removeGuest(g.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`guest-name-${g.key}`} className="text-xs">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`guest-name-${g.key}`}
                      placeholder="e.g. Dr. R. Kalaiselvi"
                      value={g.name}
                      onChange={(e) => editGuest(g.key, 'name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guest-desig-${g.key}`} className="text-xs">
                      Designation
                    </Label>
                    <Input
                      id={`guest-desig-${g.key}`}
                      placeholder="e.g. Director"
                      value={g.designation}
                      onChange={(e) => editGuest(g.key, 'designation', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guest-org-${g.key}`} className="text-xs">
                      Organization
                    </Label>
                    <Input
                      id={`guest-org-${g.key}`}
                      placeholder="e.g. Anna University"
                      value={g.organization}
                      onChange={(e) => editGuest(g.key, 'organization', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MemberPickerDialog
        open={pickerOpen}
        onClose={() => onPickerOpenChange(false)}
        onAdd={addIncharges}
        existingNames={incharges.map((i) => i.name)}
        title="Add Event In-charge"
        description="An in-charge must be a MyJKKN user — the grant is matched against their login, so an outside person cannot be one."
      />
    </div>
  );
}
