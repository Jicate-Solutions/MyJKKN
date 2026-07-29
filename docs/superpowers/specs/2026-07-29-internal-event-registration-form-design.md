# Internal Event Registration Form — Design

**Date:** 2026-07-29
**Status:** Approved, ready for planning
**Driving case:** "JKKN School of Influencer" (`84a49ec4-8fc8-44f9-a6a1-e84df5330f07`), an
`event_type='lecture'` event that has no way to collect registrations today.

## Problem

The events platform can build a dynamic registration form and collect answers, but only for
tournaments. The **data model is already generic** — `event_registration_forms`,
`event_registration_form_sections`, `event_registration_form_fields` and `events_registrations`
are all keyed on `event_id` with no event-type column — while the **routes are not**:

| Stage | Where it lives | Works for a lecture? |
|---|---|---|
| Reach the builder | `/events/tournament/[id]` detail page | No — general events have no detail page |
| Build the form | `/events/tournament/[id]/registration-form` | Renders (the page does not filter `event_type`), but gated on `sports.tournaments.manage` |
| Fill the form | `/p/tournament/[id]/register` | **No** — `.eq('event_type','sports_tournament')` at `page.tsx:59`; also requires ≥1 `tournament_divisions` row |
| Submit | `/api/events/tournament/[eventId]/public-register` | **No** — same type filter at `route.ts:71` |
| See responses | `EventLogistics` → Registrations tab | Rendered only on the tournament detail page |

Net effect: an organizer can author a form for a lecture that nobody on earth can fill in.

The read path is already event-type agnostic. `EventRegistrationsService.getRegistrations()`
reads `events_registrations` for any event and maps `custom_fields` keys back to the labels the
registrant saw. Only the **write** path and the **routing** are tournament-bound.

## Goal

A logged-in JKKN user can open a link, fill the organizer's questions, and submit — for any event
type. The organizer can build that form and read the answers from a page that belongs to the event.

## Requirements (decided during brainstorming)

| # | Decision | Rationale |
|---|---|---|
| R1 | **Shared link only** — no student browse page, no menu entry | Smallest surface that solves the real need; organizer controls the audience |
| R2 | **Any logged-in JKKN user** may register (students and staff) | Faculty attend the influencer school too; an authenticated session is the whole gate |
| R3 | Open/closed = `status ∉ {draft, cancelled}` **AND** now within `registration_open_date`..`registration_close_date` | Identical rule to tournaments; both columns already exist; no schema change |
| R4 | **One registration per person per event**; returning visitors see their answers read-only | Avoids duplicate-cleanup work for the organizer |
| R5 | `canManage` mirrors existing RLS: `super_admin` OR role ∈ {`admin`,`administrator`,`event_coordinator`} OR listed in `events.config.incharges` | UI gate == DB gate, so nobody is let into a page the DB will blank. No new permission key, no policy change |
| R6 | Identity is **read-only from the profile**; the form asks for **phone** plus the organizer's custom fields | Nothing is asked twice; `profiles` has no phone column |
| R7 | A submission is immediately confirmed — `status='registered'`, no approval queue, no capacity cap | Explicit assumption; revisit if the school has limited seats |

### Out of scope

- Student-facing event browse/listing page (candidate follow-up spec)
- Payments — internal registrations are `payment_status='not_required'`
- Guest / non-JKKN registration for general events
- Team or multi-person entries (tournament-only concept)
- Editing a submitted registration (R4 is read-only on return)

## Approach

**Additive route tree.** Three new pages and one new API route. No existing route moves, and the
tournament flow — 43 tests across 4 files as of commit `691e116f4` — is not touched.

Rejected alternatives:

- *Move the builder to a shared canonical route, tournament redirects.* Avoids a duplicate route
  file, but edits a working freshly-tested flow, and the two contexts need genuinely different
  access gates (`sports.tournaments.manage` vs R5), producing a composite `canManage` harder to
  reason about than two thin pages.
- *No detail page; reuse the tournament URLs.* The tournament builder already loads for any event
  id, but there would be nowhere to see responses for a lecture and breadcrumbs would read
  "Tournaments › JKKN School of Influencer".

## Architecture

### New files

```
app/(routes)/events/[id]/page.tsx                    Organizer detail + logistics + share link
app/(routes)/events/[id]/registration-form/page.tsx  Builder shell
app/(routes)/events/[id]/register/page.tsx           Registrant form
app/api/events/[eventId]/register/route.ts           POST — validate + service-role insert
hooks/events/use-event-access.ts                     Shared canManage/canView gate (R5)
supabase/migrations/<ts>_events_registrations_one_self_per_profile.sql
```

### Reused unchanged

