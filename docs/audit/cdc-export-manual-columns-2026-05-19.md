# NAAC / AICTE export — manual-column sourcing audit (T2.4)

**Date:** 2026-05-19
**Author:** Director (autonomous agent)
**Branch:** `worktree-agent-af0c8fb85ba81fc98`
**Scope:** Investigate the 9 NAAC + 5 AICTE "manual" columns left NULL by [PR #1007 (A3.5)](https://github.com/Jicate-Solutions/MyJKKN/pull/1007). Recommend three paths; pick none.

> This is an **audit doc only**. No schema change. No RPC change. No policy change.

---

## 1. Background

PR #1007 extended `cdc_naac_5_2_1_row` to 21 columns and `cdc_aicte_annual_row` to 15 columns, but kept 9 NAAC + 5 AICTE columns as `NULL::<type>` because their sources were declared "not derivable from current schema." Director must therefore fill them manually before submitting the file to NAAC/AICTE.

This audit re-runs the question with the **actual** prod schema in hand: are those columns really not derivable today, or were the previous A3 / A3.5 authors conservative? And where they aren't derivable, what's the cheapest path to plug the gap?

---

## 2. Investigation method

All evidence is taken from production Supabase (`kvizhngldtiuufknvehv`) via Management API queries on 2026-05-19. Key probes:

- `information_schema.columns` for `admission_leads`, `learners_profiles`, `academic_years`, `admission_years`, `batches`, `community_categories`, `alumni_outcomes`, `ss_alumni_tracking`, `cdc_placements`, `cdc_placement_snapshots`.
- Row-coverage counts on `learners_profiles` for the candidate source fields.
- Sample values for `community`, `annual_income`, `admission_years.program_*_year`, `batches.*_date`.
- `pg_enum` for the `outcome_type` enum (alumni_outcomes).
- Current `platform_policies` rows for `cdc.naac_export_column_mapping` and `cdc.aicte_export_column_mapping`.

The 14 manual columns from the mission brief are the audit subject. Each is graded as:

- **DERIVABLE** — A schema source exists today; an RPC JOIN/COALESCE/CASE would fill it.
- **PARTIALLY DERIVABLE** — Schema source exists for some rows but coverage is patchy, OR data is in messy text form that needs cleanup logic.
- **NOT DERIVABLE** — No source column anywhere in the public schema; requires new capture (admission flow, alumni follow-up, or per-export Director entry).

---

## 3. Column-by-column matrix

### 3.1 NAAC 5.2.1 — 9 "manual" columns

| Column | Verdict | Schema source (if any) | Coverage | Notes |
|---|---|---|---|---|
| **category** | DERIVABLE | `learners_profiles.community_category_id` → `community_categories.code` (FK) **OR** `learners_profiles.community` (legacy text) | FK 95.4 % (5020/5262); text 95.5 % (5024/5262) | `community_categories` already has `oc`, `bc`, `bcm`, `mbc`, `sc`, `sca`, `st`, `dnc`, `dnt`, `bc_cc`, `not_applicable`. Policy label is `"Category (community)"`. Today's RPC returns `NULL::text` even though the FK is populated. |
| **parent_income_range** | PARTIALLY DERIVABLE | `learners_profiles.annual_income` (text — raw numeric like `"72000"`, `"80,000"`) | 72.7 % (3824/5262) | NAAC wants a **range** (e.g. `< 1L`, `1-3L`, `3-8L`, `>8L`). The raw field is messy: leading commas, blanks, and unit ambiguity. RPC could `CASE WHEN ::numeric < 100000 THEN '<1L' ...` but ~27 % of rows are blank/null. Bucket boundaries are a Director-decision (NAAC publishes ranges in the manual). |
| **district** | DERIVABLE | `learners_profiles.permanent_address_district` | 90.7 % (4771/5262) | Already present, just not joined in PR #1007. Policy currently labels this `source: "manual"` — drift between policy and reality. |
| **state** | DERIVABLE | `learners_profiles.permanent_address_state` | 90.5 % (4763/5262) | Same as district — schema source already exists; RPC just doesn't read it. Policy labels it `"manual"` — drift. |
| **year_of_admission** | DERIVABLE | `learners_profiles.admission_year_id` → `admission_years.program_start_year` (integer) | FK 59.1 % (3109/5262) | `admission_years` table has `program_start_year` and `program_end_year` as integers. Coverage is lower because older learner records pre-date the FK. Fallback: parse from `batches.start_date` year (65.9 % FK coverage). |
| **year_of_passing** | DERIVABLE | `learners_profiles.admission_year_id` → `admission_years.program_end_year` **OR** `learners_profiles.batch_id` → `batches.end_date` | FK 59.1 % via admission_years; 65.9 % via batches | Two independent paths. Either gives a year integer. Hybrid `COALESCE` reaches ~70 %. |
| **cgpa** | NOT DERIVABLE | None | 0 % | No CGPA / GPA column anywhere on `learners_profiles`, `obe_program_outcomes`, or any per-learner academic record. `medical_cutoff_marks` / `engineering_cutoff_marks` / `tenth_marks` / `twelfth_marks` exist but are pre-admission entrance scores, not exit CGPA. Requires either (a) new column on `learners_profiles` or (b) per-learner academic record table or (c) per-export Director entry. |
| **is_higher_studies** | DERIVABLE | `alumni_outcomes.outcome_type = 'higher_studies'` (joined on `learner_id`) | 0 % today (table empty) | The `alumni_outcomes` table **already exists** with full schema for higher-studies tracking (`institution_name`, `course_name`, `specialization`, `is_scholarship`, `scholarship_details`, `graduation_year`). The `outcome_type` enum already has `'higher_studies'`. The schema is plumbed; no rows have been captured yet. Once the alumni-outcome capture flow runs, the RPC can become a `LEFT JOIN alumni_outcomes ao ON ao.learner_id = lp.id AND ao.outcome_type = 'higher_studies'` and immediately surface boolean `(ao.id IS NOT NULL)`. |
| **higher_studies_institute** | DERIVABLE | `alumni_outcomes.institution_name` | 0 % today | Same as above — column exists on `alumni_outcomes`, just unused. |
| **higher_studies_program** | DERIVABLE | `alumni_outcomes.course_name` (+ optional `specialization`) | 0 % today | Same — column exists; RPC just doesn't join. Could COALESCE `course_name || ' - ' || specialization`. |

**NAAC summary:** of 9 "manual" columns — **7 derivable today** (3 immediately, 4 via existing tables that need population), **1 partially derivable** (parent_income_range, needs bucketing logic + coverage), **1 not derivable** (cgpa).

### 3.2 AICTE annual return — 5 "manual" columns

| Column | Verdict | Schema source (if any) | Coverage | Notes |
|---|---|---|---|---|
| **category** | DERIVABLE | Same as NAAC: `learners_profiles.community_category_id` → `community_categories.code` | 95.4 % FK | Identical situation to NAAC `category`. RPC returns NULL; source is present. |
| **social_category** | DERIVABLE | Same source. NAAC and AICTE differ only on label/grouping — AICTE wants `SC/ST/OBC/GEN`; `community_categories` rows map: `sc`→SC, `st`→ST, `bc`/`bcm`/`mbc`/`bc_cc`→OBC, `oc`→GEN, `not_applicable`→GEN. | 95.4 % | A small mapping CASE in the RPC closes this. |
| **year_of_admission** | DERIVABLE | Same as NAAC: `admission_years.program_start_year` | 59.1 % | Identical to NAAC counterpart. |
| **year_of_passing** | DERIVABLE | Same as NAAC: `admission_years.program_end_year` OR `batches.end_date` | 59.1 % / 65.9 % | Identical to NAAC counterpart. |

(Note: the brief lists 5 AICTE manual columns. The fifth — `branch` — is actually already derived in the RPC body via `JOIN departments d ON d.id = pg.department_id`, so it is **not currently NULL**. The policy still labels it `source: "manual"`, but this is policy-vs-reality drift, not a real gap. Same drift applies to AICTE `sector`. Confirmed by reading the migration body lines 162–171.)

**AICTE summary:** of 4 real "manual" columns — **all 4 derivable today** via the same JOINs used by NAAC.

---

## 4. Cross-cutting findings

1. **Most "manual" columns are not actually manual — they're un-joined.** 11 of the 14 columns have a schema source that the A3.5 RPC simply didn't reach. NAAC `district`, `state`, `category`, and AICTE `category`, `social_category` are all 90 %+ populated on `learners_profiles` today. PR #1007 chose conservative NULLs; with the schema in hand, ~80 % of "manual" columns can come from existing data.

2. **Policy drift.** The `platform_policies` JSONB labels some columns `source: "manual"` that the RPC *already* derives (AICTE `branch`, `sector`) and some columns `source: "schema"` that the RPC *doesn't* derive (NAAC `category`, `parent_income_range`). The export-UI consumer trusts the policy label, not the actual RPC behaviour. This is a separate cleanup task.

3. **Three columns are genuinely missing data — but only one is genuinely missing schema:**
   - `cgpa` (no column anywhere — needs new field or per-learner academic-record join)
   - `is_higher_studies` / `higher_studies_institute` / `higher_studies_program` (schema exists in `alumni_outcomes`, but **zero rows** — needs alumni-outcome capture flow to run)
   - `parent_income_range` bucketing (schema exists but in raw numeric text, ~27 % blank — needs cleanup + bucket boundaries)

4. **Coverage trade-off.** Year-of-admission and year-of-passing only reach 59–66 % coverage via the FK paths. For older alumni records, the FK is null and the data lives in legacy text fields (`academic_year` on `admission_leads`, `batch_year` on `batches`) or nowhere. NAAC/AICTE submissions are typically for the most recent graduating batch, where coverage is much higher — but the audit must flag this.

5. **`alumni_outcomes` is the load-bearing missing data, not missing columns.** The single biggest unlock is populating the existing `alumni_outcomes` table. Once it has rows, NAAC `is_higher_studies` + institute + program light up automatically, and the AICTE annual return gets cleaner `is_internal_placement` cross-checks.

---

## 5. Three paths (Director picks; this doc does not)

### Path A — Schema-first: extend `learners_profiles` and backfill from existing sources

**What:** Add 4 new columns to `learners_profiles`:
- `cgpa numeric` (no current source)
- `parent_income_band text` (computed from `annual_income` at migration time + future admission-flow capture)
- (Optionally) `is_higher_studies boolean` materialised from `alumni_outcomes`

Backfill `community_category_id` for the 4.6 % missing rows from the legacy `community` text via a fuzzy match against `community_categories.code`/`name`.

Then rewrite the RPCs to JOIN through these columns. Update the policy JSONB to mark every column `source: "schema"`.

**Effort:** ~1 migration (4 ADD COLUMN + backfill UPDATE + index), ~1 RPC rewrite (~60 lines), policy update.

**Completeness:** Highest. After backfill, NAAC + AICTE exports are 80–95 % auto-populated; Director hand-fills only `cgpa` and `parent_income_band` for older records.

**Fragility:**
- New columns create a write contract on the admission flow (someone has to set `cgpa` going forward — when? at exit? from `obe_*` tables? no current owner).
- `parent_income_band` requires fixed bucket boundaries; if NAAC changes them, migration is needed.
- Backfilling `community_category_id` from messy text (`"SC-A"`, `"SC (A)"`, blank) requires manual review of edge cases — false-mapping a protected-attribute is a real harm.
- Touches `learners_profiles` which is a load-bearing identity table — schema changes carry blast radius.

**Time to first export:** ~1 sprint (build + backfill + visual proof).

### Path B — Sidecar UI: per-export Director-fill page at `/cdc/exports/manual-entry`

**What:** Build a new admin route. Director picks an export (NAAC 5.2.1 or AICTE annual return). UI fetches the existing RPC, surfaces a row-by-row editor where missing cells are highlighted (red), Director fills `category`, `parent_income_range`, `district`, `state`, `year_of_admission`, `year_of_passing`, `cgpa`, `is_higher_studies`, `higher_studies_institute`, `higher_studies_program` inline. On submit, the edited values are written to a new `cdc_export_overrides` table keyed by `(learner_id, export_type, column_name, export_period)` — NOT to `learners_profiles`. Final XLSX downloads from the edited rowset.

**Effort:** ~1 new table (`cdc_export_overrides`), ~1 RPC wrapper that merges base RPC + overrides, ~1 page + 1 service + 1 hook. No `learners_profiles` change.

**Completeness:** Highest at export time — Director can fix anything inline. But the data isn't reusable: next year's export starts from the same NULLs.

**Fragility:**
- Per-export human entry is fragile when there are 1000+ rows (a graduating batch). Director-time-leak.
- Override data lives in a side table — drifts from `learners_profiles` over time.
- Hard to verify: no source-of-truth check that override values match reality.
- New UI surface to maintain.

**Time to first export:** ~2 sprints (full UI + persist + XLSX export integration). Or ~3 days for a "stage in browser, fill in spreadsheet, paste back" minimal version with no persistence.

### Path C — Hybrid: derive everything available from existing tables (no schema change); ship the rest as Director-fill

**What:** Patch the A3.5 RPC bodies to add the JOINs that already work:

- NAAC `category` ← `community_categories.name` via FK
- NAAC `district`, `state` ← `learners_profiles.permanent_address_*`
- NAAC + AICTE `year_of_admission` ← `admission_years.program_start_year`
- NAAC + AICTE `year_of_passing` ← `admission_years.program_end_year` (or batches.end_date COALESCE)
- AICTE `category`, `social_category` ← same FK + small mapping CASE
- NAAC `is_higher_studies` + institute + program ← `alumni_outcomes` LEFT JOIN (returns NULL today because table is empty; becomes useful as soon as alumni-outcome rows exist)

Update policy JSONB to flip those columns from `source: "manual"` to `source: "schema"` and fix the drift (AICTE `branch`, `sector` should already be `"schema"`).

The remaining genuinely-manual columns (`cgpa`, `parent_income_range` until bucketing is decided) stay NULL, and the export UI's existing column-picker lets Director either include them as blank columns to hand-fill in Excel or skip them entirely.

**Effort:** ~1 migration that replaces the two RPC bodies + 1 policy UPDATE. ~80 LOC total. No new table, no new UI, no new column.

**Completeness:** 11 of 14 columns auto-filled at 60–95 % coverage. 3 columns (`cgpa`, `parent_income_range`, plus higher-studies fields until `alumni_outcomes` is populated) remain Director-fill in Excel.

**Fragility:**
- Lowest. No schema mutation; reverts in 30 s by restoring previous RPC.
- Coverage gaps (year-of-admission at 59 % FK) are exposed in the export — Director sees blank cells for older records and fills manually.
- Doesn't solve `cgpa` or `parent_income_range` — those still need either Path A or off-spreadsheet hand-fill.
- Depends on alumni_outcome capture happening for higher-studies columns to populate.

**Time to first export:** Same day — migration + policy update + redeploy.

---

## 6. Trade-off summary

| Dimension | Path A (Schema) | Path B (Sidecar UI) | Path C (Hybrid JOINs) |
|---|---|---|---|
| **Effort** | 1 sprint | 2 sprints (or 3 days minimal) | < 1 day |
| **Schema blast radius** | Touches `learners_profiles` (high-risk) | New side table only | None |
| **Coverage at first export** | 90–95 % | 100 % (Director fills missing inline) | 60–80 % (Director fills missing in Excel) |
| **Reusable next year** | Yes — data persists in `learners_profiles` | Partial — overrides per export period | Yes — derivation logic compounds as `alumni_outcomes` fills |
| **Director-time per export** | Low (only fills `cgpa` + bucketing gaps) | High (per-row editing each time) | Medium (Excel hand-fill for gaps) |
| **Fragility** | Medium-high (new write contracts, protected-attribute backfill, bucket boundaries) | High (data lives in side table, drifts) | Low (one RPC + one policy update; trivially reversible) |
| **Unlocks future work** | Yes — `learners_profiles.cgpa` powers other modules | No — export-only | Yes — exposes `alumni_outcomes` as the next-best-investment |

---

## 7. Things this audit did NOT do

- Did not modify any schema, RPC, policy, or migration.
- Did not pick a path. Director chooses.
- Did not propose how to backfill `community_category_id` for the 4.6 % missing — fuzzy text-matching SC/ST community labels is a Director decision because mis-categorising a protected attribute is a real harm.
- Did not investigate `cdc_placement_snapshots` deeper — it's a write-only snapshot table that mirrors `cdc_placements` and would inherit any RPC fix; no separate sourcing needed.
- Did not investigate the export-UI consumer (`/cdc/exports/page.tsx`) — the policy-vs-RPC drift is a separate audit if Director wants to clean it up.

---

## 8. Recommended next steps (Director-decided, not picked here)

If Director picks **Path C**, follow-up work auto-falls out:
1. Quick RPC + policy migration (this sprint).
2. Plan an `alumni_outcomes` capture flow (next sprint) — once that table fills, NAAC higher-studies columns auto-light-up.
3. Then revisit `cgpa` and `parent_income_range` separately as Path A scoped to just those two fields.

If Director picks **Path A**, sequencing question is *who owns writing `cgpa`* — admission flow, exam cell, or alumni follow-up.

If Director picks **Path B**, the existing column-picker UI at `/cdc/exports` can be extended into the editor — no new route needed.

---

*End of audit. PR body summarises the three paths inline.*
