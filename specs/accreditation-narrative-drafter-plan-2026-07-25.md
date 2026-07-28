# Grounded AI NAAC Narrative Drafter — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `executing-plans` to implement this plan task-by-task **only after Director approval**. This document is scope-first: it is the artifact to approve, not a licence to build.

**Goal:** Give each NAAC metric that already holds platform evidence an overnight, ₹0 AI-drafted *criteria narrative* — assessor-ready prose synthesised only from cited real evidence — that the owning Senior Learner edits and okays before it climbs the principal → director approval chain. Nothing the AI writes can contain an untraceable number, and nothing auto-submits.

**Architecture:** A dark, kill-switched Max-lane (`lane='max'`) `ai_job_types` job retrieves a metric's `quality_evidence_mappings` rows as its *only* fact source, prompts the model to synthesise prose with per-paragraph `source_id` citations, then a **deterministic post-check** rejects any draft whose numbers/dates/course-codes are not present in that evidence set. Approved output flows through the existing `accreditation_submissions` human chain. One new tiny `accreditation_metric_owners` table resolves the first-line editor with a never-orphan fallback.

**Tech Stack:** Next.js 15 (App Router) · Supabase Postgres (RLS + `SECURITY DEFINER` RPCs) · existing MyJKKN AI Max-lane worker (hardcoded Sonnet) · TanStack Query · existing `loop-evidence-service` / `accreditation-service` patterns.

---

## Guardrail (non-negotiable — the reason this build exists at all)

An AI that fabricates NAAC evidence is an institutional-fraud vector. The three-part gate below mirrors the SCF note-safety judge (grounded, source-cited, human-gated). **No phase may weaken it.** If a trade-off ever pressures grounding or the human gate, stop and escalate to the Director.

1. **Retrieval is the only fact source.** The job passes *only* the metric's evidence rows to the model. The model never queries the open database.
2. **Deterministic traceability post-check.** Every number, date, percentage, and course-code in the prose must appear in the evidence set, or the draft is marked `ungrounded` and cannot be approved.
3. **Two human approvals before any submit.** Owning Senior Learner → principal → director. The AI only *prepares*.

---

## Why this is the right target (evidence, 2026-07-25 live prod read)

- The accreditation module is **selectively dormant at exactly the human-narrative layer**: `quality_evidence_mappings` = 99 rows (auto-fed, last write **07-24**), `bos_meetings` active 07-24, `audit_cycles` = 6 (NAAC/NBA/NIRF, in-progress, a Q2 cycle deadline **this week**) — yet `accreditation_submissions` = **0 all-time**, `maturity_assessments` = 0. The auto-pipeline is alive; the *writing* never happens on-platform. That is the tedium signature, on an actively-mandated body → adoption unlock.
- **Honest caveats (carry into review):** the submission apparatus is only ~10 days old (cycles created 07-15) — this is "zero adoption of a new step," not "years of proven disuse." And `maturity_frameworks` = 0, so the maturity self-assessment sub-instrument is *unconfigured* (out of scope; not a tedium signal).

---

## Pilot surface (today's evidence-backed reach)

Metric-generic by design; today it lights up **~6 narratives** = evidence-backed `(institution × metric)` pairs:

| Metric | Name (data value; NAAC vocabulary) | Attribute | Live rows |
|---|---|---|---|
| `7.3.d` | Quality Assurance System — audits & performance assessment with feedback | 7 Governance | 47 (inst `5de4fba1`) |
| `7.3.f` | Quality Assurance System — periodic stakeholder-satisfaction survey with feedback | 7 Governance | 4 |
| `6.3.1` | Fresher induction / orientation — mentoring & wellbeing | 6 Extended Curricular | 1–2 |
| `6.3.2` | Fresher induction as institutional mentoring practice | 6 Extended Curricular | 1–2 |

Evidence spans **3 institutions** (`5de4fba1…`=47, `5736d86f…`=4, `b0b8a724…`=2). As the auto-pipeline lights up more metrics, the drafter covers them with no code change — reach is data-driven, not hard-coded.

---

## Dependency graph

