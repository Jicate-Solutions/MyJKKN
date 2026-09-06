# AI Committee Assistant — taking the desk work out of committee sittings

**Date:** 2026-07-26 · **Status:** built, DARK, not applied · **Branch:** `feat/iqac-committee-ai-assistant`

## The gap, with its numbers

The IQAC meeting engine has been live since 10 July (PRs #1940 / #1943 / #1942). It already
pre-fills minutes in Action-Taken-Report format from the decisions a convener enters, and a nightly
rollup turns minuted sittings into NAAC 7.3 evidence. What it does **not** do is take the desk work
off the convener: the agenda is typed by hand, the sitting is scheduled from memory, and the minutes
prose is written from scratch.

The `ai_job_types` row `accreditation.cac_brief` (#2402) was meant to cover the drafting half. It is
applied on prod and `enabled=false`. But:

```
$ git grep cac_brief jicate/main
supabase/SQL_FILE_INDEX.md
supabase/migrations/20260726005145_cac_premeeting_brief_job.sql
supabase/migrations/20260803030000_prompt_graduation_mechanism.sql   (a comment)
```

No cron. No enqueue. No storage table. **The row is inert even if the Director flips it on.** The
work is the producer and the store, not another row.

Fuel on prod at build time: 1 committee, 2 meetings, 0 minuted, 0 resolutions, 1 member.

## What was built

| Scope | Built as | Human gate |
|---|---|---|
| (a) agenda drafting | ONE job type (`cac_brief`) parameterised by committee kind, so the same row serves a cluster council and a college IQAC | convener okays the papers |
| (b) meeting setup | a proposal row: date from `cadence_days`, attendees from active membership | convener presses **Confirm**; only then does a sitting exist |
| (c) minutes prose | new DARK job type `accreditation.meeting_minutes_polish` | offered as accept/reject beside the structural prefill |
| (d) doctrine | `agenda-doctrine-gate.ts` + a DB refusal | unbypassable, not a prompt hope |

## Three deliberate design calls

**1. The sitting date and attendee list are computed, not generated.** A date and an attendee are
exactly the facts a model must never invent, and a grounding validator cannot check a date that has
no source row. So `fn_accreditation_meeting_proposal_awaiting` derives the date from
`accreditation.meeting.cadence_days` and the attendees from `accreditation_committee_members`. The AI
still writes the papers; the calendar arithmetic is arithmetic. This removes a whole class of
fabrication rather than gating it.

**2. Omission, not fabrication, is the minutes failure mode.** `grounding-validator.ts` catches
tokens the model **added**. It is structurally blind to a resolution the polish silently **dropped** —
and a dropped decision would still become NAAC 7.3.e evidence through the nightly rollup. So
`findOmittedResolutions()` checks every recorded resolution is traceable in the prose, and a draft
with a non-empty `omitted_resolution_ids` cannot be okayed.

**3. `closeMeeting` stays the sole writer of `minutes_summary`.** The polished prose lives in the
draft table and is offered as "Use this text", which only fills the textarea the convener already
confirms. Two writers on one column would race the AI against the human.

## Scope (b) safety — verified, not assumed

Creating an accreditation committee meeting today notifies nobody. Three independent receipts:

1. `pg_trigger` across all four committee tables returns ONLY `set_updated_at BEFORE UPDATE`. There
   is no INSERT trigger at all.
2. The committee services and hooks contain zero notification write paths.
3. Only two files in `jicate/main` reference `accreditation_committee_meetings` — the service and the
   read-only Control Tower.

So the requirement is **containment**, not suppression: the proposal must never reach the *other*
engine. `meeting_bookings` + `meeting-webhook-dispatcher` + `calendar-sync-service` DO invite real
people, and `meeting_agendas` is FK'd to `meeting_bookings` — so borrowing that table to host a
committee agenda would have turned a draft into a real invitation.
`fn_accreditation_meeting_proposal_confirm` writes `accreditation_committee_meetings` and nothing
else. The prod validation asserts `meeting_bookings` is unchanged (25 → 25) across a confirm.

## Doctrine (d) as three layers of one rule

> A number readable from the platform is FORBIDDEN on a meeting agenda.

1. **The prompt** states it absolutely (`buildAgendaPrompt`).
2. **The gate** (`checkAgendaDoctrine`) scans the agenda section deterministically — counts, scores,
   percentages, ratios, metric codes are hits; the agenda's own numbering, dates, calendar years and
   sitting references ("meeting #4") are not. It reads the **agenda section only**: the brief is where
   figures belong, and `splitBriefOutput` routes pre-heading text to the brief so a mislabelled draft
   is never refused for figures that were meant to be in the brief.
3. **The database** refuses the transition when `forbidden_number_hits` is non-empty.

## Honest limitations

- **No attendance substrate.** `accreditation_committee_meetings` has no attendees column and there
  is no attendance table. The proposed attendee list is advisory only, and both prompts explicitly
  forbid stating who attended — an attendance sentence would be fabricated by construction.
- **Fuel starvation.** With 0 resolutions on prod, every drafter will honestly emit "Nothing to
  report". The prod validation proves the plumbing and the gates; prose quality was judged on a
  seeded BEGIN..ROLLBACK rehearsal, not on live data.
- **No new permission keys.** `accreditation.naac.committees.meetings.manage` already exists and is
  exactly the right gate, so an existing convener role works with no role edit and the
  permissions-audit coverage chain is untouched.

## Go-live (Director)

1. Apply `supabase/migrations/20260726181500_accreditation_committee_ai_assistant.sql`.
2. `UPDATE ai_job_types SET enabled = true WHERE job_type IN ('accreditation.cac_brief','accreditation.meeting_minutes_polish');`
3. Optionally flip `accreditation.meeting.proposal_enabled` to `true` for sitting proposals.

Each step is independent, reversible by the inverse UPDATE, and needs no deploy.
