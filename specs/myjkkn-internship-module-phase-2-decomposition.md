# Internship Module — Phase 2 Decomposition

**Anchor:** `specs/myjkkn-internship-module-spec.md` (commit 9cc9bcc5e — 28 locked decisions)
**Date locked:** 2026-05-10
**Outcome metric:** `digital_posting_adoption_pct ≥ 50%` by 2026-08-08; kill threshold <15%
**Baseline:** ~0% as of 2026-05-08 (currently 100% manual via Google Sheets + chat photos)
**Verdict query:** `SELECT 100.0 * COUNT(*) FILTER (WHERE has_logbook_completed AND has_gps_attendance AND has_dual_evaluation) / NULLIF(COUNT(*), 0) FROM internship_assignments WHERE status='active'`

## Status as of this commit

**Substrate (Phase 1) — SHIPPED to production**
- 11 internship_* core tables + 8 config tables (PR #787)
- Service layer + 10 React Query hooks (PR #785)
- Admin policy UI at /admin/internship-policy/* (PR #788)
- Backward-compat shim + recovered types.ts (PR #824)
- JSONB unwrap fix in getMany (PR #832)
- Functional API column-drift fix + drop change_reason (PR #833)
- Webpack → Turbopack build fix (PR #846)
- RLS write-gap closed on internship_site_types + RPC signature alignment (PR #830 + applied 2026-05-10)
- 11 missing internship.policy.* keys seeded (PR #829 + applied 2026-05-10)

**Operational layer (Phase 2) — DECOMPOSED, ready to spawn**

## Phase 2A — Foundation pages (3 parallel agents)

| Agent | Scope | File surface | Spec ref |
|---|---|---|---|
| H | `/internships/cycles` — list / create / edit / activate / archive | `app/(routes)/internships/cycles/**` | Decision #1, #4, line 158-167 |
| I | `/internships/sites` (hospital + external CRUD) AND `/internships/preceptors` (preceptor CRUD as custom_role) | `app/(routes)/internships/sites/**`, `app/(routes)/internships/preceptors/**` | Decision #5/#6, line 254, line 360 |
| J | `/internships/vehicles` — inventory + booking history | `app/(routes)/internships/vehicles/**` | Decision #18, line 114, line 193 |

**Phase 2A acceptance:** Director can create posting cycle, register hospital, add preceptor, register vehicle. No assignments yet.

## Phase 2B — Assignment + Roster (3 parallel agents)

| Agent | Scope | File surface | Spec ref |
|---|---|---|---|
| K | `/internships/cycles/[id]/roster` — coordinator-driven manual assignment + fee-compliance gate + capacity check | `app/(routes)/internships/cycles/[id]/roster/**` | Decision #4, line 158-167 |
| L | `/internships/my-internship` — learner's own view | `app/(routes)/internships/my-internship/**` | Line 188 |
| M | Hospital portal — mobile-responsive at `/internships/...` role-aware (NOT separate domain) | `app/(routes)/internships/preceptor-view/**` (subject to nav design) | Line 254, Decision #6 |

**Phase 2B acceptance:** End-to-end loop works — cycle created → site added → 1 learner assigned → learner sees it → preceptor logs in and sees them. **Adoption metric becomes measurable from this gate forward.**

## Phase 2C — Field operations (4 parallel agents)

| Agent | Scope | File surface | Spec ref |
|---|---|---|---|
| N | GPS attendance — strict-block + emergency-bypass + proxy-attendance + LOP-immunity wiring | `app/(routes)/internships/attendance/**` | Decisions #2, #9, #10, #23 |
| O | Digital logbook — submit/edit window (24h default), late-penalty (10%), template-driven `entry_data JSONB` per program | `app/(routes)/internships/logbook/**` | Decisions #17, #18, #24, line 109/118 |
| P | Dual evaluation — facilitator + preceptor weighted scoring, rubric snapshot at activation, JSONB criteria per (college_id, program_id) | `app/(routes)/internships/evaluations/**` | Decisions #14, #22 |
| Q | Incident reporting — severity tiers, escalation timers from policy table, fed to weekly digest | `app/(routes)/internships/incidents/**` | Existing seeded keys + Decision #10 audit pattern |

## Phase 2D — Reports + Closure (2 parallel agents)

| Agent | Scope | File surface | Spec ref |
|---|---|---|---|
| R | Director dashboard `/internships/dashboard` — adoption metric live, active cycle stats, alerts | `app/(routes)/internships/dashboard/**` | Outcome metric line 17-22 |
| S | Certificate generator + INC/DCI/PCI accreditation reports | `app/(routes)/internships/certificates/**`, `lib/services/internships/certificate-generator.ts` | Acceptance criterion #11 (line 253) |

## Phase 2E — Notifications + Polish (2 parallel agents, runs alongside 2C+)

| Agent | Scope | File surface | Spec ref |
|---|---|---|---|
| T | Wire internship events → existing notification substrate. 11 `notify_*` policy rows drive timings. Per-college overrides via `internship_college_notification_overrides`. | `lib/services/notifications/internship-handlers.ts` | Decision #23 |
| U | Mobile-first responsive pass for hospital portal + a11y + cascade-preview reuse | Cross-cutting CSS + component tweaks | Line 254, acceptance criterion #12 |

## Dependency graph

```
Phase 2A: Cycles | Sites/Preceptors | Vehicles    (3 parallel)
              ↓
Phase 2B: Roster | Learner | Hospital-portal     (3 parallel)
              ↓ ━━━━━━━━━━━━━━ Adoption metric becomes measurable here
Phase 2C: GPS | Logbook | Evals | Incidents       (4 parallel)
              ↓
Phase 2D: Dashboard | Certificates                (2 parallel)
              ↓
            (verdict 2026-08-08)

Phase 2E: Notifications | Polish    (runs alongside 2C onwards)
```

## Total estimate

- 18-22 PRs across phases 2A-2D, ~10-14 working days agent-time
- Phase 2E parallel — no extra wall time
- Director review cycles between phases

## Standing rules for all Phase 2 agents

1. `--repo Jicate-Solutions/MyJKKN` on all `gh` commands
2. `git commit -- <pathspec>` per `feedback_explicit_pathspec_commit_defeats_autosave_hook.md`
3. Defensive against stream-idle-timeout per `feedback_agent_stream_idle_timeout_simple_edit.md` — chunk Reads, max 3 Edits per file, commit-and-push per logical step
4. Frontend-design skill principles for visual quality (Director-grade UI)
5. Pre-merge screenshot mandatory via `bu-cft prove-pr <PR>` per `feedback_visual_proof_bookend_mandatory.md` — UI PRs do NOT use `visual-proof-skip` label
6. Patterns to mirror: `components/shared/cascade-preview/CascadePreview.tsx`, `app/(routes)/admin/internship-policy/_components/PolicyField.tsx`

## Currently in flight

Phase 2A — agents H, I, J spawned 2026-05-10 ~20:10 IST against `jicate/main` HEAD `042012f08`. Each in isolated worktree.

## Decisions already locked (do NOT re-interview)

| Question | Spec answer |
|---|---|
| Preceptor auth | `custom_role` row, same `/auth/login`, role-aware sidebar (Decision #5/#6) |
| Vehicle TMS coupling | Standalone `internship_vehicles` (NOT TMS deep-link, Decision #18) |
| Allocation algorithm | Coordinator-driven manual via roster page (Decision #4 + line 159) |
| Rubric variance | Single `internship_evaluation_rubrics` table, JSONB per `(college_id, program_id)`, snapshot at activation (Decisions #14, #22) |
| Logbook structure | `entry_data JSONB` template-driven via `internship_logbook_templates` (line 109/118) |
| Mobile-first | Hospital portal MUST work mobile + 3G; other Director surfaces desktop-first (line 254) |
| GPS strictness | Strict block + emergency-bypass with photo + audit; proxy-attendance via coordinator override (Decisions #2, #9, #10) |

## Acceptance gates between phases

- **Before 2A → 2B**: All 3 Phase 2A PRs merged, deployed, browser-verified
- **Before 2B → 2C**: End-to-end loop working (cycle → site → learner → preceptor sees them)
- **Before 2C → 2D**: All 4 field-ops PRs merged + GPS proof-of-concept on one real cycle
- **Before 2D → verdict**: First measurable reading from outcome-metric query (>0%)
