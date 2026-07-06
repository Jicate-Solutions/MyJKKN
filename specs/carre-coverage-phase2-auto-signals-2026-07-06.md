# CARRE Coverage Map — Phase 2: evidence-grade auto-signals

**Date:** 2026-07-06
**Stacks on:** Phase 1 (`20260705140000_carre_coverage.sql`, `fn_carre_module_coverage`, `/audit/care/coverage`).
**Status:** additive-only. Ships one honest signal; the mechanism is built for more when the data earns them.

## 1. What Phase 2 is (and is not)

Phase 1 shows, per people-facing module, the status of its most-recent **human** CARRE
audit (not-checked / current / needs-re-check / 🔴 frozen × /100). Phase 2 adds a
**parallel, clearly-labeled "auto-derived" lane** computed from live participant data.

**Hard invariants (non-negotiable):**
- The auto lane is **never merged into and never overrides the human /100**. It renders
  in its own column, visually distinct, labeled *auto-derived*.
- **Respect (RS1–RS5) is NEVER auto-scored.** Dignity is only ever human-observed. The
  auto RPC is physically incapable of emitting a `CARRE-RS*` code (whitelist + assertion).
- **Evidence-grade only.** A signal may exist only where the underlying data reflects a
  *real participant experience*. A config flag being "on", or a feature merely existing in
  code, or an empty table, is **not** a signal — scoring from it is a false green/red.

## 2. The fill-rate gate (why 4 scoped candidates → 1 shipped)

Verbally scoped this session were four CARRE items. The fill-rate probe (2026-07-06,
prod `kvizhngldtiuufknvehv`) invalidated all four *as originally mapped*:

| Candidate | Source | Reality | Verdict |
|---|---|---|---|
| **A4** median coverage | `campus_living_recognition` | **0 rows** | ❌ empty table → false green |
| **R3** distribution | `campus_living_recognition` | **0 rows** | ❌ empty table → false green |
| **A3** fast loops | `session_feedback` | 1,274 rows, **inbound only** | ❌ no faculty-response timestamp → loop's return leg does not exist |
| **E5** voice-changes-system | `session_feedback` | 1,274 rows, **inbound only** | ❌ no "acted-upon / changed" field → nothing to measure |

A3/E5 fail for the subtle reason: `session_feedback` captures the learner's experience
*going in* (`understood` 1–5, a checklist, `free_text`) but has **no response / change
substrate** — so "fast **loop**" and "voice **changes** the system" have no return half to
score. Scoring them would be the same category error as scoring from a flag.

## 3. The one honest signal that survives

`session_feedback` (1,274 real `source='async'` submissions; maps to the **Academic**
module) *does* honestly support a **participation** signal — but only with the right
denominator.

- Platform-wide (all 81,496 present attendance slots ÷ submitted) = **2%** — **rejected**:
  it divides a scoped pilot's feedback by every class on campus (a denominator mismatch →
  false *red*).
- Within the **287 sessions where feedback was actually collected** (11,076 present
  learners) = **12%** — **shipped**: it measures the real participant experience of the
  loop where the loop runs, without punishing the module for classes the pilot never reached.

**Signal definition — `FEEDBACK_PARTICIPATION` (module `academic`):**
> Of learners marked **Present** in a session that collected ≥1 post-class feedback in the
> last 30 days, the share who submitted their own feedback.
> `value_pct = submitted / present_in_active_sessions`.

Consistency check: `submitted (1,274)` == total `session_feedback` — every feedback row
maps to a present learner in an active session (no orphans, no double count).

## 4. Guards

- **k≥3 floor:** emit only when `denominator ≥ 3`; otherwise the module shows **no
  auto-signal** (never a fabricated 0). Protects a tiny cohort from de-anonymization.
- **Leadership-gated:** `is_super_admin() OR is_admin() OR user_has_permission('audit.cycle.view')`
  — mirrors `fn_carre_module_coverage`. Not an any-authenticated enumeration surface.
- **NULL-institution:** the read is platform-wide leadership-only (no per-institution row is
  exposed), and `session_feedback.institution_id` is 100% non-null — so no
  `role_has_institution_access(NULL)` leak vector.
- **Respect-never-emittable:** signal codes are a fixed whitelist of neutral, non-CARRE codes;
  the RPC raises if a code matches `^CARRE-RS`.

## 5. Build (additive-only)

- New RPC `fn_carre_module_auto_signals()` — **never** edits any `fn_care_*` / `fn_carre_*`
  or the human /100. `REVOKE … FROM anon, PUBLIC; GRANT … TO authenticated, service_role;`
- `CarreCoverageService.getAutoSignals()` + `useCarreAutoSignals()` hook.
- `/audit/care/coverage/page.tsx`: one new **auto-derived** column; only `academic`
  populates, every other module shows `—`.
- Migration applied via Management API **after** merge (deploy ships code, not migrations).

## 6. Verify (live, prod)

- RPC returns `academic FEEDBACK_PARTICIPATION value_pct=12 denominator=11076`.
- No `CARRE-RS*` value ever appears in output.
- `anon` EXECUTE on the new RPC = 0.
- The human /100 column is byte-for-byte unchanged.
- Authed render on prod shows the auto column labeled *auto-derived*, academic only.
