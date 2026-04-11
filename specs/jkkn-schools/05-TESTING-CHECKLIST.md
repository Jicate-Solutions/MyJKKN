# 05 — Testing Checklist

**Reminder:** Build passing is NOT the same as feature working. You MUST run the browser test before marking this done.

---

## Layer 1: Database verification (SQL)

Run these against staging (`hhprjbgknupaplivtoib`) after Step 2 of `02-IMPLEMENTATION-STEPS.md`.

- [ ] Column exists: `institution_kind VARCHAR(20) NOT NULL DEFAULT 'college'`
- [ ] Check constraint rejects invalid values (test: `UPDATE institutions SET institution_kind='k12'` must error)
- [ ] Index `idx_institutions_kind` exists
- [ ] All 10 existing rows have `institution_kind = 'college'`
- [ ] Flipping one row to `'school'` works (`UPDATE institutions SET institution_kind='school' WHERE id=<test-uuid>`)

All 5 SQL queries are in `03-DATABASE-CHANGES.md` — paste them into the Supabase SQL editor.

---

## Layer 2: Type-check + build

```bash
pnpm type-check
pnpm build
```

- [ ] No new TS errors (18 pre-existing test-file errors are acceptable — see `CLAUDE.md`)
- [ ] Build output includes `hooks/use-institution-kind.ts` and `lib/constants/institution-kind-labels.ts`
- [ ] No warnings about missing `institution_kind` in generated Supabase types (regenerated in Step 3)

---

## Layer 3: Browser test (mandatory)

**Login 1 — College user** (any existing staging user):

- [ ] Sidebar shows "Degrees" under Organization Management
- [ ] Sidebar "Courses" has 2 submenus: "All Courses" + "Course Mappings"
- [ ] Programs page header reads "Programs" (assuming you shipped Phase 1.5 labels)
- [ ] Semesters page header reads "Semesters"
- [ ] Courses page header reads "Courses"
- [ ] Console is clean (no errors about missing `institution_kind`)
- [ ] Screenshot the sidebar and the Programs page — attach to PR

**Login 2 — School user** (create one for the test):

1. Flip an existing staging institution to school:
   ```sql
   UPDATE institutions
   SET institution_kind = 'school'
   WHERE name ILIKE '%College of Arts and Science%'  -- or whichever you want to test
   RETURNING id, name, institution_kind;
   ```
2. Log in as a user scoped to that institution (or create a test super-admin and impersonate)
3. Verify:

- [ ] Sidebar DOES NOT show "Degrees" under Organization Management
- [ ] Sidebar "Courses" has ONLY 1 submenu: "All Courses" (no "Course Mappings")
- [ ] Programs page header reads "Classes" (if Phase 1.5 labels shipped)
- [ ] Semesters page header reads "Terms"
- [ ] Courses page header reads "Subjects"
- [ ] Console is clean
- [ ] Screenshot the sidebar and the Programs page — attach to PR

**Login 3 — Restore the test institution to college:**

```sql
UPDATE institutions SET institution_kind = 'college' WHERE id = <test-id>;
```

- [ ] After refresh, the same user (now on a college-flagged institution) sees the full sidebar again
- [ ] Screenshot: sidebar reverted correctly

---

## Layer 4: Regression check

Run through the normal MyJKKN workflows with the login user from Test 1 (college):

- [ ] Create a new program — form submits, shows up in the list
- [ ] Attendance page loads for a section
- [ ] Billing page loads, existing bills visible
- [ ] Staff page loads
- [ ] Bug reports page loads
- [ ] Console clean throughout

**If ANY of these break for a college user, the filter broke something it shouldn't have.** The filter is an identity function for colleges — if college pages break, you have a bug in the filter that somehow leaks into the college path.

---

## Layer 5: Network tab check

- [ ] Open DevTools → Network → filter by "institutions"
- [ ] On a fresh login, exactly ONE request to `institutions` with a `.select('institution_kind').eq('id', ...)` query pattern fires
- [ ] The request is cached for subsequent renders (React Query `staleTime: 5min` kicks in)
- [ ] No repeated fires on tab switch or route change

This proves the hook isn't accidentally re-fetching on every render.

---

## Layer 6: Edge cases

- [ ] Hook called while auth is loading → returns `kind='college'` safely, no flash-of-wrong-content
- [ ] Hook called when `institutionId` is `null` (super admin with no active institution) → returns `kind='college'` safely
- [ ] Hook called when DB returns an unexpected value (e.g., `'School'` capitalized) → defaults to `'college'` (the coercion in `use-institution-kind.ts` handles this)
- [ ] RLS test: a college user trying to SELECT a school's rows via the API gets the same 403/empty result as before the migration (no new access path was introduced)

---

## PR description requirements

Your PR to `jicate/main` must include:

1. **Title**: `feat(schools): Phase 1 — institution_kind + conditional labels + sidebar filter`
2. **Body sections**:
   - `## What` — one paragraph, cite the spec
   - `## Why` — the insight (labels change, data model doesn't)
   - `## Screenshots` — 4 attached images (college sidebar, school sidebar, college programs page, school programs page)
   - `## Migration` — "applied to staging on YYYY-MM-DD, verified with 5 SQL checks"
   - `## Test plan` — copy this checklist and tick every box
   - `## Rollback` — link to `03-DATABASE-CHANGES.md` rollback section

3. **Tag the reviewer**: Omm

---

## Sign-off

Do not mark this PR ready-for-review until:

- [ ] All 5 SQL verifications pass
- [ ] Build + type-check clean
- [ ] 4 browser screenshots attached
- [ ] Console clean on both views
- [ ] Regression check passed for college user
- [ ] Network tab shows single cached fetch
- [ ] You've personally clicked every sidebar item in both views (there are ~30 items — actually click them all, don't skip)

If any step fails, fix it BEFORE requesting review. Do not ship "mostly working" — that creates the exact divergence problem this handoff exists to solve.
