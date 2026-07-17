# MyJKKN Continuation Brief — Mobile Tab Bars: Switch to Horizontal-Scroll Style

## 1. ONE-LINE CONTEXT
Last session (2026-07-17, "favorite-tabs") shipped 7 PRs LIVE on jkkn.ai (#2129–#2139): tab-aware favorite star + URL-synced tabs, favoritable/shareable `?tab=` tabs rolled to ~106 pages via the `useTabParam` hook, type-debt unblocks, a labelled "Favorite"/"Favorited" discoverability pill, and a role-management mobile tab fix (STACKED). **Your job now: replace that STACKED mobile-tab style with a HORIZONTAL-SCROLL style and apply it consistently across role-management (re-do) + the ~7 other pages whose `<TabsList>` uses non-responsive `grid w-full grid-cols-N`.**

## 2. VERIFY CURRENT STATE FIRST (read-only, run before touching anything)
```bash
git fetch jicate main && git log jicate/main --oneline -5      # confirm #2139 is in main
git grep -l "grid w-full grid-cols-[3-9]" jicate/main -- 'app/(routes)/**'   # enumerate affected pages
```
- Expect ~7 pages from the grep. **role-management/page.tsx is currently STACKED (from #2139) — it must be RE-DONE to scroll style**, so it may or may not still match the grep pattern; check it explicitly either way.
- Reference pattern already in the repo: `permissions-audit` uses responsive `grid-cols-2 sm:grid-cols-6 lg:grid-cols-11` — a clean in-repo example of many-tab responsiveness (you can borrow the responsive-breakpoint idea, but the user chose SCROLL, not more grid breakpoints).

## 3. THE TASK (P0 — user verbatim: "Both — scroll style + the 7 pages")
Switch MyJKKN's mobile tab bars from STACKED to a **HORIZONTAL-SCROLL** style — a single swipeable row of tabs that scrolls sideways on a phone instead of wrapping/stacking. Apply it to:
1. **role-management/page.tsx** — currently has the STACKED fix from #2139; **re-do it to scroll style**.
2. **The ~7 other pages** whose `TabsList` is `grid w-full grid-cols-[3-9]` (enumerate via the grep in §2). These are non-responsive: shadcn `TabsTrigger` is `whitespace-nowrap`, so on a phone the long labels overflow their fixed 1/N cell and collide into an unreadable jumble.

Root cause reference: the `grid grid-cols-N` (no `sm:` prefix) forces N equal cells at all widths; labels can't fit at 390px. Scroll style = let the row exceed viewport width and scroll horizontally (e.g. an overflow-x-auto flex row) rather than cramming N cells.

Carry EVERYTHING forward — drop nothing.

## 4. KEY DECISIONS & RATIONALE (carry forward)
- **(a) Style = SCROLL, not STACKED.** User explicitly chose horizontal-scroll over the stacked approach used in #2139. One consistent style across all converted pages.
- **(b) PR-scoped TypeCheck gate fails on ANY pre-existing error in a touched file.** If a target page's file already has tsc errors unrelated to your change, the PR won't merge. Do NOT fix unrelated type debt at root (that surfaced 2+ real latent runtime bugs last session). Instead: prove the error is pre-existing (restore the `jicate/main` version of the file, re-run tsc, confirm the same error) and exclude that file from the sweep, OR fix at root only if trivial and safe. Last session's #2135 handled exactly this dance.
- **(c) Ship mechanics:** Work from a worktree off `jicate/main` (NEVER omm-dev — it's 720+ commits diverged and missing merged prod features). Squash-merge PRs, use auto-merge. **Merging does NOT deploy** — after all PRs merge, deploy ONCE via the Vercel deploy hook (`/deploy-myjkkn`), then re-verify live. Ship as 1–2 CI-green PRs (existing worktree `.claude/worktrees/fav-tab-star` or a fresh one).
- **(d) Already in main (reuse, don't rebuild):** the shared `useTabParam` hook and the `FavoriteStar` `showLabel` prop. Don't touch tab logic — this is purely a CSS/layout change to `TabsList`.
- **Deliberate exclusions to preserve:** dialog tabs, shared/repeated tab components, and role-conditional/runtime tab sets were intentionally left out last session — keep them out unless the user says otherwise.

## 5. HOW TO VERIFY MOBILE (critical — do not skip, rule #25 visual gate)
**claude-in-chrome `resize_window` does NOT change the rendered CSS viewport** (screenshot comes back at ~1347px desktop, media queries stay desktop). Verifying a mobile fix by resizing the Chrome window is a false test — wasted round-trips last session.

Use the persona harness at true 390px, as a real super-admin (no login bounce):
```bash
PERSONA_MODE=headless PERSONA_VP_W=390 PERSONA_VP_H=844 \
PERSONA_BASE_URL=https://www.jkkn.ai \
node scripts/persona-harness/harness.mjs "superadmin:/users/<page>"
```
→ headless puppeteer renders at 390px, writes a PNG to `.screenshots/`. Eyeball each converted page's tab row at phone width before shipping.
- The `PERSONA_VP_W`/`PERSONA_VP_H` `setViewport({width,height,isMobile})` patch to `scripts/persona-harness/harness.mjs` is **uncommitted in the fav-tab-star worktree** — if the worktree was cleaned/missing, re-add the env-driven `page.setViewport` patch first.
- Retry on transient `UND_ERR_CONNECT_TIMEOUT` (supabase sign-in flake) — it's not a real failure.

## 6. FILES / MEMORY TO READ
- `/Users/omm/PROJECTS/MyJKKN/progress.txt` — top entry (Session 2026-07-17 favorite-tabs) + its "Next Session — Tasks" (4 items: apply scroll to role-management, sweep the ~7 pages, verify each at 390px, ship 1–2 PRs + deploy once).
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_myjkkn_tab_bars_nonresponsive_gridcols.md` — the systemic issue + fix options + permissions-audit reference pattern.
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_mobile_viewport_testing_via_persona_harness.md` — the persona-harness mobile-viewport method above.
