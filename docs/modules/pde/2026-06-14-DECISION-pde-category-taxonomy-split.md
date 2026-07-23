# DECISION REQUIRED — PDE Category Taxonomy Split

| | |
|---|---|
| **Date** | 2026-06-14 |
| **Module** | PDE (Personal Demonstration of Excellence) |
| **Status** | 🟡 **DECISION REQUIRED** — Director sign-off needed; not auto-fixed by design |
| **Decision owner** | Director (Omm) |
| **Author** | Mac Claude (session 2026-06-14) |
| **Source friction** | `docs/modules/pde/2026-06-14-UX-UI-FRICTION-pde-smart-guide.md` row **X1** (rated "high") |
| **Type** | Architecture / data-model decision — **no code change made**; this doc presents options |

---

## The decision in one sentence

PDE has **two unrelated category vocabularies plus one unbuilt stub**, and you must decide whether to **(A)** collapse to a single taxonomy, **(B)** keep both as two explicitly-labelled orthogonal axes, or **(C)** leave it as-is — **and now is the cheapest possible moment to decide, because there is no production data to migrate.**

---

## Why this is on your desk *now* (the window)

The friction report rated this **"high severity"** and described it as "confuses any learner↔faculty pair." That framing is **forward-looking, not current.** Ground-truth from production today:

| Table | Rows in prod | Meaning |
|---|---|---|
| `pde_demonstrations` (learner submissions) | **0** | No learner has ever submitted a demonstration |
| `pde_submissions` (assessment-scoped) | **0** | Empty |
| `pde_capabilities` (skill tree) | **1** | One seed row, mis-categorised (see below) |

**No user is hitting this split yet.** It is a *latent* inconsistency. That makes this the ideal — and cheapest — moment to resolve it: there is **zero data to migrate** and **no live workflow to disrupt**. Every demonstration learners submit *after* a decision will be clean; every one submitted *before* would have to be back-filled. The cost of acting rises the day learners start using the module.

---

## What's actually in the code (verified facts)

There are **three** category vocabularies in the PDE codebase, and they barely overlap. (The friction doc named two; it under-counted.)

### Taxonomy A — Durable-value categories (7) — *the live spine*
`judgment · embodied · problem_finding · accountability · social_leadership · cultural_civic · credential`

- **Defined:** `lib/types/pde-demonstrations.ts` → `PDECategoryKey`
- **Stored:** real DB column `pde_demonstrations.category_key` (text)
- **Used by:** learner submission form (`/pde/learn/demonstrations/new`), admin **compliance** (`/pde/admin/compliance/*`), cohort heatmap, and the **rubric editors** (e.g. `pde/admin/rubrics/social-leadership` — header comment: *"the durable-value category"*, edits `pde.rubrics.*` platform_policies).
- This is the **real PDE assessment spine** — the philosophy core (the enduring human qualities PDE measures).

### Taxonomy C — Capability categories (8) — *a separate skill tree*
`ai_fluency · domain_ai · cross_functional · production · human_presence · principal · technical · professional`

- **Defined:** `types/pde.ts:346` → `CapabilityCategory`
- **Stored:** real DB column `pde_capabilities.category` (text)
- **Used by:** admin **capabilities** page (`/pde/admin/capabilities`) + `useCapabilities()` hook.
- **This is a different *axis*, not a rival label set.** `PDECapability` carries `level` (1-5), `prerequisite_ids`, `lesson_ids`, `estimated_hours`, `finks_dimension`, versioning, and per-learner mastery status (`PDELearnerCapability`: locked → available → in_progress → demonstrated → mastered). It is a **skill-progression curriculum tree**. Its `category` groups skills by *area*; it answers "which skill area / tree node," whereas durable-value answers "which enduring human quality does this evidence show."

### Taxonomy B — Faculty "demonstrations" filter (3 chips) — *an unbuilt stub*
`technical · analytical · creative`

- **Defined:** hardcoded in `app/(routes)/pde/faculty/demonstrations/page.tsx` (lines 138–140).
- **The page is a non-functional shell.** Verbatim from the file:
  - line 32: `// Mock pending demonstrations type (until backend endpoint available)`
  - the list is hardcoded empty: `const demonstrations: PendingDemonstration[] = [];`
  - `capability_category` is a field on the **mock** `PendingDemonstration` interface — **there is no such DB column.**
  - the 3 filter chips are a hardcoded subset of taxonomy C — and **two of them (`analytical`, `creative`) don't exist in C's 8 values at all.** They were guessed.
- So faculty review of learner demonstrations **is not built yet.** The page is labelled "Capability Demonstrations" (C's language) but is meant to review learner durable-value submissions (A's data) — and currently does neither.

### Bonus anomaly
The single seeded capability row is categorised **`"cognitive"`** — a value that appears in **none** of the three code vocabularies. Even the one row of real data is off-taxonomy.

### Connecting glue
**There is no mapping between A and C anywhere in the codebase.** A grep for any durable-value↔capability translation returns nothing (the only `categoryMap` symbols are in unrelated staff-upload and marathon-events code). The two subsystems were built in parallel and never wired together.

---

## Root cause

This is not "one taxonomy with inconsistent labels." It is **two legitimate subsystems built at different times, plus a stub that conflates them:**

1. **Durable-value evidence** (A) — the live assessment spine.
2. **Capability skill tree** (C) — a separate "Phase 2" curriculum structure.
3. **Faculty review page** (B) — never finished; its placeholder filter borrowed C's vocabulary (badly) for what should review A's data.