```
Phase 0 (worktree + re-confirm substrate)
        │
Phase 1 (migration: owners table + submission columns + CHECK widen + kill-switch + job row) [DARK, not applied]
        │
   ┌────┴─────┬─────────────┐
Phase 2      Phase 3       Phase 5
(validator,  (retrieval +  (owner resolution +
 TDD, pure)   prompt)       fallback)
   └────┬─────┘                 │
     Phase 4 (Max-lane job = retrieve→synthesise→validate→persist)
        │                       │
        └───────────┬───────────┘
              Phase 6 (draft → verify → submit UI, per-role, permissions-audit registered)
                     │
              Phase 7 (self-gate + Ready PR; migration SQL handed to Director)
```

Parallelisable: **2 ∥ 3 ∥ 5** after Phase 1. Phase 4 needs 2+3. Phase 6 needs 4+5.

---

## Risk register (gotchas that have bitten this repo before)

| # | Risk | Mitigation (baked into the phases) |
|---|---|---|
| R1 | **Max-lane runs Sonnet, not Opus** — `model_id` is decorative on `lane='max'` (worker hardcodes `--model sonnet`). | Accepted for grounded synthesis (Director-confirmed). Documented; escalate to paid `lane='api'` only if prose quality proves short. |
| R2 | **Terminology gate** scans `.ts/.tsx/.md` and flags `student`/`faculty`/`class` — but NAAC prose *requires* that vocabulary. | Phase 6 adds an accreditation-output allowlist/exemption so the gate never corrupts assessor-facing strings. Plan prose itself uses JKKN terms; NAAC terms are quoted data. |
| R3 | **Dark kill-switch must gate the READ/EXEC path, not just writes** (prior incident). | Phase 4 checks the switch inside the job handler *and* Phase 6 gates the UI read; switch default `false`. |
| R4 | **DB CHECK/enum widening hides new rows** until the TS union + label maps + zod + option lists are swept. | Phase 1 widens `accreditation_submissions.status` CHECK **and** Phase 6 sweeps the TS `SubmissionStatus` union + labels + zod together. |
| R5 | **New user-facing module fails `npm run build`** on the permissions-audit coverage gate until registered in the 4-link chain. | Phase 6 registers keys + runs `npx tsx scripts/check-permission-audit-coverage.ts` before Ready. |
| R6 | **`anon` gets a default EXECUTE grant** on every new function. | Every new `SECURITY DEFINER` RPC: explicit `REVOKE EXECUTE … FROM anon, PUBLIC` + `GRANT` to `authenticated` (or `service_role` for the system-only enqueue RPC). |
| R7 | **Mgmt-API `database/query` can serve a stale read-replica** (~5-6h). | Phase 1 migration validation uses `BEGIN..ROLLBACK` on the write path; row-count re-checks note the staleness window. |
| R8 | **Silent dead-end** if a metric has no owner. | Phase 5 fallback chain never returns null: owner → committee chair → IQAC/admin queue. |
| R9 | **CI skips TypeCheck/terminology/reachability on DRAFT PRs.** | Phase 7 self-gates all of them locally before flipping to Ready. |
| R10 | **Job runs as `service_role`** (RLS-bypassing) — must be scoped by explicit params, output human-gated. | Phase 4 scopes every query by explicit `institution_id`+`metric_code`; no unscoped reads; output never auto-submits. |

---

## Phase 0 — Worktree + substrate re-confirmation

**Not feature code — environment + a stale-premise guard.**

**Steps**
1. `git -C /Users/omm/PROJECTS/MyJKKN fetch jicate main`
2. `git worktree add .claude/worktrees/accred-drafter jicate/main` → `cd` in, symlink `node_modules`, copy `.env.local`, use the **real** `SUPABASE_SERVICE_ROLE_KEY` from `.env.production.local` (placeholder breaks middleware).
3. Re-run the evidence read: `quality_evidence_mappings` still ≥ the pilot rows for NAAC `7.3.d/7.3.f/6.3.1/6.3.2`. If evidence has vanished → STOP and report.

**Acceptance:** worktree on `jicate/main`; `npm run dev` boots; evidence rows still present.

---

## Phase 1 — Data model (migration, dark, NOT applied)