| Piece | Reused for |
|---|---|
| `RegistrationFormEditor` | the entire builder — takes only `eventId` |
| `EventRegistrationFormService` | form CRUD + the atomic `save_event_registration_form` RPC |
| `validateCustomFields()` | server-side required-field gate |
| `DynamicFieldInput` | rendering each custom field on the registrant form |
| `EventLogistics` | Registrations, Check-in, QR, Certificates, Kit — every tab is already `eventTypes: 'all'` |
| `EventRegistrationsService` | reading rows back with correct labels and order |

### Modified existing

| File | Change | Why |
|---|---|---|
| `registration-form-editor.tsx:460` | hardcoded back-link `/events/tournament/${eventId}` → `backHref` prop, defaulting to the tournament path | The shared editor must not know it is inside a tournament route; default keeps the existing caller unchanged |
| `app/(routes)/events/_components/general-events-section.tsx` | link the event name to `/events/[id]` | Today the name is plain text with only an Edit button — there would be no way into the new page |

## Data flow

```
POST /api/events/[eventId]/register   { phone, custom_fields }
  │
  ├─ 1. auth.getUser()                       → 401 if signed out
  ├─ 2. load event (service-role)            → 404 if missing
  │        status ∉ {draft, cancelled}       → 404 "not open for registration"
  │        now within window                 → 422 "opens on …" / "has closed"
  ├─ 3. load profile + resolve department    → full_name, email, institution_id,
  │                                             department_id → department_name
  ├─ 4. any non-cancelled row for
  │     (event_id, profile_id)?              → 409 already registered
  ├─ 5. load form field defs → validateCustomFields()  → 422 on a missing required field
  └─ 6. service-role INSERT                  → 201 { registration_id }
```

Steps 2, 4 and 5 are re-checked server-side even though the page checks them too. This is not
belt-and-braces politeness: `events_registrations` carries an INSERT policy
`events_reg_public_insert` with role `{public}` and `WITH CHECK (true)`, so **the API route is the
only real gate**. Every existing registration route follows this same pattern — validate, then
write with the service-role client.

### Insert payload

```ts
{
  event_id:          eventId,
  profile_id:        user.id,
  institution_id:    event.institution_id,   // the EVENT's, not the registrant's — otherwise the
                                             // organizing college cannot read a cross-college
                                             // registration under events_reg_institution_read
  participant_type:  'internal',             // live vocabulary is internal | external
  participant_name:  profile.full_name || profile.email || 'Unnamed',  // column is NOT NULL,
                                                                        // profiles.full_name is not
  participant_email: profile.email,
  participant_phone: body.phone,
  department:        departmentName ?? null,      // see note below — the column is
                                                  // departments.department_name
  custom_fields:     body.custom_fields,     // custom_fields, NOT custom_data — custom_fields is
                                             // what EventRegistrationsService maps to labels
  status:            'registered',
  payment_status:    'not_required',
  source:            'event_self',           // parallel to the existing 'tournament_self'
  checked_in:        false,
  bib_number:        null,                   // globally UNIQUE — never set from this path
}
```

**Resolving `departmentName`.** `events_registrations.department` is `text`, but
`profiles.department_id` is a uuid. Step 3 resolves it with one extra read:

```ts
// The column is departments.department_name — NOT departments.name.
const { data: dept } = await svc
  .from('departments')
  .select('department_name')
  .eq('id', profile.department_id)
  .maybeSingle();
```

Selecting a column that does not exist returns PostgREST error 42703, which this codebase has
historically swallowed as a `console.warn` — producing a uniformly blank column rather than a
failure. Name the column exactly. A registrant with no `department_id` stores `null`; that is not
an error and must not block the registration.

`bib_number` deserves the comment. The column carries a **global** `UNIQUE` constraint while
`EventBulkRegisterService` assigns per-event `REG-0001`, `REG-0002`… (`event-bulk-register-service.ts:567`),
so the second event ever bulk-imported will collide. That is a pre-existing bug, out of scope here;
this flow avoids it by leaving the column null.

## Migration

```sql
CREATE UNIQUE INDEX CONCURRENTLY events_registrations_one_self_per_profile
  ON events_registrations (event_id, profile_id)
  WHERE profile_id IS NOT NULL
    AND source = 'event_self'
    AND status <> 'cancelled';
```

The predicate names the flow it guards. A blanket index on `(event_id, profile_id)` **would fail to
create and would break tournaments**: production holds three rows where one profile entered three
team names into the same volleyball tournament, which is legitimate — a tournament entrant may
field several teams across divisions. Tournament rows carry `source='tournament_self'` and are
untouched. Verified at design time: zero rows currently have `source='event_self'`, so the index
creates cleanly.

This yields a deliberate two-layer rule:

- The **API route** (step 4) rejects any non-cancelled row for that person regardless of source, so
  a bulk-imported registrant is also told "already registered".
- The **index** narrowly guards the double-submit race within this flow.

