# Dynamic JABT Registry — Spec

**Date:** 2026-09-06 · **Status:** DRAFT — interview complete; ONE decision pending (D12, see below) · **Author:** Claude (pane "JABT"), rulings by the Director via tap-interview over Remote Control

**The ask (Director, 06:50 IST):** *"Can JABT be dynamic — one dedicated MyJKKN page defines JABT, and adding a new dimension or level there changes every other page in MyJKKN accordingly?"*

**Answer in one line:** Yes — the definition layer is ALREADY database rows with a page and an API; this spec makes the ~15 hardcoded consumers read those rows, and gives the page governed add/rename/retire with date-publish.

---

## 1 · Verified current state (all read live 2026-09-06 morning; production = jicate/main + prod DB)

### Definition layer (already dynamic)
- `bos_taxonomy` (institution-scoped: `institutions_id`, `code`, `name`, `is_hierarchical`, `is_system`, `is_active`, audit cols) + `bos_taxonomy_levels` (`taxonomy_id`, `code`, `name`, `description`, `verb_examples`, `sort_order`). Migration `20260508_create_bos_taxonomy_master.sql`. UI at `app/(routes)/bos/taxonomy/`, API at `app/api/bos/taxonomies/`.
- **Live JABT = 17 elements**, verified in prod: K1–K6 (13 institutions) · AF1–AF5 (10) · PS-a/b/c (13) · HD, L2L (9) · AIU (13). Names identical across all copies (`name_variants=1` for every code). The August "C + three bands" restructure **has been executed** — DB, documents (`artifacts/advanced-blooms-taxonomy.html` v2 21-Aug, teacher card v2) and code type (`types/obe.ts AdvancedDimension`) all agree.
- Lesson labels re-derived: `curriculum_lesson` non-K JABT labels are AF3 ×575 · HD ×343 · L2L ×331 (no stale A-codes).
- Governance (`bos_regulation_taxonomies.taxonomy_type`): 7 × `jkkn_advanced` (R-2026), 7 × `blooms`, 1 × `finks`.
- Both prod CHECK constraints (`obe_regulation_config_taxonomy_type_check`, `chk_curriculum_lesson_primary_taxonomy`) already allow `jkkn_advanced`. The repo's migration files are behind prod — **open PR #3097** is the repair; this spec builds on it, does not duplicate it.

### Consumption layer (static — the actual problem)
Verified by grep on `jicate/main`:
- **Type unions:** `types/obe.ts` (`TaxonomyType`, `BloomsLevel`, `FinksDimension`, `AdvancedDimension` + `ADVANCED_DIMENSION_LABELS`), `types/pde.ts` (a second, differently-spelled `FinksDimension`), `lib/services/onemark/paper-service.ts` (`JabtLevel`, `JABT_LEVELS`).
- **Literal K1–K6 iterators (non-test):** `app/(routes)/bos/taxonomy/new/page.tsx`, `app/(routes)/foundation/onemark/review/_lib/approve-rules.ts`, `app/api/foundation/onemark/draft/route.ts`, `lib/onemark/pdf/samples.ts`, `lib/services/curriculum/curriculum-service.ts`, `lib/services/onemark/draft-contract.ts`, `lib/services/onemark/paper-service.ts`, `lib/utils/bos/syllabus-xlsx.ts`, `types/bos.ts`, `types/ia-question-paper.ts` (+ 5 test files).
- **Fink-vocabulary UI:** `app/(routes)/pde/faculty/dashboard/_components/finks-radar.tsx`, `app/(routes)/vac/_components/finks-profile.tsx`.
- Consequence today: a level added on the definition page appears on the taxonomy pages only — not in OneMark papers, question banks, PDE scoring, SOP rendering, or curriculum readiness.

### Missing columns (drive the migration)
`bos_taxonomy_levels` has `sort_order` but **no weight column and no retire flag**.

