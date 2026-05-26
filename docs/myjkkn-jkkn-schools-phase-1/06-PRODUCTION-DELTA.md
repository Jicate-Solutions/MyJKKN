# 06 — Production Delta (Local vs jicate/main)

**As of 2026-04-11 16:56 IST**

The point of this file: explain why branching from `jicate/main` is safe, and why you should NOT cherry-pick from Omm's dev branch.

---

## Repo topology

```
                                 (this repo has 3 remotes)

  origin (legacy) ─────────────────────────────────── JKKN-Institutions/MyJKKN
                                                      (DEPRECATED — do not push here)

  jicate (production) ─────────── f87376b40 ─────────  Jicate-Solutions/MyJKKN · main
                                     │                 ↑ Your target branch
                                     │
                                     │ (1 commit behind)
                                     ▼
                         c4c3403aa  ←─────── 317a00bfa (local: fix/remove-junk-crypto-dep)
                                             ↑
                                             │ ommdev · omm-dev
                                             │ (experimental, do NOT branch from here)
                                             │
                     Omm's spec + migration + hook + labels live HERE
```

---

## Branch divergence summary

Command: `git log --oneline HEAD..jicate/main` (what prod has that we don't):

```
f87376b40 fix(marathon-ops): fix QR code text rendering on Vercel production
```

Command: `git log --oneline jicate/main..HEAD` (what we have that prod doesn't):

```
317a00bfa chore: remove junk crypto placeholder package from deps
```

**Interpretation:**

- Production is 1 commit ahead of our local tip (QR code fix for marathon events, completely unrelated to organization / sidebar / institutions)
- Our local is 1 commit ahead of production (crypto-dep cleanup, also unrelated)
- **Neither commit touches any file this handoff cares about**

---

## Files this handoff touches — recent production history

### `lib/sidebarMenuLink.ts`

Recent production commits (via `git log --oneline jicate/main -- lib/sidebarMenuLink.ts`):

```
c4c3403aa Create 20260411_fix_expo_rls_admission_profile_role.sql
09c91a4ac feat(marathon-ops): add operations nav links to dashboard and sidebar
e587c9f3a feat(internal-marks): add sidebar menu + permissions + action gating
d206c72f3 fix(marathon): restrict admin pages to authorized roles only
334cb9b47 fix: resolve 3 pre-existing TypeScript errors blocking CI (#104)
5ccc2ea18 fix(saml): persist SP-initiated AuthnRequest across OAuth round-trip
```

**None of these touch the "Organization Management" menu group** (lines 600-670 in the current file). They all added items to other groups (Events/Marathon, Internal Marks, Admission). So your `filterMenuByInstitutionKind` helper at the bottom of the file will apply cleanly — no merge conflict risk.

### `components/Navbar/menu.tsx` and `components/BottomNav/bottom-navbar.tsx`

No recent production commits. Low-churn files. Safe to edit.

### `supabase/migrations/`

Latest production migration: `20260411_fix_expo_rls_admission_profile_role.sql`. Our new migration `20260411_add_institution_kind.sql` lives at the same date prefix but a different name — migrations are name-keyed, not content-keyed, so there's no conflict. Both apply in alphabetical order.

### `institutions` table

Live staging schema was pulled on 2026-04-11. Column count: 29. `institution_kind` does NOT exist. Migration will ADD it. Risk: zero.

---

## Why not branch from `ommdev/omm-dev` or `fix/remove-junk-crypto-dep`?

Per `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_codebase_divergence.md` and the `ship-myjkkn` skill: Omm's dev branches and the production main have diverged 720+ commits over time. His local has experimental work that production doesn't, and vice versa.

**If you branch from Omm's dev:**
- You inherit ~720 experimental commits that aren't on production
- Your PR diff to `jicate/main` becomes enormous and untouchable
- Reviewers can't tell what's yours vs what's Omm's
- Merge conflicts compound

**If you branch from `jicate/main`:**
- Your diff contains ONLY this Phase 1 work
- Review is tractable
- The 4 pre-written files (spec, migration, labels, hook) come across as fresh commits that apply cleanly

This is the "translator pattern" from Omm's memory: rebuild features on production base via a fresh worktree to make divergence irrelevant.

---

## Merge path

```
1. git fetch jicate
2. git checkout -b feat/jkkn-schools-phase-1 jicate/main
3. Copy or recreate the 4 pre-written files (SPEC, migration, labels, hook)
4. Add filterMenuByInstitutionKind to sidebarMenuLink.ts
5. Wire menu.tsx + bottom-navbar.tsx
6. Type-check, build, browser-test per 05-TESTING-CHECKLIST.md
7. git push <your-remote> feat/jkkn-schools-phase-1
8. gh pr create --base main --repo Jicate-Solutions/MyJKKN
9. Wait for Omm to merge
10. After merge: apply migration to production Supabase
11. Omm triggers Vercel deploy hook
```

**Do not:**
- Push to `JKKN-Institutions/MyJKKN` (`origin`) — that's the deprecated repo
- `vercel --prod` from your laptop — production deploys only through the Vercel GitHub integration + hook
- `git push --force` anything on `jicate/main`
- Apply the production migration BEFORE the code merges (the hook falls back to 'college' gracefully, but coordinating this way avoids any user-visible flicker)

---

## After you merge

Omm will:

1. Confirm the PR merged cleanly
2. Trigger the Vercel deploy hook manually (per the `project_dev_workflow` memory — deploys are never automatic)
3. Wait for the deploy to finish (~3 min)
4. Apply the migration to the production Supabase project
5. Verify production with the same 5 SQL queries from `03-DATABASE-CHANGES.md`
6. Provide you with the 2 real JKKN school names so you can seed them (Phase 1.5)

---

## Sanity check commands to run before your PR

```bash
# You should be on jicate/main + your changes
git log --oneline -5
# Top commit should be yours (feat(schools): ...)
# Second commit should be f87376b40 (marathon-ops QR fix) or c4c3403aa (expo RLS fix)

# Confirm no stray files from Omm's dev branch
git diff --stat jicate/main..HEAD -- ':!specs/jkkn-schools/' ':!docs/SPEC-jkkn-schools.md'
# Should ONLY show:
#   supabase/migrations/20260411_add_institution_kind.sql
#   lib/constants/institution-kind-labels.ts
#   hooks/use-institution-kind.ts
#   lib/sidebarMenuLink.ts (modified)
#   components/Navbar/menu.tsx (modified)
#   components/BottomNav/bottom-navbar.tsx (modified)
#   (optionally) app/(routes)/organizations/programs/page.tsx etc. if Phase 1.5 labels shipped
```

If `git diff --stat` shows anything other than the above, you picked up cross-contamination from Omm's dev branch. Reset and re-branch from `jicate/main`.
