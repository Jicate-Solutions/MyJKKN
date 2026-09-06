# MyJKKN Documentation Index

Canonical index of all specs, architecture docs, feature docs, and guides in the MyJKKN repo. Before creating any new documentation, check this index — if the doc exists, UPDATE it rather than create a duplicate.

Last updated: 2026-04-24

---

## Specs

Architecture and design specs live under `specs/` at the repo root (not under `docs/`). Index them here for discoverability.

- [specs/counselor-taxonomy-spec.md](../specs/counselor-taxonomy-spec.md) — Counselor taxonomy spec: 4 personas (admission, learner, staff, health). DRAFT awaiting Omm review.
- [specs/ai-pulse-usage-axis-and-graduation-flip-runbook-2026-07-26.md](../specs/ai-pulse-usage-axis-and-graduation-flip-runbook-2026-07-26.md) — AI Pulse prompt-build usage axis: reuse-signal substrate (decision #20) + the two-stage graduation flip/rollback runbook. Substrate shipped DARK; activation is the Director's call.
- [specs/ai-pulse-golive-flip-runbook-2026-07-26.md](../specs/ai-pulse-golive-flip-runbook-2026-07-26.md) — AI Pulse go-live flip runbook: consolidated Director-facing runbook to turn on all 4 dark AI Pulse features (prompt graduation, usage axis, Senior Learners leaderboard, reach-weighted publish). Exact flip + rollback SQL per feature, recommended sequence, preconditions, and verification reads. All flag names/defaults cross-checked against live prod.

---

## Architecture

- [docs/SPEC.md](SPEC.md) — Startup Studio portfolio intelligence spec
- [docs/SPEC-exceptions-privileges.md](SPEC-exceptions-privileges.md) — Exceptions + privileges spec
- [docs/SPEC-CALL-INTELLIGENCE-PIPELINE.md](SPEC-CALL-INTELLIGENCE-PIPELINE.md) — Call intelligence pipeline
- [docs/SPEC-EXOTEL-ADVANCED.md](SPEC-EXOTEL-ADVANCED.md) — Exotel advanced integration
- [docs/architecture/ai-max-lane-recovery-runbook.md](architecture/ai-max-lane-recovery-runbook.md) — AI Max-lane Windows box: how it's wired, health checks & recovery runbook
- [docs/architecture/2026-08-12-MIGRATION-ledger-drift-unrecorded-applied-versions.md](architecture/2026-08-12-MIGRATION-ledger-drift-unrecorded-applied-versions.md) — Seven `20260809*` accreditation migrations are live on production but absent from `supabase_migrations.schema_migrations`; the catalog evidence for each, why a blanket `db push` must never be used to reconcile it, and why backfilling the ledger was rejected as a one-way door
- [docs/architecture/2026-09-03-MIGRATION-duplicate-version-backlog.md](architecture/2026-09-03-MIGRATION-duplicate-version-backlog.md) — The other half of the ledger's unreliability: 349 versions on `main` are carried by more than one file, so 632 files can never own a ledger row and are silently skipped on apply (this is why `20260504_instasolver_substrate.sql` never ran); full per-version census, what a cleanup would actually touch, and why it is a Director decision rather than a pull request

---

## Features

See `docs/features/` for per-feature docs (admission CRM handoff, marathon ops, work-pulse, value-added courses, etc.)

---

## Fixes

See `docs/fixes/` for bug-fix writeups, organized by month (`YYYY-MM/`).

---

## Audits

- [docs/audit/2026-08-06-AUDIT-campus-living-permission-keys-by-area.md](audit/2026-08-06-AUDIT-campus-living-permission-keys-by-area.md) — Director decision 12, area 1 of N: the closed `campus_living` permission keys grouped by area, with distinct real holders counted live on production. 215 keys; 0 ungrantable, 0 effective-but-invisible, 61 ungranted, 1 granted to an empty role. Includes the "open these first" shortlist and the keys that need a Director call.
- [Test-pattern accounts and active academic years (2026-08-06)](audits/2026-08-06-AUDIT-test-accounts-and-active-academic-years.md) — read-only production audit, two sections. (A) 48 test-pattern accounts checked for real roles; revoking takes TWO layers because `is_admin()` (1,295 policies) reads `profiles.role`, which a `user_roles` delete never clears. (B) `academic_years.is_active` is true on 38 of 42 rows; the `ORDER BY start_date DESC LIMIT 1` idiom resolves 4 years wrong at Pharmacy and 2 at Dental, the enquiry importer throws PGRST116 and reports "not found", and ₹9.54 cr of deliberate forward bills means the extra years must NOT simply be deactivated.

See `docs/audit/` and `docs/audits/` for earlier audit writeups.

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

### ID Cards module (2026-07-24)
- `docs/modules/id-cards/2026-07-24-MODULE-id-cards.md` — ID Cards module doc: what it is, plain-words architecture (MyJKKN queue → Windows bridge polls every 5 s → Evolis Primacy 2 at the office), job statuses + how failures surface to the registrar, ops pointers (service `JKKNPrintBridge` on the BIOMETRIC box, log `C:\jkkn-bridge\bridge-service.log`), Evolis SDK license-review section with a ready-to-send confirmation ask for the Director, and CARRE candidate-evidence pointers for a future human-run audit (no scores assigned — interview required).
- `docs/modules/id-cards/2026-07-25-OPS-idcard-runbooks.md` — ID Cards ops runbooks (3): AGENT_PRINT_TOKEN rotation (placeholders only — generate → Vercel Sensitive env → no-op PR deploy → box `.ps1` via Notepad → 3-way verify); bridge `get_state()` v0.4 prep (Python diff sketch, paste-shuttle apply/rollback `.ps1`, no-print verification); and **duplex enable / both sides** (§3, refreshed 2026-08-14 — the cloud half is DONE, two production templates now carry a back and one has been rendered and eyeballed, so only the front-only `evolis_bridge.py` v0.3.1 remains, plus the YMCKO-vs-YMCKOK ribbon decision and one on-plastic flip-direction check; §3.5 records the 80-character address truncation that blocks any cohort batch). All three PREPARED, Director-executed at the Windows box only.

## Design System — read before any UI work

- [design-system/MASTER.md](../design-system/MASTER.md) — **Source of truth for tokens, surfaces, colour, radius and the shipped `components/ui` primitives. Read it BEFORE styling any page, component, or Tailwind class.** ⚠️ **Light is the shipped default theme** (`app/layout.tsx:232` sets `defaultTheme='light'`); dark is secondary, and **both must be checked before shipping**. Several tokens are theme-traps — `--secondary` is saturated yellow `#FACC15` in light, `--input` is a border not a fill, and `<Card>` uses `bg-background` not `bg-card`.

> This row exists because the repo-root `CLAUDE.md` is **gitignored** and therefore absent from `jicate/main` and from every worktree that `/ship-myjkkn` and `parallel-ship` create. This index **is** tracked, so it is the pointer that actually reaches worktree agents.

---