### Adjacent PRs
- **#3099 MERGED** 2026-09-05 (UI renders JABT correctly — third framework taught to the UI).
- **#3097 OPEN** (repo-drift repair for the two CHECK constraints) — prerequisite context, no file overlap with this spec.
- **#3093 OPEN** (3 files: `types/obe.ts`, taxonomy-badge, regulation-config) — appears **superseded by merged #3099**; Director/maintainer to close or rebase. Not this spec's job; flagged for hygiene.

---

## 2 · Decisions of record (Director, tap-interview, 2026-09-06)

| # | Question | Decision |
|---|----------|----------|
| **D1** | Level renamed/added mid-semester — existing papers/marks? | **Old papers keep their version.** Every paper snapshots the taxonomy version current at its creation; new papers use the new version. |
| **D2** | Can a level be deleted? | **Retire only, never delete.** Retired levels vanish from new dropdowns, stay readable on all history. |
| **D3** | One definition or per-college? | **One shared list; colleges switch parts on/off.** Today's 13 per-institution copies converge to one master + per-college activation (the activation pattern already exists in the data: AF at 10, HD/L2L at 9). |
| **D4** | Who edits? | **Super admin + one named curriculum owner; every change logged** (who/what/when/why, visible on the page). *Open: the owner's name.* |
| **D5** | Order and weights on the page? | **Both.** Order exists (`sort_order`); weight is a new column so rules like "AIU = 2 of 25" live in data, not code. |
| **D6→D9** | PDE's Fink copy / scope of JABT | Director's ruling, verbatim: **"JABT REPLACES ALL TAXONOMIES AT JKKN."** Pinned in D9/D10. |
| **D7** | Edits live instantly? | **Date-publish.** Changes queue and take effect on a chosen date (e.g. term start). |
| **D8** | Rollout of consumers? | **One page at a time, behind a switch, OneMark first.** |
| **D9** | Replace-all mechanics | **Retire Bloom's and Fink's: anything NEW picks only JABT; old records written in Bloom's/Fink's stay readable forever. No data conversion.** |
| **D10** | PDE timing under replace-all | **Phase 2, after OneMark proves the registry.** PDE scoring is live; it moves as its own careful step. |
| **D11** | Sequence vs the August restructure | Moot — verified this morning the 17-code restructure **already ran in production**. "One wave" = this build. |
| **D12** | Freeze the 17 elements as final | ⏳ **PENDING.** Director is reading the Astra alignment study (`artifacts/jabt-astra-alignment-2026-09-06.html`) before the final word. Everything below is designed so the freeze slots in without rework. |
| **D13** | Astra-driven evidence rules | Recommended in the study, decided together with D12: ① L2L evidence demonstrated **live**, never document-only; ② **digital**-skill PS marked in-room, unaided (computer-use AI can now do the task); ③ CBT results (Foundation, OneMark) count **only from proctored sittings**. Plus: **AIU weight review = the page's first scheduled edit** (its 2/25 predates Astra). |

**Context for D12/D13:** GPT-6 Astra (OpenAI, released 3–4 Sep 2026) — computer use at superhuman speed, sustained multi-step autonomy, identity-faking. The study's finding: 11 of 17 JABT elements are observation-marked and immune; K1–K6 hold in supervised settings; L2L's paper evidence is the one casualty; AIU strengthens. Zero element changes required.

---

## 3 · Build shape