**Files**
- Create: `supabase/migrations/<ts>_accreditation_ai_narrative_drafter.sql`
- Update (canonical): `supabase/setup/01_tables.sql`, `03_policies.sql`, `02_functions.sql` (+ `supabase/SQL_FILE_INDEX.md`)
- Config row via the established config-table pattern (`docs/architecture/config-table-pattern.md`).

**Schema (sketch — final DDL in the migration):**
- `accreditation_metric_owners` (`id uuid pk`, `institution_id uuid`, `body_code text`, `metric_code text`, `owner_user_id uuid`, `created_at/by`, unique `(institution_id, body_code, metric_code)`), RLS on, permission-gated policies.
- `accreditation_submissions` add columns: `ai_narrative_md text`, `ai_citations jsonb`, `ai_grounding_verdict text CHECK (in 'grounded','ungrounded')`, `ai_ungrounded_tokens jsonb`, `ai_generated_at timestamptz`, `ai_job_type text`; **widen `status` CHECK** to add `'ai_drafted'`.
- Kill-switch config row `accreditation.ai_drafter.enabled = false`.
- New `ai_job_types` row: `job_type='accreditation_naac_narrative_draft'`, `lane='max'`, `enabled=false`, `schedulable=true`, `interactive=false`, `output_target` = submission row, `input_schema` = `{institution_id, metric_code, period_label}`, `monthly_spend_cap_inr` set, `model_id='sonnet'` (decorative — see R1).
- System-only enqueue RPC `fn_accreditation_enqueue_narrative_drafts()` — `SECURITY DEFINER`, `REVOKE … FROM anon, PUBLIC`, `GRANT … TO service_role` (cron/system-only).

**Steps:** write DDL → validate in a single `BEGIN; … ROLLBACK;` batch via mgmt API (assert: table exists, RLS enabled, CHECK widened, kill-switch=false, `anon` has no EXECUTE on the new RPC) → **do not apply** (Director owns apply; show SQL first).

**Acceptance:** the txn applies then rolls back with every assertion passing; anon-lock proven inside the same batch.

---

## Phase 2 — Deterministic grounding validator (fraud-gate core, TDD, pure) 🔒 highest risk

**Build this before the AI touches anything.** Pure function, no DB, no model.

**Files**
- Create: `lib/services/accreditation/grounding-validator.ts`
- Test: `__tests__/lib/services/accreditation/grounding-validator.test.ts`

**Contract:** `validateGrounding(narrativeMd: string, evidence: EvidenceRow[]): { verdict: 'grounded'|'ungrounded'; ungroundedTokens: string[] }` — extracts every number, percentage, date, and course-code from the prose; builds the allowed-token set from evidence metadata (`course_code`, windows, `input_avg_understood`, `outcome_avg_understood`, `outcome_lift`, vote tallies, response counts, `measured_at`); asserts each prose token ∈ allowed set (with an explicit rounding/format policy).

**Test list (write failing first, one at a time):**
1. A clean draft citing only real evidence numbers → `grounded`.
2. A draft with one invented figure (`92%`) not in evidence → `ungrounded`, token listed.
3. Format equivalence: `3.8` matches evidence `3.80` (documented tolerance); `3.9` does not.
4. Course-code match: `MR3691` present ✓; `MR9999` → ungrounded.
5. Date match against `measured_at`/window bounds; out-of-set date → ungrounded.
6. Empty evidence set + any number in prose → ungrounded (never "vacuously grounded").
7. Percentages/ratios derived correctly-vs-fabricated (e.g. `3/5 votes better` vs `4/5`).

**Acceptance:** all tests green; an injected fake number is always caught; the function is used by Phase 4 as the sole approval gate.

---

## Phase 3 — Evidence retrieval + grounded prompt builder

**Files**
- Modify/extend: `lib/services/accreditation/accreditation-draft-service.ts` (new) reusing `loop-evidence-service` metadata contract.
- Test: snapshot/unit tests for the prompt.

**Functions**
- `getGroundingSet(client, {institutionId, metricCode})` → `{ metric: {code,name,category}, rows: EvidenceRow[] }`. Reads `quality_evidence_mappings` + `sh_accreditation_metrics` (name/category only — `verification_requirements`/`data_sources` are NULL, do not rely on them).
- `buildGroundingPrompt(metric, rows, period)` → strict instruction: *"These rows are the ONLY facts. Cite each factual sentence with its `source_id`. Do not state any number/date/course-code not present. If evidence is thin, say so."*

