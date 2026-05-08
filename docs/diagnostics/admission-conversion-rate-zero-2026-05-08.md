# Admission Dashboard — Conversion Rate KPI showing 0% across all institutions

**Date:** 2026-05-08
**Reporter:** Director (MD + CAIO) — non-coder, flagged via daily review
**Severity:** Diagnostic / observability gap (no data corruption, no user-facing crash)
**Surface:** `/admission/dashboard` → "Conversion Rate" KPI card

## Symptom

The Conversion Rate KPI card on `/admission/dashboard` displays **0%** for every institution and for the all-institutions roll-up, despite ~16,000 active leads in flight. Director flagged this as suspicious because the institutions are clearly operating (calls happening, applications being filled) yet the headline KPI implies zero enrollment activity.

## Formula source

**File:** `lib/services/admission/lead-service.ts`
**Function:** `LeadService.getDashboardSummary(institutionId?: string)` — line 999
**Hook:** `hooks/admission/index.ts::useDashboardSummary` — line 949
**Consumer:** `app/(routes)/admission/dashboard/page.tsx` — line 393

The relevant implementation (lead-service.ts:1018-1041):

```ts
const totalLeads = allLeads.length;
const convertedLeads = allLeads.filter((l: any) => {
  const s = l.stage || l.funnel_stage;
  return s === 'enrolled';
}).length;

const conversionRate = totalLeads > 0
  ? (convertedLeads / totalLeads) * 100
  : 0;
```

So:

- **Numerator** = `COUNT(*) WHERE COALESCE(stage, funnel_stage) = 'enrolled'`
- **Denominator** = `COUNT(*)` (with optional `institution_id` filter)
- **Formula** = `numerator / denominator * 100`, rounded to 1 decimal

## Manual SQL verification (production, 2026-05-08)

### Numerator + denominator (whole platform)

```sql
SELECT
  COUNT(*) FILTER (WHERE COALESCE(stage::text, funnel_stage::text) = 'enrolled') AS numerator_enrolled,
  COUNT(*) AS denominator_total,
  ROUND((COUNT(*) FILTER (WHERE COALESCE(stage::text, funnel_stage::text) = 'enrolled')::numeric
        / NULLIF(COUNT(*),0)) * 100, 2) AS conversion_rate_pct
FROM admission_leads;
```

| numerator_enrolled | denominator_total | conversion_rate_pct |
|---|---|---|
| **0** | 16,009 | 0.00 |

The dashboard is reporting the formula correctly. The numerator is genuinely zero.

### Stage distribution — where are leads actually sitting?

```sql
SELECT COALESCE(stage::text, funnel_stage::text, 'NULL') AS effective_stage,
       COUNT(*) AS lead_count
FROM admission_leads GROUP BY 1 ORDER BY 2 DESC;
```

| effective_stage | lead_count |
|---|---|
| `new` | 15,425 |
| `contacted` | 322 |
| `application_started` | 219 |
| `lost` | 40 |
| `not_reachable` | 3 |
| **enrolled** | **0** |
| **offer_accepted** | **0** |
| **token_paid** | **0** |
| **offer_sent** | **0** |
| **documents_pending / documents_verified** | **0** |
| **application_submitted** | **0** |
| **interested / engaged / qualified** | **0** |

### Stage history — has anyone EVER been moved to `enrolled`?

```sql
SELECT to_stage, COUNT(*) AS transition_count
FROM admission_lead_stage_history
GROUP BY to_stage ORDER BY transition_count DESC;
```

| to_stage | transition_count |
|---|---|
| `new` | 680 |
| `application_started` | 438 |
| `contacted` | 336 |
| `lost` | 80 |
| `not_reachable` | 10 |
| `follow_up_scheduled` | 2 |
| `interested` | 2 |
| **enrolled** | **0** |

Across the entire history of the table, **no lead has ever transitioned to `enrolled`** (or to any stage between `application_started` and `enrolled` — i.e. `application_submitted`, `documents_pending`, `documents_verified`, `offer_sent`, `offer_accepted`, `token_paid`).

### Per-institution view (top 5)

