# MyJKKN Documentation Index

Canonical index of all specs, architecture docs, feature docs, and guides in the MyJKKN repo. Before creating any new documentation, check this index — if the doc exists, UPDATE it rather than create a duplicate.

Last updated: 2026-04-24

---

## Specs

Architecture and design specs live under `specs/` at the repo root (not under `docs/`). Index them here for discoverability.

- [specs/counselor-taxonomy-spec.md](../specs/counselor-taxonomy-spec.md) — Counselor taxonomy spec: 4 personas (admission, learner, staff, health). DRAFT awaiting Omm review.

---

## Architecture

- [docs/SPEC.md](SPEC.md) — Startup Studio portfolio intelligence spec
- [docs/SPEC-exceptions-privileges.md](SPEC-exceptions-privileges.md) — Exceptions + privileges spec
- [docs/SPEC-CALL-INTELLIGENCE-PIPELINE.md](SPEC-CALL-INTELLIGENCE-PIPELINE.md) — Call intelligence pipeline
- [docs/SPEC-EXOTEL-ADVANCED.md](SPEC-EXOTEL-ADVANCED.md) — Exotel advanced integration

---

## Features

See `docs/features/` for per-feature docs (admission CRM handoff, marathon ops, work-pulse, value-added courses, etc.)

---

## Fixes

See `docs/fixes/` for bug-fix writeups, organized by month (`YYYY-MM/`).

---

## Guides

- [Instagram Business Login — Setup & Connect (Track 3)](guides/2026-06-10-GUIDE-instagram-login-connect-setup.md) — Meta app config, env vars, app testers, per-account connect flow for Page-less dept IG insights

See `docs/plans/` for implementation plans and `docs/modules/` for per-module documentation.

---

## How to add an entry

1. Create the doc following the naming convention: `YYYY-MM-DD-CATEGORY-title.md`
2. Add a one-line entry to the appropriate section above
3. Link using relative paths (`../specs/foo.md` or `fixes/bar.md`)

### CARE Audit (2026-06-12)
- `docs/guides/2026-06-12-GUIDE-care-audit-framework.md` — JKKN CARE Audit Framework v1.0 (canonical, Director-authored): 20-item Clarity/Appreciation/Recognition/Empowerment audit, 0–4 scale, CARE Index /80, gap rules, cadence table. Audit any initiative against THIS, don't re-derive.
- `docs/modules/pde/2026-06-12-AUDIT-care-pde-demonstrations.md` — first application: PDE demonstrations pre-pilot audit (CARE Index 34/80; Appreciation 5/20 critical; corrective moves feed connector PR 2 + pilot rituals).

### PDE taxonomy split (2026-06-14)
- `docs/modules/pde/2026-06-14-DECISION-pde-category-taxonomy-split.md` — 🟡 **DECISION REQUIRED** (Director). PDE has 3 category vocabularies: durable-value (7, live spine, `pde_demonstrations.category_key`, 0 rows), capability (8, separate skill tree, `pde_capabilities.category`, 1 stray row), faculty filter (3-chip mock stub). They're orthogonal axes, not rival labels. Options A (collapse to one) / B (two explicit axes, recommended) / C (do nothing). Cheapest to fix NOW (no data to migrate). Resolves friction X1.
