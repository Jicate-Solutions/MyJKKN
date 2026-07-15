# Tournament: Single Registration Path + Dedicated Form Builder Page

- **Date:** 2026-07-15
- **Status:** Approved (design), pending implementation plan
- **Branch:** `feat/tournament-single-registration-path`
- **Area:** Events → Sports Tournament

## Problem

The tournament detail page (`app/(routes)/events/tournament/[id]/page.tsx`) currently exposes **two** ways to get participants into a tournament, which confuses organizers:

1. **"Registration Form" section** — actually a *builder* that configures custom questions; users mistake it for a place to register.
2. **"Add Entry" dialog** — an organizer tool that registers a participant/team *on behalf of* someone.

Separately, students self-register through the public link `/p/tournament/[id]/register`.

Two problems to fix:

- **We want a single registration path.** Only students self-register (public link). Admins must **not** be able to register anyone — not via UI and not via the server.
- **The "Registration Form" builder is broken and cramped.** Every keystroke fires a server mutation whose `onSuccess` invalidates and refetches the whole form, overwriting the input mid-typing (lost characters, cursor jumps, reverts, races). The two-pane builder is also squeezed into the detail page.

### Root cause of the builder bug

`registration-form-builder.tsx` binds each input's `value` to server state and calls `updateSection.mutate` / `updateField.mutate` on every `onChange`. Each mutation invalidates `['tournament-registration-form', eventId]` (`hooks/events/use-tournament-registration-form.ts:57,102`), refetching the form and clobbering the in-progress edit. The network round-trip races the keyboard.

## Decisions (from brainstorming)

1. **One registration path:** the public self-service form is the only way an entry is created.
2. **Admin cannot register — full lockdown:** remove the Add Entry UI **and** block the server create-entry path; remove the resulting dead code.
3. **Move the builder to its own page:** `/events/tournament/[id]/registration-form`, reached from a button on the detail page.
4. **Explicit Save:** the builder edits against local state (no per-keystroke writes) and persists everything with one **Save** via a bulk endpoint.
5. **Defaults for the two small open choices:** keep "Copy registration link" in the detail-page header (do not relocate); delete the now-dead tournament `learner-search` route.

## Scope

| Disposition | Item |
|---|---|
| Keep | Public self-service registration (`app/p/tournament/[id]/register/**`, `POST /api/events/tournament/[eventId]/public-register`) — the sole entry-creation path |
| Keep | Entry management on the detail page: list (`GET /entries`), mark paid + payment link (`[entryId]/pay`), withdraw/update (`[entryId]`) |
| Move + rebuild | Registration Form builder → dedicated page with local-state editing + explicit Save |
| Remove (UI) | "Add Entry" dialog and every trigger button |
| Block (server) | `POST /api/events/tournament/[eventId]/entries` (organizer create-entry) |
| Delete (dead) | `useRegisterEntry`, `TournamentRegistrationService.register`, `app/api/events/tournament/learner-search/route.ts` |

## Design

### 1. New builder page

**Route:** `app/(routes)/events/tournament/[id]/registration-form/page.tsx`

- Authenticated route (under `(routes)`), guarded by `useTournamentAccess(...).canManage`. Non-managers are redirected to the detail page (or shown an unauthorized state) — mirrors the old `if (!canManage) return null` gate, but page-level.
- Loads the current form **once** via `useRegistrationForm(eventId)` and seeds local React state. All editing (add/rename/reorder/delete sections & fields, toggle required, edit options/help text, toggle "Collect custom fields" = `is_enabled`) mutates **local state only** — zero network calls while editing.
- **Sticky action bar:** "Unsaved changes" indicator + **Save** (disabled when clean, spinner while saving) + **Back** to the detail page. Warn on navigate-away with unsaved changes.
- **Layout:** roomy full-width, two columns — editor (left) and **live student preview** (right) rendered with the existing `DynamicFieldInput` (identical to what students see). This replaces the cramped inline card.
- Reuses the field-editing primitives from the current `registration-form-builder.tsx` (FieldRow, section controls, `slugifyKey`, `FORM_FIELD_TYPES` minus `file`), refactored to call local-state setters instead of mutations.

### 2. Bulk save endpoint + data integrity

**New route:** `PUT /api/events/tournament/[eventId]/registration-form`

