# Policy Page Pattern — Director-Grade Config Surfaces

**Status:** Substrate landed 2026-05-07 (PR #TBD). 11 pages target migration.
**Owner:** Director facing — UX standard enforced via build gate (planned).

## Why this exists

Director's standing rule (memory `feedback_policy_decisions_must_be_config_rows.md`): every policy decision = config-table row + super_admin UI to write + reader fn. **The substrate this doc describes adds the missing fourth requirement:** that super_admin UI must be readable by a non-coder Director without a glossary.

The original tier-policy admin page (PR #736) shipped passing the first three rules but failing the fourth — Director called it out 2026-05-07: *"any tom dick and harry should be able to understand."* PR #748 fixed tier-policy with bespoke JSX. PR #752 fixed lead-stage-policy with similar bespoke JSX. **This pattern fixes the systemic problem so the next 50 config pages ship Director-grade by default.**

## The 3-criteria Director standard

A config page passes if:

1. **English consequences** — every visible label is plain English. NO raw enum values, SQL function names, migration filenames, or DB column names rendered to Director.
2. **Visual cascade for ordered data** — if the data has an inherent ORDER (`tier_order`, `priority`, `sequence`, `sort_order`), the layout visually expresses that order — numbered step cards stacked vertically with "↓ if no match" arrows.
3. **Daily operation** — Tom-Dick-Harry test: a non-technical Director can sit down without training and understand what each button/toggle/field does, and what changes when they flip it.

## The 3 shapes config pages cluster into

After auditing 18 admin config pages on 2026-05-07:

### Shape A — Cascade Steps (ordered, scope-precedence)

Data has `tier_order` / `sort_order` / similar. Often has scope precedence (global default rules + per-institution overrides). The order is the whole point of the data.

Use `<CascadeStepList>` from `lib/admin/policy-shell`.

Examples: tier-policy ✓, lead-stage-policy ✓, rule-types (HIGH severity, pending fix).

### Shape B — Settings Panel (unordered key-value, often one global row)

Data is a set of key-value pairs (frequently in JSONB on a single `platform_policies` / similar row). Each setting is independent — no ordering. Each value benefits from a "consequence text" line ("If you increase this, the cron processes more leads per run but takes longer.").

Use `<SettingsPanel>` from `lib/admin/policy-shell`.

Examples: counselor routing-config (HIGH), alert-thresholds (HIGH), whatsapp-limits (MED), telephony-policies (MED).

### Shape C — Lookup Table (FROM → TO mapping)

Data maps a key/identifier to a target/value. Each row has a clear "this → that" semantic. English column headers replace DB column names; per-row hint text describes the consequence ("This data will be deleted after N days.").

Use `<LookupTable>` from `lib/admin/policy-shell`.

Examples: landing-pages (MED), nav-config (MED), retention-policies (MED), dashboard-drilldowns (MED), exophone-mapping ✓ already passes.

## The substrate

```
lib/admin/policy-shell/
├── types.ts              — schema definitions for all 3 shapes
├── PolicyPageShell.tsx   — page wrapper + super_admin gate + explainer
├── CascadeStepList.tsx   — Shape A
├── SettingsPanel.tsx     — Shape B
├── LookupTable.tsx       — Shape C
├── PolicyFormShell.tsx   — schema-driven create/edit dialog
└── index.ts              — barrel export
```

Every primitive accepts a **schema** (declarative description of the page's policy semantics) plus the live data + handlers. The schema is the source of truth — a single file change updates labels, hints, and consequences across the cell, the form, and any future audit log.

## Migration path

| Page | Severity | Shape | Status |
|---|---|---|---|
| `/admin/counselors/tier-policy` | — | A | ✅ PR #748 (bespoke; can migrate to substrate later) |
| `/admin/admission/lead-stage-policy` | — | A | ✅ PR #752 (bespoke; can migrate later) |
| `/admin/counselors/rule-types` | HIGH | A | 🟡 Migrate via substrate |
| `/admin/counselors/routing-config` | HIGH | B | 🟡 Migrate via substrate |
| `/admin/counselors/alert-thresholds` | HIGH | B | 🟡 Migrate via substrate |
| `/admin/landing-pages` | MED | C | 🟡 Migrate via substrate |
| `/admin/nav-config` | MED | C | 🟡 Migrate via substrate |
| `/admin/retention-policies` | MED | C | 🟡 Migrate via substrate |
| `/admin/dashboard-drilldowns` | MED | C | 🟡 Migrate via substrate |
| `/admin/telephony-policies` | MED | B | 🟡 Migrate via substrate |
| `/admin/whatsapp-limits` | MED | B | 🟡 Migrate via substrate |
| `/admin/counselors/routing-errors` | LOW | (read-only) | 🟢 Minor jargon cleanup, no substrate needed |
| `/admin/whatsapp-byow/secret-rotation` | LOW | (informational) | 🟢 Minor cleanup |

## Severity rubric (for future audits)

**HIGH** — at least ONE of the following triggers:
- Raw enum value (e.g. `institution_and_source`, `scope_type='global'`) appears in a rendered table cell, column header, label, badge, dropdown option, or placeholder.
- SQL function name appears in any rendered text.
- Migration filename appears in any rendered text.
- DB column name appears as a `<Label>` or column header without relabeling.

**MEDIUM** — at least ONE of the following AND no HIGH triggers:
- Ordered data rendered as flat sortable table instead of cascade.
- Field labels mostly plain English with minor jargon.
- Dialog descriptions reference internal mechanism without explaining consequences.
- Empty state mentions migration filenames or composite-key semantics.

**LOW** — passes labels and ordering tests but has minor toast-message phrasing or unlabelled UI affordances.

**PASS** — none of the above.

CRITICAL: only what RENDERS to Director counts. Code comments and JSDoc are not failures.

## Build gate (planned)

Script `scripts/check-policy-shell-adoption.ts` will run as part of the build CHECK-A list (per PR #737). It walks `app/(routes)/admin/**/page.tsx` files and ensures any page importing a config service from `lib/services/**` either imports from `lib/admin/policy-shell/` OR is on a small allowlist (the bespoke tier-policy and lead-stage-policy pages stay allowlisted until they migrate).

## Cross-paradigmatic move (Director's framing)

Iterative per-page rewrites treat the symptom. The substrate is the [Einstein/Darwin reframe](https://docs.anthropic.com): one body plan that spawns Director-grade UX automatically for the next 50 config pages. The standard moves out of three PRs and Director's head into code + a build gate.