**Acceptance:** prompt contains only retrieved facts (unit test asserts no other data path); snapshot test of the prompt built from the real `7.3.f` sample row; thin-evidence path yields an honest empty-state instruction.

---

## Phase 4 — The Max-lane job (retrieve → synthesise → validate → persist)

**Files**
- Create: the job handler wired to `job_type='accreditation_naac_narrative_draft'` (follow an existing Max-lane handler as the template).
- Create: `app/api/cron/accreditation-enqueue-narratives/route.ts` (Bearer `CRON_SECRET`, calls `fn_accreditation_enqueue_narrative_drafts`, service-role).

**Flow:** claim job → **check kill-switch first** (if `accreditation.ai_drafter.enabled=false` → no-op, return `{enabled:false}`) → `getGroundingSet` (Phase 3) → model call (Sonnet, max-lane) → `validateGrounding` (Phase 2) → upsert `accreditation_submissions` row with `status='ai_drafted'`, `ai_narrative_md`, `ai_citations`, `ai_grounding_verdict`, `ai_ungrounded_tokens`. **Ungrounded drafts are persisted but flagged, never silently dropped and never approvable.**

**Acceptance:** with switch off, job no-ops; with switch on in a test context, produces a draft carrying a verdict; a deliberately fabricated model output is caught by the validator and stored `ungrounded`; every read is scoped by explicit `institution_id`+`metric_code` (R10).

---

## Phase 5 — Owner resolution (never-orphan)

**Files**
- Extend `accreditation-draft-service.ts`: `resolveMetricOwner(client, {institutionId, metricCode})`.
- Test: one case per fallback branch.

**Chain (rule 27 — no silent dead-end):** configured `accreditation_metric_owners.owner_user_id` → else `accreditation_committees.chair_user_id` for `(institution, 'NAAC')` → else IQAC/admin queue (a resolvable role, never `null`). Seed the ~6 pilot owners by hand.

**Acceptance:** unit tests cover all three branches; a metric with no configuration still yields a named editor.

---

## Phase 6 — Draft → verify → submit UI (per-role)

**Files**
- Create: `app/(routes)/accreditation/naac/narratives/page.tsx` (+ `[submissionId]/page.tsx`) — list drafts the current user owns; detail shows prose with **inline click-through citations**, a grounding-verdict badge, edit-in-place, and okay/principal-approve/director-submit actions + revision loop.
- Modify: TS `SubmissionStatus` union + label maps + zod (R4 sweep with the Phase 1 CHECK widen); `lib/constants/permissions.ts` (`accreditation.naac.narrative.view/edit/approve`); `lib/sidebarMenuLink.ts` + `MENU_PERMISSIONS`; terminology allowlist for assessor output (R2).

**Hard UI rules:** an `ungrounded` draft shows a **blocking banner** and its approve action is disabled. No control auto-submits. Permission-gated per role.

**Acceptance:** persona-harness snapshot renders for the owner Senior Learner, principal, director; ungrounded draft cannot be approved; `npx tsx scripts/check-permission-audit-coverage.ts` passes; `npm run build` passes.

---

## Phase 7 — Self-gate + Ready PR

**Steps (CI skips these on draft PRs — do them locally):** scoped `tsc` (against generated `database.types.ts`) · terminology check on the delta · permissions-audit coverage · reachability · migration `BEGIN..ROLLBACK` transcript captured · persona screenshots attached · then flip PR **Ready** on the `jicate` remote.

**Acceptance:** every required gate green; PR Ready; migration SQL presented for the Director to apply; kill-switch + go-live flip documented in the PR body.

---

## Explicitly OUT of scope (this pilot)

Maturity self-assessment (`maturity_frameworks`=0, unconfigured) · non-NAAC bodies · a full owner-assignment admin UI (hand-seed the 6) · Opus/paid-lane synthesis · auto-submit of any kind · applying the migration or merging/deploying (Director owns all three).

## What I will NOT do without a further explicit go-ahead

Merge · deploy · apply the migration · flip `accreditation.ai_drafter.enabled` to true · push to `origin` or `omm-dev`→`main`.
