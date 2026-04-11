# 02 — Implementation Steps (File-by-File)

**Pre-req:** You've read `01-ARCHITECTURE.md` and understand why this is "1 column + labels" and not a new module.

---

## Step 0 — Branch from production

```bash
git fetch jicate main
git checkout -b feat/jkkn-schools-phase-1 jicate/main
```

**Do NOT branch from Omm's `omm-dev` or `fix/remove-junk-crypto-dep`** — those have unrelated work (crypto-dep cleanup, experimental features). Branch clean from `jicate/main`.

---

## Step 1 — Copy the 4 pre-written files

These files already exist on Omm's dev branch. Get them via either:

**Option A — cherry-pick** (if Omm has committed them):
```bash
git fetch ommdev
# find the commits that added these files
git log --oneline ommdev/omm-dev -- docs/SPEC-jkkn-schools.md
git cherry-pick <commit-sha>
```

**Option B — copy contents manually** (paste the file bodies from the handoff package ZIP into new files):

Files to create on your branch:

| Path | Purpose |
|---|---|
| `docs/SPEC-jkkn-schools.md` | The approved spec (reference) |
| `supabase/migrations/20260411_add_institution_kind.sql` | The DB migration |
| `lib/constants/institution-kind-labels.ts` | Label dictionaries + hidden sidebar hrefs |
| `hooks/use-institution-kind.ts` | The React hook |

Run:
```bash
git status
# Should show 4 new files
git add docs/SPEC-jkkn-schools.md supabase/migrations/20260411_add_institution_kind.sql \
        lib/constants/institution-kind-labels.ts hooks/use-institution-kind.ts
git commit -m "feat(schools): add spec, migration, labels, and hook for institution_kind"
```

---

## Step 2 — Apply migration to STAGING

**Staging Supabase project:** `hhprjbgknupaplivtoib`

```bash
~/bin/supabase link --project-ref hhprjbgknupaplivtoib
~/bin/supabase db push
```

Or via the Supabase dashboard SQL editor, paste the contents of `20260411_add_institution_kind.sql`.

**Verify the migration applied cleanly:**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'institutions' AND column_name = 'institution_kind';
```

Expected: 1 row, `varchar`, default `'college'`.

**Verify existing rows defaulted correctly:**

```sql
SELECT COUNT(*) AS total, institution_kind FROM institutions GROUP BY institution_kind;
```

Expected: all 10 existing staging rows show `institution_kind = 'college'`.

---

## Step 3 — Regenerate Supabase types

```bash
~/bin/supabase gen types typescript --project-id hhprjbgknupaplivtoib > types/supabase.ts
```

This adds `institution_kind` to the generated type for the `institutions` row. Without this, the `useInstitutionKind` hook falls back to `as { institution_kind?: string }` — functional but unclean. Do the regen so the final typing is tight.

---

## Step 4 — Export `filterMenuByInstitutionKind` from `sidebarMenuLink.ts`

**File:** `lib/sidebarMenuLink.ts`
**Where:** Add to the bottom of the file (after `GetRoleBasedPages`, before EOF)

```ts
import { HIDDEN_SIDEBAR_HREFS, type InstitutionKind } from '@/lib/constants/institution-kind-labels';

/**
 * Filter the sidebar menu tree to hide items that don't apply to
 * the current institution kind (college vs school).
 *
 * Called AFTER GetRoleBasedPages, as a second-stage filter.
 * Recurses into submenus so a hidden submenu doesn't drop its parent.
 */
export function filterMenuByInstitutionKind(
  groups: MenuGroup[],
  kind: InstitutionKind
): MenuGroup[] {
  const hidden = HIDDEN_SIDEBAR_HREFS[kind];
  if (hidden.length === 0) return groups;

  return groups
    .map((group) => ({
      ...group,
      menus: group.menus
        .filter((menu) => !hidden.includes(menu.href))
        .map((menu) => ({
          ...menu,
          submenus: menu.submenus.filter((sub) => !hidden.includes(sub.href)),
        })),
    }))
    .filter((group) => group.menus.length > 0);
}
```

**That's it** — one export, no edits to the existing 2000+ lines.

---

## Step 5 — Wire the filter in `components/Navbar/menu.tsx`

**File:** `components/Navbar/menu.tsx`

Find where `GetRoleBasedPages` is called. It looks like:

```ts
import { GetRoleBasedPages, RolePermissionData } from '@/lib/sidebarMenuLink';