| institution_id | total_leads | enrolled | new |
|---|---|---|---|
| `5de4fba1…` | 6,682 | 0 | 6,616 |
| `479eac7f…` | 2,837 | 0 | 2,815 |
| `5736d86f…` | 1,737 | 0 | 1,367 |
| `70e54e51…` | 1,125 | 0 | 1,072 |
| `9c1554e8…` | 1,036 | 0 | 1,025 |

Same picture at every institution: ~96-99% stuck at `new`, a handful at `contacted` / `application_started`, **zero** ever advanced to enrollment.

## Root cause

**The formula is correct; the funnel is not being progressed.** Counsellors / staff are not advancing leads past `application_started` in the application — either because:

1. **Operational behaviour gap** — staff are doing the enrollment work outside MyJKKN (paper forms, separate ERP, WhatsApp confirmations) and never come back to flip the lead's `stage` to `enrolled`. The lead lifecycle in MyJKKN ends at `application_started` in practice.
2. **UX/permission gap** — the UI to advance a lead to `application_submitted` → `offer_sent` → `enrolled` either doesn't exist for the staff who should be doing it, isn't surfaced where they work, or is gated behind a role they don't have.
3. **Schema/intent mismatch** — the team uses a different signal (e.g., a row in `case_track_enrollments` or `pde_quest_enrollments`, or an external admission ERP webhook) to mark "enrolled," and the `admission_leads.stage` column was never wired to mirror that signal.

This is a TIER-1 issue (data semantics / operational workflow), **not** TIER-0 (a query bug). Changing the numerator to count `application_started` would make the KPI tick up to ~1.4% but would mislabel "started filling the form" as "enrolled" — wrong.

## Recommended fix

**Two-track recommendation. Director's call which to ship first.**

**Track A — Define and operationalize "converted" honestly (TIER-1 — data-touching, requires stakeholder decision).** Hold a 30-min working session with the admission team to answer: *"Where, in MyJKKN's data model, does an enrollment get recorded today?"* Three plausible answers, each with a different fix shape:

- *Answer is "nowhere — we do it offline."* → The fix is operational, not technical. Either (a) train staff to flip stages, (b) build a one-click "Mark Enrolled" CTA on the lead detail page that sets `stage='enrolled'` and writes to `admission_lead_stage_history`, or (c) wire a webhook from whichever external ERP carries the actual admission record.
- *Answer is "in `case_track_enrollments` (or another sibling table)."* → Update `getDashboardSummary` to JOIN that table on `lead_id` and count distinct enrolled lead IDs, rather than reading `admission_leads.stage`.
- *Answer is "in a status field on the application form, not on the lead."* → Update the formula to read that field, and add a backfill migration so historical applications carry the right status.

**Track B — Make the KPI honest in the meantime (TIER-0 — pure query change, ships in 1 PR).** Until Track A lands, the "Conversion Rate" card should either be hidden, replaced with a more meaningful operational signal that the data actually supports today (e.g., "Application Start Rate = `application_started` / `total`" which is currently ~1.4% — a real number that reflects current operational reality), or annotated with "Awaiting enrolment data wire-up — see #<this-PR>" so the Director isn't misled into thinking the funnel is broken when really the instrumentation is incomplete.

**Strong recommendation: do Track A.** Track B alone hides the problem; Track A makes the dashboard tell the truth and surfaces the real operational gap (staff aren't closing the loop) which is itself the more valuable insight for an MD-level dashboard.

## Tier classification

**TIER-1.** The fix is not a one-line query edit — it requires (a) a product/operational decision about where "enrolled" is recorded, (b) likely a stage-rename or backfill migration once that decision is made, and (c) potentially a UI change to give staff a way to flip the stage. None of those are destructive, but all touch live data semantics and need Director sign-off before implementation.

## Files referenced

- `app/(routes)/admission/dashboard/page.tsx:392-397` — KPI card
- `hooks/admission/index.ts:949-968` — `useDashboardSummary` hook
- `lib/services/admission/lead-service.ts:999-1051` — `getDashboardSummary` formula
- `admission_leads` (table) — source data
- `admission_lead_stage_history` (table) — transition log