### 3.1 One additive migration (no destructive DDL anywhere)
1. `bos_taxonomy_levels`: `+ weight numeric NULL`, `+ retired_at timestamptz NULL`.
2. New table `bos_taxonomy_publications`: immutable published snapshots of a taxonomy's full element set — `id`, `taxonomy_code`, `version_no`, `snapshot jsonb`, `effective_date`, `published_by`, `note`, `created_at`. Implements **D1** (a paper stores the `publication_id` current at creation), **D7** (rows with future `effective_date` are queued), and **D4** (the audit trail is the publication history plus an edit log).
3. New table `bos_taxonomy_institution_activation` (`taxonomy_code`, `element_code`, `institutions_id`, `is_active`) — **D3**'s per-college switches, seeded from today's live 13-copy shape so nothing changes on day one. Convergence of the 13 copies to one master row set happens here with a data-preserving seed (current rows are the source of truth; nothing dropped).
4. RPC lockdown per the standing rule: every new function ships with `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`.
5. **Not in this wave:** replacing the two CHECK constraints with FKs to the registry (needs #3097 landed first + its own gated migration), and setting `is_active=false` on the `blooms`/`finks` `bos_taxonomy` rows (**D9**'s retire cutover — its own dated, gated step).

### 3.2 Server-side registry
`lib/services/taxonomy/registry.ts` — `getTaxonomy(framework, { at?: Date, institutionId? })` reads the published snapshot (D1/D7-aware), cached with `revalidateTag('taxonomy')` fired on publish. This is the single source every consumer imports.

### 3.3 Types become validated ids
`TaxonomyType` / `JabtLevel` / `AdvancedDimension` / both `FinksDimension`s stop being closed unions; consumers take `string` element codes validated against the registry. During rollout the current literals remain as the flag-off fallback, so an un-flipped consumer behaves byte-identically.

### 3.4 Consumers flip one at a time (D8)
Switch = a `platform_policies` config row (the repo's config-table pattern), not an env var — flippable without deploy. Order: **OneMark first** (`paper-service` → `draft-contract` → `approve-rules` → PDF samples → draft route), then BOS/curriculum (`curriculum-service`, `syllabus-xlsx`, `types/bos.ts` surfaces), then SOP render, then IA paper types. **Phase 2 (D10):** PDE (`types/pde.ts`, finks-radar, VAC profile) + the D9 retire cutover.

### 3.5 The definition page
Extend `app/(routes)/bos/taxonomy/` master UI: add / rename / retire element, reorder, weight, **date-publish with preview of queued changes**, publication history, edit log. Permission: new key `taxonomy.definition.manage` in `PERMISSION_CATEGORIES` granted to super admin + the named owner (D4) — catalog-sync gate applies.

### 3.6 Estimated blast radius
~15 non-test files + 1 additive migration + 1 new service + page extension. Each consumer flip is its own small PR behind the switch.

## 4 · Skill-gate answers (myjkkn-chain)
- **Q1 value-list:** yes — this whole spec IS the Q1 answer; the master table exists, consumers must honour it.
- **Q2 UI-twin:** run at build time before writing any settings-CRUD component under the taxonomy page (`find app -path '*settings*/_components/*'` for each planned filename).
- **Q3 CARRE lens:** the definition page is an admin/governance surface, not learner-facing — skip; the *consumers* already carry their own module audits.
- **persona-design:** light pass at build — editor personas are super admin + named owner only (D4); no new role needed.
- **smart-guide:** the page gets a guide fragment at build (admin lane); **carre-coverage:** skip (backend/governance surface).

## 5 · Open questions
1. **D12** — the freeze of the 17 (Director, after reading the Astra study).
2. **D4** — who is the named curriculum owner (a person, by name).
3. **AIU weight** — the page's first scheduled edit; value decided when the page exists.
4. **#3093** — close as superseded by #3099, or rebase (maintainer hygiene).
5. Retire-cutover date for Bloom's/Fink's under D9 (a `bos_taxonomy_publications` row with an `effective_date`, once the registry is live).

## 6 · Safety rails
- This PR is **spec-only**; no build starts until the Director says so (his explicit instruction: interview → spec → **STOP for my OK**).
- All migrations additive; nothing dropped, nothing converted (D9 explicitly preserves history).
- Every consumer flip reversible via the config switch, without deploy.
- Never merged by the agent; production DB untouched by this spec.
