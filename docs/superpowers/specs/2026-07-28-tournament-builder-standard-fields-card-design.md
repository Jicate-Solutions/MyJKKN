# Registration Form Builder — Standard Fields Card

**Date:** 2026-07-28
**Status:** Approved, ready for implementation plan
**Module:** Events → Sports Tournament → Registration Form builder

## Problem

The tournament registration form is two stacked layers:

1. **Standard fields** — hardcoded in `app/p/tournament/[id]/register/_components/register-form.tsx`. Every tournament collects these: division, entry name, external toggle, institution, gender/age, roster, phone, email.
2. **Custom fields** — authored per tournament in the builder at
   `/events/tournament/[id]/registration-form`, stored in
   `event_registration_form_sections` / `event_registration_form_fields`.

The builder shows only layer 2. An organizer configuring a form has no way to
see what is already being collected, so the two layers are invisible to each
other.

This is not hypothetical. On **JKKN 100 VOLLEY BALL INTER COLLEGE**
(`f2a3e86d-bff9-4408-a11c-2d5568456820`) the organizer created a custom
`College name?` field that duplicates the built-in institution field. Registrants
are asked for their college twice. The organizer also could not tell whether
their event would render "School / club" or "College" for that built-in field.

## Goal

Show the standard fields in the builder, above the custom sections, so an
organizer sees the whole form before adding to it.

## Non-goals

Explicitly out of scope, decided during design:

- **Editing the standard fields** — no enable/disable, no required toggle, no
  relabelling. Read-only.
- **Reordering** custom sections relative to standard fields. The public form's
  render order stays fixed in JSX.
- **Per-tournament accuracy.** The card shows the same list for all tournaments;
  it does not read divisions or `participant_org_type` to narrow the list.
- **Duplicate detection.** No warning when a custom field label resembles a
  standard one.
- Any change to the public registration form, its API, services, or the database.

## Design

### Component

New file:
`app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card.tsx`

Purely presentational — no props, no state, no effects, no data fetching. A
module-level constant drives the render:

```ts
const STANDARD_FIELDS = [
  { label: 'Event / division',          control: 'Dropdown',           shownWhen: 'Always' },
  { label: 'Team name / Your name',     control: 'Text',               shownWhen: 'Always' },
  { label: 'External (non-JKKN)',       control: 'Toggle',             shownWhen: 'Always' },
  { label: 'School / club or College',  control: 'Text or directory picker', shownWhen: 'Always' },
  { label: 'Gender, Age',               control: 'Dropdown + number',  shownWhen: 'Individual events only' },
  { label: 'Roster (name + jersey no)', control: 'Repeater rows',      shownWhen: 'Team events only' },
  { label: 'Phone, Email',              control: 'Text',               shownWhen: 'Guests and external entrants' },
] as const
```

Rendered as a `Card` with a lock affordance per row, matching the surrounding
builder styling. Copy states plainly that these are built in and should not be
re-created as custom fields.

The list mirrors the JSX order in `register-form.tsx` so the card reads in the
same sequence a registrant meets the fields.

### Placement

Two locations, deliberately weighted differently, in
`registration-form-editor.tsx`:

**Builder column** — the full card, above the sections list and above the
"Add section" button. This is where an organizer decides what to create, so this
is where the "don't re-create these" message belongs.

**Preview column** — not the card. A single muted line above the previewed
sections:

> Registrants fill the standard fields (division, name, college, roster,
> contact) before these.

The panel is titled "Preview — what registrants will see". Omitting any mention
of the standard fields makes that title inaccurate; repeating the whole card
there is noise. One line resolves both.

### Data flow

None. The component imports nothing from the network or the database.

### Error handling

None required. A component with no inputs and no async work has no failure mode
beyond a render error, which would be a compile-time bug.

## Drift risk and mitigation

The card is static text describing code that lives elsewhere. If someone adds,
removes, or renames a field in `register-form.tsx`, the card silently becomes
wrong.

Accepted knowingly — a tournament-aware card could not drift, but pays
complexity on every read. Mitigation is a cross-reference comment in both files:

- `register-form.tsx` — note that adding or removing a standard field requires
  updating `standard-fields-card.tsx`.
- `standard-fields-card.tsx` — note that the list mirrors `register-form.tsx`
  and must be kept in sync.

## Testing

- `npm run typecheck` clean.
- Visual check of the builder page: card renders above sections in the builder
  column; the one-line note renders above the preview sections.
- Confirm the public registration form is byte-for-byte unchanged — no file
  under `app/p/tournament/` is touched by this work.

## Files

| File | Change |
|---|---|
| `.../registration-form/_components/standard-fields-card.tsx` | New — the card |
| `.../registration-form/_components/registration-form-editor.tsx` | Render card in builder column; add the note in the preview column |
| `app/p/tournament/[id]/register/_components/register-form.tsx` | Comment only — cross-reference to keep the card in sync |

No migration. No API route. No service. No hook.
