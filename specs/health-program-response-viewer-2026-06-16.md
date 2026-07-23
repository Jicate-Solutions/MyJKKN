# Health → Wellness Programs: Admin Response-Viewer

**Date:** 2026-06-16
**Status:** Build
**Module:** Health → Wellness Programs (`/health`)
**Depends on:** `specs/health-programs-forms-and-video-2026-06-16.md` (form builder, shipped — PRs #1452/#1453)

## Problem

The Google-Forms-style form builder (PR #1453) saves every participant's per-field
answers into `health_program_participation.form_responses` (JSONB,
`{ [field_id]: optionId | optionId[] | text | number }`). The graded percent goes
to `quiz_score` and drives the impact dashboard — but the **raw survey answers
themselves have no admin UI**. A program manager cannot read what people actually
answered (open text, scale ratings, ungraded choices). The form builder's
"Out of scope (v1)" list explicitly deferred this viewer; this spec closes it.

## Goal

A read-only admin view — a sibling of the existing `impact/` view at
`/health/admin/programs/[id]/responses` — that lets a manager read the saved
answers, with each answer **labeled by its question** and choice **option IDs
resolved to option text**. Google-Forms-style: a **Summary** tab (per-question
tallies + free-text lists) and an **Individual** tab (one participant's full
submission at a time).

## Non-goals (this PR)

- No new DB column, table, RPC, or migration — the data already exists, RLS
  already lets managers read all participation rows (`hpp_select`).
- No editing/deletion of responses. Pure read.
- No CSV/Excel export (candidate for a follow-up).
- No change to `quiz_score` or `fn_health_program_impact` — untouched.
- The date field + per-question description (P1 next) and grid/branching (P2) are
  separate specs/PRs.

## Data model (already live — reused, not changed)

- `health_program_days.quiz` — the per-day `FormSpec` (or legacy
  `{questions:[]}`, normalized at read time by `normalizeForm`).
- `health_program_participation` — one row per (day_id, user_id). Reads:
  `id, user_id, day_id, quiz_score, form_responses, created_at, updated_at`,
  with `profiles:user_id(full_name, email, role)` embedded (FK verified, left
  embed so a hidden profile never drops the row).
- RLS `hpp_select`: `user_id = auth.uid() OR user_has_permission('health.programs.manage')`
  → managers read all rows; a non-manager session reads only their own (so the
  page is self-gated by the data layer in addition to the `PermissionGuard`).

## Architecture (find-the-pattern-extend — mirrors `impact/`)

1. **`lib/health/forms.ts`** (shared form logic — extend, don't fork):
   - `resolveResponses(form, responses): ResolvedAnswer[]` — per-participant.
     For each field in `form.fields` (preserves question order): look up the
     answer by `field.id`; choice types → map option IDs to option text;
     `multi_choice` → list of texts; `scale` → the number; text types → the
     string. Marks `correct` for graded choice fields using the same rule as
     `scoreForm`. Appends any answer whose field no longer exists as an
     `orphan` row ("question removed") so nothing is silently hidden.
   - `summarizeResponses(form, list): FieldSummary[]` — per-question aggregate
     across all participants. Choice/scale → counts per option/value (option
     order preserved, correct option flagged); text → the list of free answers;
     scale → numeric average.
2. **`lib/services/health/wellness-programs-service.ts`**:
   - `getProgramResponseData(programId): { program, days, responses }` — one
     bundle: the program (for the title), its days (each with `quiz`), and all
     participation rows that have a non-null `form_responses`, profile embedded,
     newest first.
3. **`hooks/health/use-wellness-programs.ts`**:
   - `useProgramResponses(programId)` + query key `wellness-responses`.
4. **`app/(routes)/health/admin/programs/[id]/responses/page.tsx`** — thin server
   component, identical shell to `impact/page.tsx`: `ContentLayout` +
   `PageBreadcrumb` + `PermissionGuard module="health" action="programs.manage"`
   with `NoProgramsAccess` fallback, wrapping the client viewer.
5. **`app/(routes)/health/admin/programs/[id]/responses/_components/responses-viewer.tsx`**
   — `'use client'`. Loading skeleton, permission/error alert, and a true
   empty-state ("no answers yet"). Groups responses by day; for each day,
   `normalizeForm(day.quiz)` then renders the **Summary** and **Individual** tabs.
6. **Reachability:** a "Responses" button next to the existing "View impact" in
   `program-editor.tsx`, and a "Responses" link next to "Impact" in
   `program-list.tsx`.

## Key decisions

- **`day.quiz` is always run through `normalizeForm` before resolving** — MindSmile
  Day 1 is a legacy 8-question quiz and only becomes a `FormSpec` at read time.
- **Resolution lives in `forms.ts`**, next to `normalizeForm`/`scoreForm`, so the
  viewer cannot drift from how answers are stored and scored.
- **Left embed on `profiles`** — if a manager's profile RLS hides a participant,
  the row still shows (labeled by a short ID fallback), never dropped.
- **Read-only, additive, no migration** — zero risk to existing metrics.

## Verify by

The viewer renders a real participant's saved answers from `form_responses`, each
labeled by field with choice option IDs resolved to option text, in both Summary
and Individual tabs — captured in a committed `.screenshots/` PNG and confirmed
live on www.jkkn.ai after deploy. (For the screenshot, one temporary submission is
seeded against MindSmile's real Day-1 field IDs with `quiz_score` left null — so
impact is untouched — then deleted after capture.)
