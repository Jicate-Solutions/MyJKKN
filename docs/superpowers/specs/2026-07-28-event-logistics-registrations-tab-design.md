# Event Logistics — Registrations Tab

**Date:** 2026-07-28
**Status:** Approved, ready for implementation plan
**Module:** Events → shared Event Logistics

## Problem

`EventLogistics` (`components/events/shared/event-logistics.tsx`) surfaces eleven
operational tabs on an event detail page — Sponsors, Budget, Committees,
Check-in, QR, Volunteers, Incidents, Certificates, Bulk Import, Analytics, Kit.

None of them shows **who registered**. An organizer running a tournament can see
the kit handout list and the check-in list, but never the registration list
itself: names, contact, institution, division, payment state, and the answers to
the custom questions they authored in the registration form builder.

Those custom answers are collected and stored — verified on
**JKKN 100 VOLLEY BALL INTER COLLEGE** (`f2a3e86d-…`), which has a real paid
registration carrying all six answers — but they are invisible in the admin UI.

Marathon has a dedicated registrations page
(`app/(routes)/events/marathon/[id]/registrations/page.tsx`), but it is 1623
lines of marathon-specific behaviour (BIB numbers, categories, bulk import,
payment polling) serving 1590 live registrations. It is not reusable and is not
worth destabilising.

## Goal

A **Registrations** tab in Event Logistics showing the registration list as a
sortable, searchable, paginated table, with each registrant's custom form
answers viewable and the whole filtered list exportable.

## Non-goals

- **No edits.** The tab does not create, update, cancel, or delete registrations.
- **No refactor of the marathon registrations page.** It is untouched.
- **No new database objects.** No table, column, migration, RPC, or policy.
- **No server-side pagination.** Client-side, matching what the marathon page
  already does at 1590 rows.
- **No bulk actions** (no bulk cancel, no bulk check-in).

## Design

### 1. Service — `lib/services/events/shared/event-registrations-service.ts`

`EventRegistrationsService.getRegistrations(eventId, eventType)` issues up to
three client-side reads and joins them in memory:

| # | Table | Columns | When |
|---|---|---|---|
| 1 | `events_registrations` | `id, participant_name, participant_phone, participant_email, participant_type, institution_name, status, payment_status, payment_amount, payment_method, source, checked_in, created_at, custom_fields` | always |
| 2 | `event_registration_form_fields` | `field_key, field_label, display_order, section_id` | always |
| 2b | `event_registration_form_sections` | `id, display_order` | always |
| 3 | `tournament_entries` → `tournament_divisions` | `registration_id, entry_name, entry_type, division_id` → `sport, age_band, gender` | only `eventType === 'sports_tournament'` |

Query 1 excludes `status = 'cancelled'` and orders by `created_at` descending.

**Query 2 is a direct read, deliberately not `useRegistrationForm`.** That hook
calls `EventRegistrationFormService.getOrCreateForm`, which *inserts* an
`event_registration_forms` row when none exists. Reusing it would create rows in
that table as a side effect of merely viewing a table — on marathon events that
have no registration form at all. The service queries
`event_registration_form_fields` by `event_id` directly and creates nothing.

Two pure helpers are exported so they can be unit-tested without a DOM:

```ts
export function buildDivisionLabel(d: {
  sport: string;
  age_band: string | null;
  gender: string | null;
}): string
```

Joins `sport`, `age_band` and `gender` with ` · `, omitting blanks and omitting
`gender` when it is `'open'`. Mirrors the existing `divLabel` in
`app/p/tournament/[id]/register/_components/register-form.tsx`.

```ts
export function mapCustomAnswers(
  customFields: Record<string, unknown> | null,
  fieldDefs: {
    field_key: string;
    field_label: string;
    section_order: number;
    field_order: number;
  }[]
): { label: string; value: string }[]
```

Maps each stored answer to its human label, ordered the way the form reads:
by **section order, then field order**.

**Why both.** `event_registration_form_fields.display_order` restarts at 0 in
every section — the volleyball form had fields 0,1,2 under "VOLLEY BALL
TOURNAMENTS" and 0,1,2 again under "Team details". Sorting on the field's own
`display_order` alone would interleave the two sections and present the answers
in an order that matches no form the registrant ever saw. Hence query 2b, which
supplies each section's order to sort on first.

**Unmatched keys must fall back to the raw key, never be dropped.** If an
organizer deletes a custom field after someone answered it, the answer survives
in `custom_fields` with no definition to name it. Silently omitting it would
lose submitted data from the organizer's view. Such entries sort last.

