# MyJKKN Sidebar + Mobile Bottom-Nav Rework — Spec (Wave 2b)

> **Spec status:** RECONSTRUCTED 2026-04-25 from PR bodies (#409, #432, #482, #486, #488) + session memory. The original spec was never committed and was lost to a working-tree-wipe cycle (memory: `feedback_commit_after_every_write.md`). This reconstructed version is the new source of truth.

## 1. Problem Statement

Pre-Wave-2b, navigation across MyJKKN had three structural pains:

- **184 inline sidebar entries** stacked 2-3 levels deep in `lib/sidebarMenuLink.ts` (2,100+ LOC), making top-level scannability poor and adding accidental navigation depth that contradicted the locked directive *"sidebar stays FLAT — one entry per module"* (memory: `feedback_sidebar_nesting_is_wrong_layer.md`).
- **No single source of truth for the module list**. The sidebar had its own manifest; the mobile `BottomNavbar` re-derived module identity from `GetRoleBasedPages(pathname, roleData)` against the same legacy manifest. Adding/renaming/reordering a top-level group meant editing multiple files in lock-step, with drift inevitable.
- **Mobile drawer drift**. The "More" sheet on mobile rendered submenu rows in inconsistent order vs the sidebar, with no shared registry policing the order. Family color cues, favorites surfacing, and search affordances were all bolted on per-surface.

Wave 2b's goal: introduce one canonical `MODULES` registry, restructure the sidebar to flat (section-header > module-row), and reconcile the mobile bottom-nav so both surfaces walk the same registry.

## 2. Implementation Status (as of 2026-04-25)

| Wave 2b # | PR | Title | Status |
|---|---|---|---|
| PR-S1 | [#409](https://github.com/Jicate-Solutions/MyJKKN/pull/409) | feat(nav): add MODULES constant — single source of truth for sidebar+bottom-nav | MERGED 2026-04-24 |
| PR-S2 | [#432](https://github.com/Jicate-Solutions/MyJKKN/pull/432) | feat(nav): sidebar flatten — section headers > one row per module | MERGED 2026-04-24 |
| PR-S3 | — | DROPPED — Cmd+K palette already covers the use case | Dropped |
| PR-S4 | [#482](https://github.com/Jicate-Solutions/MyJKKN/pull/482) | refactor(BottomNav): read module list from MODULES constant (Option A) | MERGED 2026-04-25 |
| PR-S5 | [#488](https://github.com/Jicate-Solutions/MyJKKN/pull/488) | feat(Sidebar): sync section order with mobile bottom-nav via MODULES | OPEN (Ready) |
| PR-S6 | — | TBD — likely "hide sidebar on mobile" via `hidden lg:block` | Pending |

**Outside the Wave 2b numbering but related:**

- [#486](https://github.com/Jicate-Solutions/MyJKKN/pull/486) — `feat(BottomNav): extend BottomNavItem with tile variant for More-drawer grid`. MERGED 2026-04-25. Replaced closed #483 (which violated the extension principle). NO Wave 2b PR-Sx label.
- [#475](https://github.com/Jicate-Solutions/MyJKKN/pull/475) — `fix(nav): close chip-filter leak on /admission/marketing + /admission/data-quality`. MERGED. Outside Wave 2b.

## 3. Wave 2b Ship Plan — actual sequence as shipped

### PR-S1 (#409) — MODULES constant

Added `lib/navigation/modules.ts`. Data-only, zero visible change, no consumers at merge time.

- `Module` interface: `{ slug, label, icon, section, hasNavConfig }`
- `MODULES: Module[]` — **35 entries** (34 derived from `route-manifest.generated.ts` top-level + 1 special empty-slug `'Dashboard'` for `/`)
- Helpers: `getModuleBySlug(slug)`, `getModuleSlugFromPath(pathname)`, `getModulesBySection()` (returns `[section, modules[]]` tuples in declaration order, preserving today's grouping)
- Drift caught during build: `/documents` was a dead sidebar link (entry in `sidebarMenuLink.ts`, no `app/(routes)/documents/` directory). Excluded from MODULES; removed from sidebar in PR-S2.
- Sat unused for ~13 days as speculative dead code; #482 became its first real consumer.

### PR-S2 (#432) — Sidebar flatten

Restructured the sidebar per the 2026-04-22 directive *"sidebar stays FLAT — one entry per module"*.

| Before | After |
|---|---|
| 184 inline entries stacked 2-3 deep | ~8 section headers x ~34 module rows |
| Inline `<CollapseMenuButton>` per module | One simple `<Link>` per module row |
| Section headers = non-interactive text | Clickable chevron-rows that toggle section collapse |
| No persistence | Collapse state persisted to `localStorage` key `myjkkn.sidebar.collapsed-sections` |

Files (4):
- `lib/sidebarMenuLink.ts` — Net **−710 LOC**: submenus collapsed to module rows. Submenu data preserved on each row (feeds in-page tabs after navigation).
- `components/Navbar/menu.tsx` — Renderer switches to clickable section headers; inline submenu expansion deleted.
- `lib/sidebar-validator.ts` — Updated for new structure.
- `hooks/use-sidebar-collapsed-sections.ts` (new) — Per-user `localStorage` state hook with SSR-safe hydration.

Net diff: **+421 / −1,049 = −628 LOC**. Permission checks (`GetPages` multi-role merging, `is_super_admin` bypass, institution scoping, feature-flag filters, PWA-install fallback), `<FavoriteStar>`, keyboard-shortcut badges, icon-only rail tooltips, and `<CommandPalette>` integration — all unchanged.

### PR-S3 — DROPPED

Originally planned: a `<SidebarFlyout>` hover panel reading `menu.submenus` data on each module row. Dropped on empirical inspection of the existing Cmd+K palette, which already covers recent / frequent / contextual / restricted-page surfacing. A second hover-flyout surface would have been redundant.

### PR-S4 (#482) — BottomNavbar reads MODULES (Option A)

The mobile `BottomNavbar` previously sourced its module list from `GetRoleBasedPages(pathname, roleData)` against the legacy sidebar manifest. PR-S4 made it the **first real consumer of `MODULES`**.

- Top-level group ORDER + IDENTITY now driven by `MODULES.getModulesBySection()`
- Submenus per group continue to come from `sidebarMenuLink.ts` (MODULES intentionally lacks submenu data; re-deriving them was held out of scope)
- UX paradigm preserved exactly: 4 group icons + Search + More button, submenu sheet, favorites, active-state highlighting — all UNCHANGED
- Single file, **+36 / −9 lines**. Behavioral preservation: same UX, different data flow.

**Why "Option A":** The original (lost) spec's R6 prescribed a greenfield "horizontal-scroll strip of 34 chips" — but reality already had a working `BottomNavbar` with group/submenu UX. Option A = refactor the data source, preserve the UX.

Step-2.6 discovery-test re-verification (per `/myjkkn-chain`):

| Test | Pre-fix | Post-fix | Verdict |
|---|---|---|---|
| Bottom-nav button count on `/dashboard` | 6 | 6 | Equal |
| Button labels (in order) | `[Overview, User Management, Applications, Favorites, Search, More]` | byte-identical | Equal |
| More-menu first 50 items | 50 items | byte-identical | Equal |
| Bottom-nav on `/admission` and `/hr` | 6 buttons, same labels | 6 buttons, same labels | Equal |

### PR-S5 (#488) — Sidebar reads MODULES

Desktop sidebar now reads top-level section ORDER + IDENTITY from the same `MODULES.getModulesBySection()` that the mobile bottom-nav uses post-#482. Both surfaces stay in lock-step automatically.

- Single file: `components/Navbar/menu.tsx`, **+48 / −2 lines**
- Pattern: Map-by-label → walk MODULES order → emit if matched + non-empty → drop empty (copied verbatim from #482's canonical 4-step pattern)
- Forward-compat: sections in `sidebarMenuLink` but not yet in `MODULES` trail at the end (visible, don't vanish) — encourages MODULES updates without surprise
- Permission filter (`GetRoleBasedPages`) UNCHANGED; reorder runs AFTER the filter

After this lands: adding/renaming/reordering a section in `MODULES` reflects in BOTH desktop sidebar AND mobile bottom-nav with zero parallel maintenance.

### PR-S6 (TBD) — Hide sidebar on mobile

Likely 1-line change to `AdminPanelLayout` (`hidden lg:block`). Currently the bottom-nav coexists with an offscreen sidebar instance on `< lg` viewports; this PR removes the orphan sidebar. Pending.

## 4. Outside the Wave 2b numbering

### PR #486 — More-drawer tile-grid redesign

Replaced closed PR #483 (which violated the extension principle by creating parallel components). Extended `BottomNavItem` with a `variant: 'strip' | 'tile'` prop instead of forking. **Zero new files**, three files modified.

One-handed thumb-zone layout:

| Zone | Content |
|---|---|
| TOP — Sheet header | "All Menus" + "N sections" count |
| MIDDLE — scrollable | **4-column tile grid, ONE TILE PER GROUP** (not per submenu). Tap → navigate to group's first menu; in-page tabs handle deeper nav |
| BOTTOM-MID — sticky | **Favorites — horizontal scroll strip** (chip-style, swipe →) |
| BOTTOM — sticky | **Search bar** (full-width, opens CommandPalette via `useCommandPalette().open()`) + **black × close** in bottom-right thumb zone |

Family color palette (inline `GROUP_TILE_GRADIENTS` map, keyed by canonical `groupLabel` from `lib/sidebarMenuLink.ts`):

- **slate** → Operations / Admin (Overview, User Mgmt, Org Mgmt, Administration)
- **blue** → Applications (Applications, App Management)
- **indigo / violet / purple** → Academic family (Academic, Learners, Faculty, Learning, VAC, Learners Council)
- **rose** → People / HR (Employee Mgmt, HR)
- **amber / orange** → Living / Wellness (Campus Living, Health, Work Pulse)
- **pink / fuchsia** → Admissions / Innovation (Admission CRM, Events, Startup Studio, Solution Hub)
- **emerald / teal / sky** → Finance & Resources (Accounts, Resource Mgmt, Service Requests)
- **cyan** → Performance / Compliance (OKR, Audit, Accreditation)
- **zinc** → System

Permission filter UNCHANGED — `groups` prop already pre-filtered by `GetRoleBasedPages` + `usePermissions` flow upstream.

Step-2.6 verification:

| Role | Group tiles | Favorites | Search | Close |
|---|---|---|---|---|
| `director@jkkn.ac.in` | **25** (full set) | 9 chips | yes | yes |
| `test.student@jkkn.ac.in` | **4** (Resource Mgmt, Service Requests, Learners Council, System) | 9 chips | yes | yes |

## 5. Architectural decisions locked

- **Sidebar stays FLAT** — one row per module. Submenus are data attached to each row, surfaced via in-page tabs after navigation. (Memory: `feedback_sidebar_nesting_is_wrong_layer.md`.)
- **MODULES is the single source of truth** for the top-level module list. Both surfaces walk it.
- **Permission filter runs FIRST** — `GetRoleBasedPages` + `usePermissions` produce the filtered set; the MODULES walk reorders that set. Sections with zero accessible menus are dropped.
- **Section renames must update BOTH** `lib/navigation/modules.ts` AND `lib/sidebarMenuLink.ts` in lock-step (PR-S5's join breaks otherwise).
- **Extension over creation** — when adding a tile variant, a hover surface, etc., extend the existing component with a `variant` prop. Don't fork. (Memory: `feedback_read_config_primitives_before_per_file_fixes.md`. PR #483 was closed for violating this; #486 corrected it.)

## 6. Drift fixed during implementation (vs the original lost spec)

| Original (lost) spec | Live reality | Resolution |
|---|---|---|
| Breakpoint: `md` (768px) | `lg:hidden` (1024px) | Live wins. Spec now says `lg`. |
| R6: "build flat horizontal-scroll strip of 34 chips" | Existing BottomNavbar with group/submenu UX | PR-S4 Option A — refactor data source, preserve UX |
| R9: "orphan count = 0" | Build runs `npm run check:nav --max-orphans=99` | Tightening is a separate sprint goal |

## 7. Open questions / next pending

- **PR-S5 (#488)** — currently OPEN (Ready). One click from merge. Verify state with `gh pr view 488 --json state` before treating as shipped.
- **PR-S6** — mobile sidebar hide (1-line). Awaiting dispatch.
- **Section renames** (drop "Management" suffix etc.) — separate PR in flight.
- **Section merges** (Applications ⊕ App Mgmt; Employee Mgmt ⊕ HR; Learning ⊕ VAC) — depends on renames.
- **Submenu data into MODULES** — currently submenus stay on `sidebarMenuLink.ts` rows. Re-deriving them into MODULES is intentionally out of scope; would unify all data flow but doubles the MODULES file size.

## 8. Memory references

- `feedback_specs_decay_verify_reality.md` — exactly this saga (the original spec drifted from reality across 3 axes; PR-S4 reconciled).
- `feedback_commit_after_every_write.md` — why this very spec file was lost. Now committed.
- `feedback_read_config_primitives_before_per_file_fixes.md` — extension principle that #483 violated and #486 corrected.
- `feedback_sidebar_nesting_is_wrong_layer.md` — why sidebar stays flat.
- `feedback_discovery_test_is_verification_test.md` — Step-2.6 discipline applied in PR #482 and #486 verification tables above.