- Organizer-gated with `canManageTournament(auth, eventId)` (same helper the entries route uses); returns 403 otherwise.
- Body: the full form — `{ is_enabled, sections: [{ id?, title, display_order, fields: [{ id?, field_key, field_label, field_type, is_required, options, help_text, display_order }] }] }`.
- Persists **atomically**: upsert existing rows by `id`, insert new rows, delete rows absent from the payload — implemented as a `SECURITY DEFINER` RPC that self-authorizes (repo standard for multi-table transactional writes), so a partial failure cannot leave a half-saved form. (Alternative if an RPC proves heavy: sequential service-role ops in the route mirroring `entries/route.ts`; atomicity + `field_key` preservation are the hard requirements either way.)
- Lazy-creates the `event_registration_forms` row if missing (matching current `getFormWithFields` behavior).

**`field_key` stability (critical):** student answers persist in `custom_fields` keyed by `field_key`, not by field `id`.

- **New** fields derive a readable key from their label via `slugifyKey`, de-duplicated within the form (e.g. `t_shirt_size`, `t_shirt_size_2`) — replacing today's `field_${Date.now()}`.
- **Existing** fields keep their `field_key` even when the label changes, so previously submitted answers never orphan.

**New hook:** `useSaveRegistrationForm(eventId)` — one mutation calling the bulk endpoint; `onSuccess` invalidates `['tournament-registration-form', eventId]` and toasts success. The granular hooks (`useCreateFormField`, etc.) are no longer used by the UI and may be removed if nothing else references them (verify during planning).

### 3. Detail page changes (`app/(routes)/events/tournament/[id]/page.tsx`)

- **Replace** the inline `<RegistrationFormBuilder>` (line ~558) with a compact **Registration** card (shown only when `canManage`): one-line description + **"Manage registration form →"** button linking to `/events/tournament/[id]/registration-form`, plus a small summary (e.g. "3 fields across 2 sections" / "No custom fields yet") from `useRegistrationForm`.
- **Remove** Add Entry entirely: per-division "Add Entry" buttons (lines ~643–653), `<AddEntryDialog>` render (lines ~761–767), the import (line ~67), and the `dialogOpen` / `dialogDivision` state (lines ~312–313).
- **Keep** "Copy registration link" in the header (per decision default), and all division entry rows + mark-paid / withdraw / payment-link actions unchanged.

### 4. Server lockdown & dead-code removal

- `app/api/events/tournament/[eventId]/entries/route.ts`: **remove the `POST` handler** (POST now returns 405); **keep `GET`**. This is the real enforcement of "admin can't register."
- **Delete** `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx`.
- **Remove** `useRegisterEntry` from `hooks/events/use-tournament-registrations.ts` and `register` from `TournamentRegistrationService` (verified only Add Entry used them via `useRegisterEntry`).
- **Delete** `app/api/events/tournament/learner-search/route.ts` (only Add Entry called it). **Do not** touch `lib/utils/learner-search.ts` (shared util used across learners/campus-living).

## Non-goals / out of scope

- No change to the public self-registration UX or endpoint.
- No new permission key (reuses `sports.tournaments.manage` via `canManage` / `canManageTournament`).
- No `proxy.ts` change (the new page is authenticated).
- No change to fixtures, matches, payments, or eligibility logic.
- Historical entries created earlier via Add Entry are unaffected (they're normal `tournament_entries`).

## Verification plan

- Regenerate routes + gates: `npm run gen:routes`, `npm run check:reachability` (the `[id]` detail route is reachability-exempt; add the sub-page to the exemption list if the gate flags it — it's reached via button, not the sidebar).
- Type-check touched files via IDE diagnostics (not full `tsc`).
- Manual, as a manager role:
  1. Open a tournament → **Manage registration form** → add a section + fields → **Save** → reload: fields persist, typing never reverts.
  2. Open the public link → the custom fields render and submit; answers land in `custom_fields`.
  3. Detail page shows **no** "Add Entry" anywhere; entry list + mark-paid/withdraw still work.
  4. `POST /api/events/tournament/<id>/entries` returns 405.
- Confirm as a non-manager: the builder page redirects/blocks; no manage buttons appear.

## Affected files (summary)

- **New:** `app/(routes)/events/tournament/[id]/registration-form/page.tsx` (+ `_components/` for the rebuilt builder), `app/api/events/tournament/[eventId]/registration-form/route.ts`, bulk-save RPC migration, `useSaveRegistrationForm` hook.
- **Edit:** `app/(routes)/events/tournament/[id]/page.tsx`, `app/api/events/tournament/[eventId]/entries/route.ts`, `hooks/events/use-tournament-registrations.ts`, `lib/services/events/tournament/tournament-registration-service.ts`, `hooks/events/use-tournament-registration-form.ts` (add save hook; maybe prune granular ones).
- **Delete:** `app/(routes)/events/tournament/[id]/_components/add-entry-dialog.tsx`, `app/(routes)/events/tournament/[id]/_components/registration-form-builder.tsx` (moved), `app/api/events/tournament/learner-search/route.ts`.