Values are stringified for display: arrays join with `, `; booleans render
`Yes` / `No`; `null` and `undefined` render `—`.

### 2. Hook — `hooks/events/shared/use-event-registrations.ts`

One `useQuery`, key `['event-registrations', eventId]`, `enabled: !!eventId`.

### 3. Board — `components/events/shared/registrations-board.tsx`

**Stat cards:** Total, Paid, Unpaid, External. Computed with `useMemo` from the
rows already fetched — no second round trip. (`KitBoard.getSummary()` re-fetches
the same rows for its summary; this deliberately does not.)

**Table:** the shared `DataTable` (`components/ui/data-table.tsx`), which
provides client-side pagination, sorting, column visibility and a toolbar slot.

Columns: Participant (name + phone), Institution, Type, **Division**, **Entry**,
Status, Payment, Source, Registered, View. The two bold columns render only for
`sports_tournament`.

`globalFilterFn` searches name, phone, email and institution. Status and payment
filters are `Select` controls above the table.

**Detail dialog:** the View action opens a dialog listing every custom answer
with its resolved label, plus the registrant's contact details. This keeps the
table narrow regardless of how many custom questions an event asks.

**Export:** an Export control in the `DataTable` `tableTools` slot offering Excel
and CSV via the existing `ExportService`. Because
`exportToExcel(data, headers, filename, sheetName)` takes `headers` as
`Record<key, label>`, the custom answers **flatten into columns** here even
though the table shows them in a dialog — a spreadsheet wants one row per
registrant with every answer visible. Exports the **filtered** rows, not all rows.

### 4. Registry — `components/events/shared/event-logistics.tsx`

One entry, `key: 'registrations'`, `label: 'Registrations'`, icon
`ClipboardList`, `eventTypes: 'all'`.

**Position: first**, ahead of Sponsors. The registry header documents itself as
append-only "so PRs don't collide"; that guard is about merge conflicts between
concurrent PRs, not about display order. With twelve tabs the list already wraps
to two rows, and the registration list is the primary record of an event —
appending it would bury the most important tab last. Accepted deviation,
recorded here so the next reader knows it was deliberate.

### Permissions

`canManage` is already threaded through `EventLogisticsContext`.

- **Table and dialog render for everyone who can see the tab.** RLS on
  `events_registrations` already grants read to admins, the host institution,
  and committee members (`events_reg_committee_member_read`), so a committee
  member viewing the list is consistent with what the database already permits.
- **Export is gated on `canManage`.** Viewing one registrant's row and
  downloading a spreadsheet of every registrant's phone number and email are
  different acts; only the latter is bulk PII extraction.

### Error and empty states

- Query error → inline error message with the DataTable's refresh affordance.
- No registrations → "No registrations yet." Not an error.
- Event with no custom form (e.g. marathon) → query 2 returns `[]`; the dialog
  shows contact details only, with no custom-answers section.
- Registration with no matching `tournament_entries` row (organizer-created
  entry, or a non-tournament event) → Division and Entry render `—`.

## Testing

**Unit (node environment, no jsdom):**
- `buildDivisionLabel` — full label; `gender: 'open'` omitted; null `age_band`
  omitted; sport only.
- `mapCustomAnswers` — labels resolved and ordered by `display_order`; an
  unmatched key falls back to the raw key and sorts last; `null` custom_fields
  returns `[]`; array, boolean and null values stringify correctly.

**Component (jsdom):**
- Renders a row per registration with the participant name.
- Opens the detail dialog and shows a custom answer under its resolved label,
  not its slug.
- Export control absent when `canManage` is false, present when true.
- Empty state when there are no registrations.

**Registry:**
- `EVENT_LOGISTICS_TABS` contains a `registrations` entry, it is visible for
  `sports_tournament`, and it is first.

## Files

| File | Change |
|---|---|
| `lib/services/events/shared/event-registrations-service.ts` | New — queries + pure helpers |
| `hooks/events/shared/use-event-registrations.ts` | New — one query hook |
| `components/events/shared/registrations-board.tsx` | New — stats, table, dialog, export |
| `components/events/shared/event-logistics.tsx` | Modify — one registry entry, first position |
| `__tests__/events/event-registrations-service.test.ts` | New — pure helper unit tests |
| `__tests__/events/registrations-board.test.tsx` | New — component + registry tests |

No migration. No API route. No change to any existing service, hook, page, or
the public registration form.