The friction doc's proposed fix — *"map each capability category into a durable-value category"* — is **semantically unsound**: you cannot fold one orthogonal axis into the other. A demonstration can legitimately be *both* `problem_finding` (durable-value) *and* `ai_fluency` (capability area). They are two questions, not two answers to one question.

---

## Options

### Option A — Collapse to ONE taxonomy (durable-value wins)
Make the 7 durable-value categories the single category vocabulary across PDE. Retire `CapabilityCategory` as a *category axis* (the skill tree keeps its levels/prerequisites/lessons but loses or renames its `category` grouping). Build the faculty page to read `pde_demonstrations` filtered by durable-value.

- **Work:** small. Rebuild faculty page (1 file) against real `category_key` data; relabel/retire C's `category` grouping on the capabilities page; drop the 1 stray row. No data migration (tables empty).
- **Pros:** simplest mental model; one filter everywhere; eliminates the split entirely; cheapest to maintain.
- **Cons:** throws away the capability tree's *area* grouping (ai_fluency/technical/…), which may be wanted later for skill navigation. Forces the philosophy that "skill area" isn't a first-class dimension.
- **Who's affected:** faculty (get a working review page sooner); learners (one consistent label); admins building the capability tree (lose the area axis).

### Option B — Keep BOTH as two explicit orthogonal axes (recommended)
Declare durable-value and capability as **two separate, clearly-labelled dimensions.** A demonstration is tagged with a durable-value category (required) and *optionally* a capability area. The faculty page (when built) shows **two distinct filters** — "Durable value" and "Capability area" — never a single ambiguous "Category." Relabel the capabilities page's grouping as "Capability area" and fix C's value set (add/replace `cognitive`, drop the phantom `analytical`/`creative` chips).

- **Work:** small-to-moderate. Add a nullable `capability_category` (or `capability_id` FK) to `pde_demonstrations`; build the faculty page with two labelled filters; relabel UI strings; reconcile C's value list to its type. No data migration (tables empty).
- **Pros:** faithful to the actual design intent (durable values = philosophy; capabilities = skill curriculum); preserves both navigation axes; removes confusion by making the two questions *visibly* different rather than pretending they're the same.
- **Cons:** slightly more tagging surface; requires a one-time decision on whether capability tagging is required or optional on submission.
- **Who's affected:** everyone benefits from clarity; learners get one extra (optional) tag; faculty get an unambiguous two-axis review.

### Option C — Do nothing (status quo)
Leave A, C, and the stub as-is.

- **Work:** none now.
- **Cost of inaction:** the faculty page stays broken (empty shell). The day it's built and learners start submitting, the split becomes a *real* user-facing bug — and by then there's data to migrate, so the fix is strictly more expensive. The "cognitive" off-taxonomy row persists. The guide already names the split in its glossary, so we're documenting a known inconsistency rather than resolving it.
- **Who's affected:** future-you, at higher cost.

---

## Recommendation

**Option B — two explicit orthogonal axes.** Rationale:

1. It matches what the code already *is* (durable-value spine + skill tree), rather than destroying one of them.
2. The cost is near-zero **today** (0 demonstrations, 1 capability row) and rises every day learners use the module — so the decision is cheap now and expensive later regardless of which option you pick. That argues for deciding *now*, and B preserves the most optionality.
3. It fixes the real defect (a single ambiguous "Category" label spanning two questions) by *labelling the two axes distinctly* — the honest version of the friction doc's "show both."

If you value simplicity over the capability-area axis, **Option A** is defensible and cheapest to maintain — pick it only if you're confident the skill-area grouping will never be a primary navigation dimension.

**Either A or B is better than C**, and the single most important point is: **decide before learners start submitting.** This is the no-migration window.

---

## What I need from you (the decision)

- [ ] **Pick A, B, or C.**
- [ ] If **B:** is capability-area tagging **required** or **optional** on a learner submission?
- [ ] If **A or B:** confirm I should also (a) fix the lone `pde_capabilities` row mis-categorised `"cognitive"`, and (b) remove the phantom `analytical`/`creative` filter chips that exist in no taxonomy.
- [ ] Confirm whether the **faculty review page** should be built as part of this change or tracked as separate follow-up work.

Once you choose, the implementation is a small, single-PR change (no data migration) — I can spec the build and ship it.

---

## Appendix — exact citations

| Fact | Source |
|---|---|
| Durable-value 7-set | `lib/types/pde-demonstrations.ts` → `PDECategoryKey` |
| Durable-value DB column | `pde_demonstrations.category_key` (text) — **0 rows** in prod |
| Capability 8-set | `types/pde.ts:346` → `CapabilityCategory` |
| Capability is a skill tree | `types/pde.ts` → `PDECapability` (level, prerequisite_ids, lesson_ids, finks_dimension, versioning) + `PDELearnerCapability` (mastery status) |
| Capability DB column | `pde_capabilities.category` (text) — **1 row**, value `"cognitive"` (off-taxonomy) |
| Faculty filter is a stub | `app/(routes)/pde/faculty/demonstrations/page.tsx` line 32 (mock comment), `const demonstrations = []`, lines 138–140 (3 hardcoded chips) |
| No A↔C mapping | repo-wide grep — no durable-value↔capability translation exists |
| Admin compliance/rubrics use A | `app/(routes)/pde/admin/compliance/*`, `app/(routes)/pde/admin/rubrics/social-leadership/page.tsx` (header comment) |
| Prod data counts | Supabase `kvizhngldtiuufknvehv` — `pde_demonstrations`=0, `pde_submissions`=0, `pde_capabilities`=1 (queried 2026-06-14) |