// inside the component
const menuList = GetRoleBasedPages(pathname, userRoleData);
```

Change to:

```ts
import {
  GetRoleBasedPages,
  filterMenuByInstitutionKind,
  RolePermissionData,
} from '@/lib/sidebarMenuLink';
import { useInstitutionKind } from '@/hooks/use-institution-kind';

// inside the component
const { kind } = useInstitutionKind();
const rawMenuList = GetRoleBasedPages(pathname, userRoleData);
const menuList = useMemo(
  () => filterMenuByInstitutionKind(rawMenuList, kind),
  [rawMenuList, kind]
);
```

**Why `useMemo`:** `filterMenuByInstitutionKind` returns a new array each render; wrapping in `useMemo` prevents downstream re-renders when the inputs haven't changed. The existing `menu.tsx` likely already memoizes the `menuList` — if so, include `kind` in that memo's dependency array instead of creating a new one.

---

## Step 6 — Wire the filter in `components/BottomNav/bottom-navbar.tsx`

Same pattern as Step 5. The mobile bottom-nav consumes the same `GetRoleBasedPages` function. Apply the filter there too so the mobile view is consistent.

---

## Step 7 — Type-check + build

```bash
pnpm type-check
pnpm build
```

Both must pass cleanly. Known pre-existing errors (18 in test files — grievance + stakeholder-nps) are unrelated and acceptable per `CLAUDE.md`. Any new error from Phase 1 code must be fixed before proceeding.

---

## Step 8 — Browser test (mandatory)

Follow `05-TESTING-CHECKLIST.md`. Required artifacts in the PR description:

1. Screenshot: college user sees "Programs", "Semesters", "Courses"
2. Screenshot: school user sees "Classes", "Terms", "Subjects"
3. Screenshot: school user's sidebar has NO "Degrees" item and NO "Course Mappings" submenu
4. Screenshot: college user's sidebar still has both of those
5. Console output clean on both views

**Build passing is NOT enough.** You must actually log in as a school-scoped user on staging.

---

## Step 9 — Open PR to `jicate/main`

```bash
git push ommdev feat/jkkn-schools-phase-1
gh pr create --base main --title "feat(schools): Phase 1 — institution_kind + conditional labels + sidebar filter" \
  --body "$(cat specs/jkkn-schools/05-TESTING-CHECKLIST.md)"
```

(Adjust the remote depending on where you want to push the branch first.)

Ping Omm with the PR link. Wait for Omm to merge. After merge, Omm triggers the Vercel deploy hook — **do not deploy directly**.

---

## Step 10 — After merge: apply migration to PRODUCTION Supabase

Only after the code is live on `jkkn.ai`:

```bash
# Link to production project (ref lives in Omm's Vercel env vars)
~/bin/supabase link --project-ref <production-ref>
~/bin/supabase db push
```

Then verify via the same queries as Step 2 but against production. All existing rows should default to `institution_kind = 'college'` with zero behavioral change.

---

## Step 11 — Seed 2 JKKN schools

Omm will provide the exact school names and the CSV of classes + terms + subjects. Use the Organization module UI:

1. Create institution → set `institution_kind` to `'school'` via SQL (UI switch is Phase 2)
2. Create 1 virtual degree "K-12 Program"
3. Create 1 virtual department "Academic"
4. Create 12 programs (Class 1 … Class 12)
5. Create 3 semesters per class per academic year (Term 1, Term 2, Term 3)
6. Create subject list as courses, map to classes

Phase 1.5 (follow-up PR) can ship an idempotent seed script. For now, the manual path is acceptable — we only have 2 schools.