`status <> 'cancelled'` mirrors `EventRegistrationsService`, which already filters cancelled rows
out — so cancelling frees the slot to register again.

## Screens

### 1. Organizer detail — `/events/[id]`

Header (name, type badge, status, date, venue) · **Copy registration link** · `RegistrationFormCard`
· `EventLogistics`.

| State | Render |
|---|---|
| loading | skeleton — never `return null` (CLS lesson #2213, cited in `general-events-section.tsx`) |
| not found / no access | "Event not found, or you don't have access to it." |
| `event_type === 'sports_tournament'` | `redirect()` → `/events/tournament/[id]` — one canonical page per event |
| `!canManage` | read-only header; no logistics, no share link |

### 2. Builder — `/events/[id]/registration-form`

Thin shell around `RegistrationFormEditor`; breadcrumb `Events › <name> › Registration Form`;
`backHref` → `/events/[id]`. Non-managers `router.replace` to the detail page **only after access
finishes loading** — copying the fix already in the tournament builder page, which otherwise bounces
a real manager while `can()`/`isSuperAdmin` are still false.

### 3. Registrant form — `/events/[id]/register`

```
┌─ Registering as ──────────────┐   read-only, from profile
│ <full name>                   │
│ <email>                       │
│ <institution> · <department>  │
└───────────────────────────────┘
Phone *                             required, 10–15 digits
── <organizer's section title> ──
<DynamicFieldInput per field>
              [ Register ]
```

| State | Render |
|---|---|
| signed out | "Sign in with your JKKN account to register" + login link preserving the return URL |
| event draft / cancelled | "Registration is not available for this event." |
| before window | "Registration opens on \<date\>." |
| after window | "Registration has closed." |
| form disabled or zero custom fields | identity panel + phone only — still a valid registration |
| already registered | ✓ panel with their submitted answers, read-only. Uses the existing `events_reg_self_read` policy (`profile_id = auth.uid()`) — no new policy needed |
| submitting | button disabled + spinner; a double click cannot double-submit |
| success | ✓ confirmation, same panel as "already registered" |

## Error handling

The client validates for fast feedback; the API route re-validates and is the only authority. Each
failure maps to a specific message — no generic "something went wrong".

| Cause | Status | Shown to the registrant |
|---|---|---|
| signed out | 401 | sign-in prompt |
| event missing / draft / cancelled | 404 | not available |
| outside registration window | 422 | opens on … / has closed |
| required custom field empty | 422 | `"<Label>" is required` (verbatim from `validateCustomFields`) |
| phone malformed | 422 | field-level error |
| already registered | 409 | switch to the read-only panel |
| index race (two tabs) | 409 | caught as PG `23505`, same message |

## Testing

Mirrors the tournament work's pattern (43 tests / 4 files, commit `691e116f4`), Supabase client
mocked throughout.

**`__tests__/events/event-register-route.test.ts`** — the gate matrix:
- signed out → 401
- event draft → 404; cancelled → 404; missing → 404
- before window → 422; after window → 422
- missing required custom field → 422 with the field's label
- happy path inserts `participant_type='internal'`, `source='event_self'`, `custom_fields`
  (asserting **not** `custom_data`), and **no `bib_number`**
- `institution_id` is the event's, not the registrant's
- second submit → 409; PG `23505` → 409
- `participant_name` falls back to email when `full_name` is null (column is NOT NULL)

**`__tests__/events/event-register-page.test.tsx`** — every state in the table above renders its own
copy; submit disabled while pending; already-registered shows answers, not inputs.

**`__tests__/events/use-event-access.test.ts`** — each role in and out of the manage set; in-charge
matched by uid; a non-manager is not bounced while access is still loading.

**`__tests__/events/general-event-detail-page.test.tsx`** — a tournament-type event redirects; a
non-manager sees no share link and no logistics.

## Rollout for "JKKN School of Influencer"

1. Apply the migration.
2. Open `/events/84a49ec4-8fc8-44f9-a6a1-e84df5330f07`.
3. Build the form; Save.
4. Edit the event: set `registration_open_date` / `registration_close_date`, move `status` off
   `draft` (→ `planning`).
5. Copy the registration link and share it.
6. Watch responses in Event Logistics → Registrations.

## Follow-ups (not this spec)

- Student-facing event browse page (R1 deferred it).
- `bib_number` global-unique vs per-event `REG-####` collision in `EventBulkRegisterService`.
- `EventBulkRegisterService` hardcodes `participant_type='external'` and never sets `profile_id`,
  so bulk-imported JKKN people are mislabelled and unlinked from their profile.
- `events_reg_institution_read` lets any authenticated same-institution user read every
  registration row for that institution, including `custom_fields`. Worth a privacy review if
  organizers start asking sensitive questions.
