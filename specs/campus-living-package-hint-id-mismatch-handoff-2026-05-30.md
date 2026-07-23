# Handoff → Boobalan: admission-package → allocation hint-card id-type mismatch

**Date:** 2026-05-30
**From:** Claude (Mac session) · discovered while verifying PR #1141 live on jkkn.ai
**Owner:** Boobalan (learner identity chain / learner-schema territory)
**Severity:** Medium — a shipped feature is **dormant** (never fires). No data corruption, no crash.

---

## TL;DR

The allocation **package hint card** (shipped in PR #1141, Task 3) can **never render**, because it
looks up the learner's package using the wrong id type:

- The allocation page passes a **`learners_profiles.id`** to `getPackageForLearner(...)`.
- But `learner_package_assignment.learner_id` is keyed by **`profiles.id`** (FK → `profiles`).
- `getPackageForLearner` does **no translation** — it queries `learner_package_assignment.learner_id = <the id passed>`.
- A `learners_profiles.id` can never equal a `profiles.id`, so the lookup always returns `null` → the hint card never shows.

This is a **substrate inconsistency from PR ε (#1127)**, not from #1141. The hint-card wiring (#1141)
is type-correct; it just sits on top of a table that's keyed differently from the rest of campus-living.

---

## Evidence (all verified live against prod, 2026-05-30)

| Fact | Verification |
|------|-------------|
| `learner_package_assignment.learner_id` FK → `profiles` | Insert with a `learners_profiles.id` failed: `violates foreign key constraint "learner_package_assignment_learner_id_fkey" … not present in table "profiles"` |
| `v_learner_hostelites.id = lp.id` (`learners_profiles.id`) | `pg_get_viewdef('v_learner_hostelites')` → `SELECT lp.id, …` |
| Allocation page passes that view's `id` as `learner_id` | `allocations/new/page.tsx`: `handleChange('learner_id', student.id)` where `student` ∈ `useLearnerHostelites` (→ the view) |
| Resolver does not translate | `admission-package-service.ts` `getPackageForLearner`: `.eq('learner_id', learnerId)` — raw |
| Every other campus-living table uses `learners_profiles.id` | `hostel_allocations.learner_id`, the hostelite view, the eligibility tables all key on `learners_profiles.id` |

Example learner (SANJAY C): `learners_profiles.id = c957bf9e-8e49-4ca2-8597-f77ab6f14e32`,
his `profiles.id = 0f9b69c1-6880-41a8-b54c-54996010de60`. The page sends `c957bf9e…`; the table
can only hold `0f9b69c1…`.

Note: there are currently **0 rows** in `learner_package_assignment` and **0** `admission_packages`,
so **there is no data to migrate** — whichever fix you pick is data-safe today.

---

## Two fixes (your call — you own this chain)

### Option A — service-layer translation (no schema change)
Treat the incoming id as a `learners_profiles.id` and translate to `profiles.id` inside the service:

- `getPackageForLearner(learnerId, …)`: first `select id from profiles where learner_id = :learnerId`,
  then query `learner_package_assignment.learner_id = <that profiles.id>`.
- `assignPackageToLearner(dto)`: same translation before insert (so the admission side stores `profiles.id`).

Pros: zero schema/migration, doesn't touch your tables' shapes. Cons: keeps the table inconsistent
with the rest of campus-living; every future caller must remember the translation.

### Option B — realign the FK (recommended for consistency)
Migrate `learner_package_assignment.learner_id` to reference **`learners_profiles.id`**, matching
`hostel_allocations` and everything else in campus-living. Then `getPackageForLearner` works with the
id the allocation page already passes — **no translation, no further code change**.

Because the table is empty, this is a clean `DROP CONSTRAINT … ; ADD CONSTRAINT … REFERENCES learners_profiles(id)`
with no data backfill. Also update `assignPackageToLearner` callers (admission side) to pass `learners_profiles.id`.

**Recommendation:** Option B — it removes the inconsistency at the root and makes the hint card "just work"
with no service hacks. Option A is the safe fallback if you'd rather not touch the FK.

---

## How to verify a fix (repro recipe)

1. Insert a throwaway package (Pharmacy `5736d86f-…`, room `00fad18b-…` Classic, year `c2d71268-…`).
2. Insert a `learner_package_assignment` for SANJAY for the current year with a chosen mess
   — using whichever id your fix expects (`profiles.id` for A, `learners_profiles.id` for B).
3. On jkkn.ai → `/campus-living/allocations/new`, search "SANJAY", select him.
   Expect the **"Admission package on file"** hint card to appear (package name, flat price,
   bundled room category, chosen mess) and the mess select to pre-fill.
4. Delete the assignment, then the package (eligibility CASCADEs; assignment is NO ACTION so delete it first).

---

## Files

- `lib/services/campus-living/admission-package-service.ts` — `getPackageForLearner`, `assignPackageToLearner`
- `app/(routes)/campus-living/allocations/new/page.tsx` — consumes `usePackageForLearner(formData.learner_id, …)`
- `hooks/campus-living/use-admission-packages.ts` — `usePackageForLearner`
- (Option B only) a new migration under `supabase/migrations/` to swap the FK

The hint-card code is **forward-compatible**: it's a fail-open conditional that simply renders nothing
today. Once the id types line up (either fix), it starts working with no change to #1141's code.
