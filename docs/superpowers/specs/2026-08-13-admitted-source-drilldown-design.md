# Admitted-by-Source Drill-down — Design

**Date:** 2026-08-13
**Status:** Approved for implementation
**Area:** `/admission/group-dashboard` (Leads model / admission analytics)

---

## 1. Problem

The Group Dashboard's top KPI strip shows **Admitted** (`lifecycle_status IN ('admitted','active')`).
Clicking it should answer: *which admitted learners are these, and which source did each come from?*

Today it cannot, for two reasons.

### 1.1 The two surfaces count from opposite ends

| Surface | Anchor table | AY 2026 Total Leads | AY 2026 Admitted |
| --- | --- | --- | --- |
| Top KPI strip (`fn_group_dashboard_overview`) | `learners_profiles` | 17,343 | **1,515** |
| Source Analytics tab (`fn_source_analytics`) | `admission_leads` | 17,343 | **551** |

`fn_source_analytics` starts at `admission_leads` and `LEFT JOIN`s the profile. A left join never
invents rows on the right, so every admitted learner with no lead row is silently dropped.

### 1.2 64% of admitted learners never were leads

| AY | Admitted | Has a lead (attributable) | Direct admit (no source) |
| --- | ---: | ---: | ---: |
| 2026 | 1,515 | 551 (36%) | **964 (64%)** |
| 2025 | 1,647 | 0 | 1,647 (100%) |
| 2024 | 834 | 0 | 834 (100%) |
| ≤2023 | 939 | 0 | 939 (100%) |

The leads pipeline only began feeding admissions in 2026. For 2025 and earlier an
"admitted by source" view is **structurally empty** — not a bug.

Profile-side fields cannot rescue the direct admits: of the 964, **960 have neither
`reference_type` nor `migration_source`**. The `reference_type` (218), `referral_type` (355)
and `referred_by_id` (292) values that do exist sit almost entirely on the 551 that
already have leads.

### 1.3 Where attributable admissions actually come from (all-time)

| Source | Leads | Admitted | Conversion |
| --- | ---: | ---: | ---: |
| `walk_in` | 1,258 | **314** | 25.0% |
| `referral` | 807 | **223** | 27.6% |
| `website` | 972 | 6 | 0.6% |
| `other` | 6 | 3 | 50.0% |
| `education_fair` | 15,453 | 2 | 0.01% |
| `inbound_call` | 3,119 | 2 | 0.06% |
| `newspaper` | 1 | 1 | 100% |
| `facebook_ads` | 495 | 0 | 0% |
| `whatsapp` | 33 | 0 | 0% |
| `youtube_ads` | 2 | 0 | 0% |
| `social_media` | 1 | 0 | 0% |

Two sources produce **97.5%** of all attributed admissions. `education_fair` is 89% of lead
volume and 0.4% of admissions — almost certainly a bulk-upload dump rather than a real channel.

---

## 2. The attribution rule

Defined once, in SQL, and shared by both surfaces:

```
admitted learner
  → admission_leads.learner_profile_id
  → admission_leads.source
no matching lead
  → source = NULL, rendered "Direct / No lead source"
```

**Anchored on `learners_profiles`, not `admission_leads`.** This is the load-bearing decision:
it makes the drill-down total *provably equal* the KPI total by construction, eliminating the
"clicked 1,515, saw 551" bug class rather than working around it.

- Cohort scope: `lp.admission_year_id → admission_years.year` — identical to the KPI.
- `LEFT JOIN` to `admission_leads` preserves the 964 unattributed rows.
- **Deterministic single lead per profile:** `DISTINCT ON (learner_profile_id) … ORDER BY created_at`.
  Today `multi_lead_profiles = 0` for every AY, so this changes no current number; it prevents a
  future duplicate lead from inflating the count. Nothing in the schema enforces uniqueness.

**Attribution model:** `admission_leads.source` (the scalar) only. The richer multi-touch
`admission_lead_source_captures` table (11,527 rows / 10,878 leads = 49% of leads) is
deliberately **out of scope** — it cannot replace the scalar at that coverage, and mixing the two
would make the drill-down totals stop tying to the Source Analytics tab. Revisit as a follow-up.

---

## 3. Database — new RPCs

Both follow the established pattern in this codebase: `SECURITY DEFINER` + explicit
`role_has_institution_access(id)` gate, `SET search_path = public`.

### 3.1 `fn_admitted_source_breakdown` — the paginated list

