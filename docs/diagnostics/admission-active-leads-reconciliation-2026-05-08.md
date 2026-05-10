# Admission Dashboard — "Total Active Leads" vs Funnel-Stage Sum: 40-row Gap Reconciliation

- **Date:** 2026-05-08
- **Base commit (jicate/main):** `b563f405760cefcd1d10e7efad5c4546e23de12d`
- **Reporter:** Director (MD + CAIO)
- **Surface:** `app/(routes)/admission/dashboard/page.tsx` — `/admission/dashboard`
- **Status:** Diagnosed. Fix recommendation below — NOT implemented.

## Symptom

The "Total Active Leads" KPI card on `/admission/dashboard` shows a different number than the sum of the four (and other) stage-specific funnel cards visualized below it. Director observed `10,000` in the KPI card and `9,960` in the funnel sum — a 40-row gap. This erodes trust in every other metric on the page because the same data source is supposed to back both numbers.

## The Two Queries Side-by-Side

Both numbers come from the same hook chain — `useFunnelSummary(institutionId)` → `LeadService.getFunnelSummary()` (`lib/services/admission/lead-service.ts:917-992`). The bug is **not** that two different queries disagree — the queries are identical. The bug is that the **service emits a `total` and a `byStage` map computed from the same row set, but the UI only renders 21 of the 26 buckets in `byStage`**, causing the displayed sum to silently lose any row whose stage is one of the 5 hidden buckets.

### Query backing the "Total Active Leads" KPI card

```ts
// page.tsx:373 — KPICard value={funnel?.total || 0}
// lead-service.ts:917-986
let query = supabase.from('admission_leads')
  .select('stage, funnel_stage, is_hot_lead, is_priority');
if (institutionId) query = query.eq('institution_id', institutionId);
const { data } = await query;
return { total: data.length, byStage, ... };
```

Equivalent SQL:

```sql
SELECT COUNT(*) FROM admission_leads
WHERE institution_id = <selected_institution_or_no_filter>;
```

### Query backing the funnel-stage cards (sum of byStage values)

Same row fetch, but the per-stage counter has 26 enum keys initialized to 0:

```ts
// lead-service.ts:933-960 — service computes 26 buckets:
const byStage = {
  new, contacted, not_reachable, interested, follow_up_scheduled,
  engaged, qualified, application_started, application_submitted,
  documents_pending, documents_verified, interview_scheduled, interview_completed,
  offer_sent, offer_accepted, token_paid, applied, interviewed,
  offered, enrolled, confirmed, declined, withdrew, expired, lost, dormant
};
leads.forEach(lead => {
  const s = lead.stage || lead.funnel_stage;
  if (s && byStage[s] !== undefined) byStage[s]++;  // bucket if recognized
});
```

Then the page (`page.tsx:53-75`) iterates a hard-coded `FUNNEL_STAGES` array of **21** stages — missing `interview_scheduled`, `interview_completed`, `interviewed`, `lost`, `dormant`. Their counts are computed but never rendered.

Equivalent "what the user sees as the funnel sum" SQL:

```sql
SELECT COUNT(*) FROM admission_leads
WHERE institution_id = <…>
  AND COALESCE(stage::text, funnel_stage::text) IN (
    'new','contacted','not_reachable','interested','follow_up_scheduled',
    'engaged','qualified','application_started','application_submitted',
    'documents_pending','documents_verified','offer_sent','offer_accepted',
    'token_paid','applied','offered','enrolled','confirmed','declined',
    'withdrew','expired'
  );
```

## Per-Stage Breakdown (production, all institutions, 2026-05-08)

| `coalesce(stage, funnel_stage)` | Row count | In UI funnel? |
|---|---:|---|
| `new` | 15,425 | yes |
| `contacted` | 322 | yes |
| `application_started` | 219 | yes |
| **`lost`** | **40** | **no — silently hidden** |
| `not_reachable` | 3 | yes |
| **All other 21 enum values** | **0** | n/a |
| **TOTAL** | **16,009** | — |
| **Sum of UI-rendered stages** | **15,969** | — |
| **Gap** | **40** (= `lost`) | — |

Run via `mcp__supabase__execute_sql` against project `kvizhngldtiuufknvehv`. NULL or unmapped stages: 0 rows.

## Root Cause

The "Total Active Leads" KPI shows `funnel.total` (raw row count = 16,009), while the funnel visualization renders only 21 of the 26 stage buckets the service computes — so any row with stage `lost`, `dormant`, `interview_scheduled`, `interview_completed`, or `interviewed` is counted in the total but invisible in the per-stage cards. Today exactly 40 rows sit in `lost`; the gap will grow as more leads are marked lost or interviewed.

## Recommended Fix (do not implement here — diagnostic PR only)

This is a **TIER-0** fix (additive, single-file edit, no schema or data changes). Two complementary changes — pick one or do both:

1. **Make the displayed funnel exhaustive.** Add the five missing enum values (`interview_scheduled`, `interview_completed`, `interviewed`, `lost`, `dormant`) to the `FUNNEL_STAGES` array in `app/(routes)/admission/dashboard/page.tsx:53-75`. This restores conservation: every row counted in the total is visible in exactly one bar. Group the lifecycle-end stages (`lost`, `expired`, `withdrew`, `declined`, `dormant`) under a "Closed / Inactive" visual sub-section so the funnel still reads as an active pipeline. Cost: ~10 LOC, zero risk, immediate trust restoration.

2. **Redefine the KPI to mean what it says.** "Total **Active** Leads" implies the count should exclude lifecycle-terminal stages (`lost`, `expired`, `withdrew`, `declined`, `dormant` — and possibly `enrolled`/`confirmed` once converted). Compute and return a separate `activeTotal` from `getFunnelSummary` (`lib/services/admission/lead-service.ts:985-991`), e.g. `total - byStage.lost - byStage.expired - byStage.withdrew - byStage.declined - byStage.dormant`, and bind the KPI card to `funnel.activeTotal`. The displayed funnel can stay as-is. Cost: ~5 LOC service-side + 1 LOC UI binding. Definition needs Director sign-off (which stages count as "active"?).

The cleanest answer is **both**: option 2 makes the KPI semantically correct, and option 1 makes the funnel honest about every bucket the service knows about. Until either lands, the gap is real and will keep widening.

No data backfill needed. No migration needed. No DDL.
