# MyJKKN Continuation Brief — Element Gallery: check locally → expand to ~30 → THEN ship

## 1. ONE-LINE CONTEXT
Last session (2026-07-18 early AM) finished the mobile-tab sweep (28 pages LIVE+verified) and BUILT **Element Gallery Phase 1** — a `/design-gallery` page (MyJKKN's version of NameThatUI: every UI element beside 5 alternative designs + a vote). It's open as **PR #2151 but NOT merged**. **Your job: (1) check it locally, (2) EXPAND it from 6 → ~30 elements on the same branch, (3) THEN ship it** — do NOT merge the 6-element version as-is.

## 2. VERIFY CURRENT STATE FIRST (read-only, before touching anything)
```bash
git fetch jicate main && git log jicate/main --oneline -3          # confirm #2146/#2149/#2150 are in main
gh pr checks 2151 --repo Jicate-Solutions/MyJKKN                    # was UNSTABLE (in-flight) at session end — is CI now green/red?
gh pr view 2151 --repo Jicate-Solutions/MyJKKN --json state,mergeStateStatus --jq '{state,mergeStateStatus}'
git worktree list | grep design-gallery                            # worktree .claude/worktrees/design-gallery should exist (off jicate/main)
```
- If `gh pr checks 2151` shows a FAILED required check, fix it first (likely the PR-scoped TypeCheck or "jkkn-conventions" objecting to the inline `<style dangerouslySetInnerHTML>` in page.tsx — if conventions fails, move the CSS to a plain string const or a co-located module rather than disabling the rule).
- The old CI monitor (bb63o9aek) was wiped by /clear — re-check via the command above.

## 3. THE TASK (P0 — user verbatim)
> "check locally and then Expand elements before shipping — grow Phase 1 from 6 to ~30 elements so the first live version is fuller."

So, in order:
1. **Check locally** — run local dev from the `design-gallery` worktree (it's already off jicate/main), open `http://localhost:PORT/design-gallery`, eyeball that the 6 elements + 5 variants render, search/browse/phone-toggle/vote all work, and light/dark follows the app. (See §5 for the exact local-dev command — use the REAL service-role key or login bounces.)
2. **Expand 6 → ~30 elements** on the SAME branch `feat/design-gallery-phase1` (add commits to the open PR #2151 — do NOT open a new PR, do NOT merge the 6-element version). Each element = a `body` render fn + an entry in the `ELEMENTS` array in `app/(routes)/design-gallery/page.tsx`; the 6 vibe CSS classes already style shared `.dg-*` markup, so new elements mostly reuse existing `.dg-*` classes (add new ones only for genuinely new element types). Good candidates to add: Toggle/Switch, Checkbox, Radio, Select/Dropdown, Progress bar, Avatar, Alert/Callout, Breadcrumb, Pagination, Tooltip, Accordion, Slider, Date picker, Empty state, Loading skeleton, Modal/Dialog, Toast, Sidebar item, Stepper, File upload, Rating, Chip/Tag input, Segmented control, KPI trend, Timeline. Aim ~30 total incl. the existing 6.
3. **THEN ship** — once ~30 elements render locally: merge #2151 (squash), deploy via `/deploy-myjkkn`, verify `/design-gallery` live at BOTH desktop AND 390px.

## 4. KEY DECISIONS & RATIONALE (carry forward — all locked via interview)
- **(a) Do NOT merge as 6 elements.** User explicitly wants ~30 + a local check before shipping. Expand the open PR, don't ship thin.
- **(b) The concept is fully specced & approved** (clickable prototype approved: https://claude.ai/code/artifact/f42fcf7d-7741-4624-815b-11fd78e6d087). Design: every element shows Current(MyJKKN) + 5 alts = **3 on-brand** (Minimal, Soft — keep green+Poppins) + **3 bold** (Neobrutalist, Glass, Material). Search + browse categories. Phone/computer toggle. Per-element vote with "★ Most voted" leader.
- **(c) MyJKKN's real style** = shadcn **"new-york"**, primary `hsl(150 78% 26%)` green, radius 0.5rem, Poppins → Flat+Minimal. The gallery reads MyJKKN's own CSS tokens so on-brand tiles follow app light/dark automatically; bold vibes keep fixed looks.
- **(d) Fold the 15-style dashboard study winners** in as the "bold" variants where they beat Neo/Glass/Material: https://claude.ai/code/artifact/71832341-e555-4976-a1c5-522278f33f1f
- **(e) Lean gate integration (KEEP):** `/design-gallery` is in `NAV_EXCLUDE` (scripts/check-nav-reachability.ts) so reachability passes; it's NOT in `MENU_PERMISSIONS` so audit-coverage needs no module mapping; authenticated-users-only via the (routes) layout. No migration, no new deps. Adding elements does NOT change any of this.
- **(f) Votes are in-memory (reset on refresh) in Phase 1 — intentional.** Do NOT re-add localStorage (it tripped the `react-hooks/set-state-in-effect` lint). Shared cross-user voting is Phase 2.
- **Drops:** none — carry everything forward.

## 5. HOW TO CHECK LOCALLY (the worktree is already set up off jicate/main)
```bash
cd /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/design-gallery
# node_modules symlink + .env.local already wired last session; if missing: ln -sfn ../../../node_modules node_modules && cp ../../../.env.local .
PORT=3105 SUPABASE_SERVICE_ROLE_KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' ../../../.env.production.local | sed 's/^[^=]*=//' | tr -d '"'"'"' \r\n')" npm run dev
# then open http://localhost:3105/design-gallery  (login as student/faculty/staff/hod/superadmin via /auth/test-login; other seeded accts bounce to complete-profile)
```
- Use the REAL service-role key from `.env.production.local` (NOT .env.local — it's empty), else middleware bounces every login to /auth/login?reason=database_error.
- For the 390px MOBILE eyeball post-deploy: `PERSONA_MODE=headless PERSONA_VP_W=390 PERSONA_VP_H=844 PERSONA_BASE_URL=https://www.jkkn.ai node scripts/persona-harness/harness.mjs "superadmin:/design-gallery"` (patch lives in the fav-tab-star worktree). claude-in-chrome resize is flaky for mobile CSS — persona-harness is the reliable path.

## 6. FILES / MEMORY TO READ
- `app/(routes)/design-gallery/page.tsx` (in the worktree) — the whole gallery: `VIBES`, `ELEMENTS`, render fns, and the scoped `CSS` const at the bottom. Extend `ELEMENTS` here.
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_design_gallery_element_chooser.md` — full spec + interview answers + artifact links.
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_myjkkn_tab_bars_nonresponsive_gridcols.md` — the completed 28-page tab sweep + the grid-cols-2 blind-spot lesson (in case any new gallery element re-triggers it).
- `progress.txt` top entry (2026-07-18 early AM) — this session's full summary + task list.

## 7. SHIP MECHANICS (reminder)
Work from the existing `.claude/worktrees/design-gallery` worktree (off jicate/main — NEVER omm-dev). Auto-save hook makes `wip` commits → `git reset --soft jicate/main` + one clean commit before push. Push to `jicate` remote (origin is the WRONG repo). Squash-merge. Merging ≠ deploying — fire `/deploy-myjkkn` after merge, then verify live.