```sql
fn_admitted_source_breakdown(
  p_institution_ids uuid[],
  p_admission_year  integer,
  p_source          text DEFAULT NULL,   -- NULL = all; '__direct__' = no lead
  p_limit           integer DEFAULT 50,
  p_offset          integer DEFAULT 0
) RETURNS TABLE (
  learner_id       uuid,
  full_name        text,
  application_id   text,
  roll_number      text,
  institution_id   uuid,
  institution_name text,
  program_name     text,
  source           text,          -- NULL for direct admits
  referral_type    text,
  referred_by_name text,
  admitted_at      timestamptz,   -- best-effort, see §5
  created_at       timestamptz,
  total_count      bigint         -- COUNT(*) OVER (), for pagination
)
```

### 3.2 `fn_admitted_source_counts` — chips and donut

```sql
fn_admitted_source_counts(
  p_institution_ids uuid[],
  p_admission_year  integer
) RETURNS TABLE (source text, admits bigint)
```

Lightweight sibling so the filter chips and donut do not have to page the whole list.

### 3.3 Performance requirements

These are not optional polish — each corresponds to a failure mode this codebase has already hit.

- **`SECURITY DEFINER` + explicit institution filter.** A plain RLS-filtered scan of
  `learners_profiles` is exactly the shape that has produced `57014` statement timeouts here.
  The access check runs once against `institutions` (14 rows) and the result is then used as a
  join key, so the large table is never scanned under a per-row policy function.
  *Note:* `role_has_institution_access(i.id)` is row-dependent, so the `(SELECT fn())` InitPlan-
  hoisting trick does **not** apply to it. Confining it to the 14-row `institutions` table is
  what makes it cheap, not hoisting.
- **No `count: 'exact'`.** Pagination uses a window `COUNT(*) OVER ()` inside the RPC. A separate
  exact-count query is an unbounded RLS scan paid twice.

**Measured:** the full AY-2026 unfiltered query (1,515 learners, page of 50) runs in **61 ms**,
well inside the 2,000 ms `dashboard.drilldown.performance_budget_ms` policy.

---

## 4. Placement — a panel inside the Source Analytics tab

**Revised 2026-08-13** (initially built as a standalone page at
`/admission/group-dashboard/admitted-sources`; that page has been removed). The view lives as
`AdmittedSourcePanel`, rendered at the bottom of the Source Analytics tab, so both source
questions sit on one screen:

| Section of the tab | Anchor | Question answered | AY 2026 |
| --- | --- | --- | --- |
| Existing charts + matrix | `admission_leads` | What did the leads pipeline produce? | 551 |
| **Admitted by Source panel** | `learners_profiles` | Who got admitted, and where from? | **1,515** |

### 4.1 Routing

Reached by repointing the **existing policy row** — no hardcoded URL
(standing rule: policy decisions must be config rows):

```
dashboard.drilldown.admitted_active.destination
  '/learners/enquiries?tab=admitted'
  → '/admission/group-dashboard?tab=sources'
```

`appendDashboardScope()` appends `?admission_year=` and `?institution_ids=`. **The dashboard reads
its cohort from `?ay=`**, so `page.tsx` now accepts `admission_year` as an alias:
`searchParams.get('ay') ?? searchParams.get('admission_year')`. Without that alias the drill-down
would land on the tab with the year silently reset to the default cohort, showing a different
year than the card that was clicked.

The panel owns `?source=` and `?apage=`, namespaced so they cannot collide with the dashboard's
own `ay` / `tab` / `from` / `to`. Its `setParams` starts from the current query string, so the
dashboard's params survive a filter change and vice versa.

**Empty-lead cohorts must still render the panel.** The tab early-returns on
`rows.length === 0`, which is every AY before 2026. That early return now renders the panel
alongside the empty-state instead of replacing it — otherwise the 1,647 admitted learners of
AY 2025 would be invisible on the one tab that claims to explain where learners come from.

### 4.2 Layout

1. Header — total admitted + Export CSV.
2. Attribution coverage banner (attributed vs direct).
3. Source filter chips, each with its count. `Direct / No lead source` is pinned last and
   visually separated as the honest residual, not hidden — sorting by volume alone would put
   "no attribution" at the head of the list as if it were the top channel.
4. Donut — admitted by source, including the Direct slice.
5. Paginated table (25/page).

### 4.3 Columns

Name · Application no · Institution · Program · Source · Admitted on

Learner contact PII (phone, email) is deliberately excluded — this is a group-wide analytics
surface, and name + application number is sufficient to identify and act on a learner.

### 4.4 Export

Uses `downloadCsv` from `lib/utils/csv-export.ts`, which builds from explicit `headers: string[]`
plus `rows: unknown[][]` arrays rather than key lookup — structurally immune to the
label-vs-data-key mistake that has silently produced zero-column XLSX files elsewhere in this repo.

---

