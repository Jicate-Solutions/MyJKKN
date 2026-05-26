# How To Use This Handoff Package

**Audience:** Omm (non-coder)
**What this is:** A complete package the developer at Jicate-Solutions needs to add K-12 schools to MyJKKN.

---

## What you're handing over

A folder at `specs/jkkn-schools/` that contains:

1. Plain-English explanation of the feature (this file)
2. The approved spec (`docs/SPEC-jkkn-schools.md`)
3. The exact files to add and edit (covered in the package)
4. The database change (one new column, safe)
5. A test checklist
6. A note about production state (nothing conflicts)

The developer reads **`00-HANDOFF-INDEX.md`** first — that file tells them what to read and in what order.

**Important note for future AI-assisted work:** The package also includes **`07-AI-AGENT-NOTES.md`** — a file written specifically for AI coding assistants (Claude Code, Cursor, etc.) that will maintain MyJKKN after the schools feature ships. It explains the "translation boundary" (data model uses college words, UI translates to school words) and lists 6 common confusion patterns AI agents fall into. This file is why future AI work on the platform won't silently corrupt your codebase. You don't need to read it — but point any AI working on MyJKKN at it.

---

## What you need to do

**1. Share the package with the developer.** Two options:

- **Easiest:** `git push` your branch and share the folder link on GitHub (e.g. `https://github.com/Jicate-Solutions/MyJKKN/tree/<branch>/specs/jkkn-schools`)
- **Alternative:** Zip the `specs/jkkn-schools/` folder and send it directly

**2. Tell the developer these 3 things:**
- "Branch from `jicate/main`, NOT from my dev branch"
- "Read `00-HANDOFF-INDEX.md` first — it's the roadmap"
- "When the PR is merged, ping me and I'll trigger the production deploy hook"

**3. When the developer opens the PR, review these points:**
- Does the PR title reference this spec? (Good sign they read it.)
- Do they include browser test screenshots of both a college and a school view? (That's the acceptance criteria.)
- Did the migration apply cleanly on staging first? (Listed in their PR checklist.)

---

## What you should NOT do

- **Don't try to apply the migration yourself.** It's only 1 column and the migration is safe, but the rule is: migrations land with the code that uses them, not ahead of it.
- **Don't merge the PR yourself from Vercel.** Follow the normal flow: developer pushes → PR to jicate/main → you confirm merge → you trigger deploy hook.
- **Don't modify the files in `specs/jkkn-schools/`** after sharing — if the developer asks for changes, update the spec and note it in a new file.

---

## Expected timeline

A competent Next.js + Supabase developer should ship Phase 1 in one focused day:

- Apply migration to staging (~5 min)
- Copy 3 new files + edit 3 existing files (~30 min)
- Type-check and build (~15 min, plus any fixes)
- Browser test both college and school views (~45 min)
- PR + review cycle (~30 min)

If it takes longer than 2 days, something's off — ask them what's blocking.

---

## How you'll know it worked

1. The developer's browser test screenshots show:
   - A college view with "Program", "Semester", "Course" labels (unchanged)
   - A school view with "Class", "Term", "Subject" labels (new)
2. Database query (you can run this in Supabase dashboard):
   ```sql
   SELECT id, name, institution_kind FROM institutions ORDER BY institution_kind, name;
   ```
   Shows all existing institutions with `institution_kind = 'college'`, and your 2 schools with `institution_kind = 'school'`.
3. Existing colleges still log in and see everything exactly as before — zero regression.

---

## Who created what

| File | Who writes it | When |
|---|---|---|
| `docs/SPEC-jkkn-schools.md` | Claude (already done) | Before this handoff |
| `supabase/migrations/20260411_add_institution_kind.sql` | Claude (already done) | Before this handoff |
| `lib/constants/institution-kind-labels.ts` | Claude (already done) | Before this handoff |
| `hooks/use-institution-kind.ts` | Claude (already done) | Before this handoff |
| Sidebar filter integration | **Developer** | During Phase 1 |
| `menu.tsx` + `bottom-navbar.tsx` wiring | **Developer** | During Phase 1 |
| Seed script for 2 schools | **You + Developer** | After merge (you provide school names) |

The first 4 files are already in your repo. The developer's job is to copy those files into a branch from `jicate/main`, wire up the sidebar filter, test, and PR.

---

**Read next:** `00-HANDOFF-INDEX.md` for the developer's entry point.
