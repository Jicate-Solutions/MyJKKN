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

See `docs/plans/` for implementation plans and `docs/modules/` for per-module documentation.

---

## How to add an entry

1. Create the doc following the naming convention: `YYYY-MM-DD-CATEGORY-title.md`
2. Add a one-line entry to the appropriate section above
3. Link using relative paths (`../specs/foo.md` or `fixes/bar.md`)