## 5. Known data-quality gap — "Admitted on"

**There is no reliable admission date in this database.**

| Candidate | Populated for AY 2026 admits | Range |
| --- | ---: | --- |
| `activated_at` | 463 / 1,515 (31%) | 22 Jul – 11 Aug 2026 only |
| `learners_profile_status_history` where `to_status='admitted'` | 206 / 1,515 (14%) | — |
| `learners_profiles.created_at` | 1,515 / 1,515 (100%) | 9 Mar – 12 Aug 2026 |

**Decision:** show `admitted_at = COALESCE(history.changed_at, activated_at)` and render `—`
for the ~65% with no record. Sort the table by `created_at DESC` so ordering is always stable.

A blank cell honestly says "we never recorded this". Substituting `created_at` would present a
profile-creation date as an admission date and nobody downstream would know.

**Flagged, not fixed.** Backfilling admission dates is separate work with its own risk. Note that
this same gap silently weakens the existing `last_enrolled_at` column on the Source Analytics tab.

---

## 6. Source Analytics tab — coverage line

Purely presentational; **no aggregation math changes**. The existing 551 is correct for
"what the leads pipeline produced" — it was merely unlabelled.

Under the three summary cards:

> ℹ️ Source data covers **551 of 1,515** admitted learners (36%). 964 were direct admissions
> with no lead record, so they have no source. **[See all admitted by source ↓]**

The link is now an in-page anchor to `#admitted-by-source` rather than a cross-page navigation,
since the panel lives further down the same tab.

The numerator comes from the rows already loaded; the denominator is passed down from the parent
page as a prop from `data.totals.total_admitted` — no second query.

**Also:** add the source-colour entries missing from `SOURCE_COLORS` in
`source-analytics-tab.tsx`. `inbound_call` (3,119 leads) and `whatsapp` (33) exist in the
database but fall through to grey, making two real channels render as "unknown".

---

## 7. Testing

### 7.1 Verified against the live database (2026-08-13)

Run by inlining the function body with the auth gate widened, isolating the new logic from the
access check (which is byte-identical to the proven `fn_source_analytics`).

| # | Assertion | Result |
| --- | --- | --- |
| 1 | Total for AY 2026 **equals** the `admitted_count` KPI. The invariant the design rests on. | ✅ 1,515 = 1,515 |
| 2 | Sum of per-source counts (including `__direct__`) equals the total. | ✅ 964+314+223+6+3+2+2+1 = 1,515 |
| 3 | `walk_in` filter | ✅ 314 |
| 4 | `referral` filter | ✅ 223 |
| 5 | `__direct__` filter | ✅ 964 |
| 6 | AY 2025 renders and is 100% direct — the structurally-empty case must not error. | ✅ 1,647 / 1,647 |
| 7 | `p_limit` honoured; no duplicate learner within a page (the `DISTINCT ON` guard). | ✅ 50 rows, 50 distinct |
| 8 | Latency inside the 2,000 ms drill-down budget. | ✅ 61 ms |

### 7.2 Verified by unit test

`__tests__/admission/admitted-source-drilldown.test.ts` — 13 tests, all passing. Covers the
label/colour vocabulary, the null-vs-sentinel equivalence, every database-present source having
an explicit colour, and the direct-bucket-pinned-last ordering (including the 100%-direct and
empty cohorts).

### 7.3 Outstanding — not yet verified

- **Per-identity institution scoping.** A principal scoped to one institution must see only their
  rows. This could not be run from the MCP SQL connection, which has no JWT (`auth.uid()` is NULL)
  and cannot hold the multi-statement transaction needed to impersonate. It must be checked in the
  running app as a principal, **one query per identity** — a multi-identity single-query harness
  gives false passes once predicates are hoisted.
- **Browser render.** The panel typechecks but has not been loaded in a browser.
- **Turbopack staleness caution.** Editing `dashboard-drilldown-keys.ts` did not invalidate the
  served dev chunks — the old destination stayed compiled into
  `.next/dev/server/chunks/ssr/lib_*.js` while the new one appeared only in the Turbopack cache.
  A destination change needs `rm -rf .next` plus a hard reload, and the client-side policy reader
  additionally memoises the *resolved* destination for 60s in a module-scope Map.
- **Export.** `CsvColumn` pairs a header with an accessor *function* rather than a string key, so
  the zero-column failure mode is structurally impossible; the download itself is unexercised.

---

## 8. Explicitly out of scope

- Multi-touch / first-touch attribution via `admission_lead_source_captures`.
- Backfilling `activated_at` or the status history.
- Changing the Source Analytics tab's aggregation math or chart contents.
- Adding a source facet to `/learners/enquiries`.
