# MyJKKN AI Pulse Module — Specification

> **Status:** Draft v1 · **Author:** SDD pipeline (gate-passed) · **Date:** 2026-04-29
> **Scope:** Live Thursday session + 5-phase Pulse-to-Practice rotation across 44 departments
> **Goal:** Drive 100% institutional adoption with auditable accountability, NAAC evidence pipeline, and Lovable/GitHub Campus integration.

---

## 1. Module Identity

| Field | Value |
|---|---|
| Module name | **AI Pulse** (institutional brand) |
| Route root | `app/(routes)/ai-pulse/` |
| API namespace | `app/api/ai-pulse/` |
| DB table prefix | `ai_pulse_*` |
| Permissions namespace | `aiPulse:*` |
| Sidebar slot | Top-level under "Learning & Development" |
| Distinct from | `work-pulse/` (existing employee-survey module — DO NOT merge) |

---

## 2. Scope

**In scope (Wave A–C, 5 weeks):**

- The live Thursday online briefing (6:55–7:30 PM) as a first-class object — join button, attendance, polls, quiz, recording, async make-up.
- The 5-phase Pulse-to-Practice cycle (Briefing → Domain-Sync → Lab Presentation → Gold Standard → Publication).
- Class-Rep-driven team rotation (5 teams per class, weekly).
- Department-Head heatmap and Director Tuesday digest.
- Super-admin UI for all 16 policy values.
- IQAC pipe to `quality_evidence_mappings` for NAAC Criterion 3.3.1 evidence.

**Explicitly out of scope (deferred to Phase 2):**

- Native video hosting (we wrap external Meet/Zoom in Wave A; native LiveKit migration is Month 3+).
- Parent/guardian under-18 nudge channel (sensitive; needs separate consent UX).
- Cross-institution leaderboards (single-institution only at v1).
- Lovable usage telemetry (covered by separate Lovable integration spec).
- Auto-evaluation of submissions by LLM (Gold Standard stays human-judged at v1).

---

## 3. Personas & Permissions

| Persona | Source | Scope | Permissions (`aiPulse:*`) | Action required |
|---|---|---|---|---|
| **Learner** | Existing role | self | `view:self`, `submit:domain_sync`, `submit:quiz`, `submit:publication` | Extend learner role |
| **Class Rep** | ⚠️ Verify in Wave A.0 | class | `mark:attendance`, `manage:team_rotation`, `escalate:absence` | **New role + scope** if not formal today |
| **Faculty (Class Adviser)** | Existing | class | `score:lab_presentation`, `select:gold_standard`, `excuse:absence` | Extend faculty role |
| **Department Head** | Existing | department | `view:dept_heatmap`, `escalate:dept`, `report:dept` | Extend |
| **AI Pulse Champion** | 🆕 New | global | `manage:cycles`, `manage:topics`, `cancel:session`, `broadcast:announce` | **New role** in `custom_roles` |
| **IQAC Coordinator** | Existing | read-only global | `read:naac_evidence`, `export:naac_csv` | Extend |
| **Director / MD** | Existing | global | `view:digest`, `view:all` | Already has via Director-digest pattern |
| **Super Admin** | Existing | global | `manage:policies`, `manage:value_lists`, `audit:all` | Extend |
| **IT Admin** | Existing | global config only | `configure:meet_api`, `configure:storage` | Extend |

**Wave A.0 prereq:** Confirm whether `class_rep` exists as a formal role in `custom_roles` today. If not, ship a separate roles-PR before Wave A.1.

---

## 4. Data Model

### 4.1 Tables (7 substrate + 5 value-list + 1 policy = 13 tables)

| Table | Cardinality | Purpose |
|---|---|---|
| `ai_pulse_cycles` | 1 / week × institutions | Master cycle. `week_start_date, briefing_topic_id, lovable_week_flag, host_user_id, meet_url, recording_url, status` |
| `ai_pulse_teams` | 5 / class / cycle | Rotational team. `cycle_id, class_id, team_number, team_lead_learner_id` |
| `ai_pulse_team_members` | N / team | Junction. `team_id, learner_id, role_in_team` |
| `ai_pulse_attendance` | 1 / learner / cycle | Live + async attendance. `cycle_id, learner_id, joined_at, left_at, async_makeup, marked_by, evidence_url` |
| `ai_pulse_engagement` | N / learner / cycle | Engagement signals. `attendance_id, signal_type_id, value, recorded_at` |
| `ai_pulse_lab_presentations` | 1 / team / cycle | Monday outcome. `cycle_id, team_id, presented, scores_json, gold_standard, faculty_judge_id` |
| `ai_pulse_publications` | 1 / gold-standard team | IG + GitHub. `cycle_id, team_id, instagram_url, github_repo_url, ig_reach, ig_likes, posted_within_24h, published_at` |

### 4.2 Value-list master tables (Q1 = Yes for all 5)

Each follows the `public.leave_types` pattern (institution-scoped, `is_system` flag, soft-disable, audit cols):

| Master table | Seeded defaults |
|---|---|
| `ai_pulse_engagement_signal_types` | `joined_within_5min`, `polls_responded_3plus`, `stayed_until_endtime`, `quiz_passed_live`, `quiz_passed_async` |
| `ai_pulse_excuse_reasons` | `medical`, `family_emergency`, `exam_clash`, `technical_failure`, `bandwidth`, `other` |
| `ai_pulse_gold_tiers` | `gold_standard` (rank 1 only at v1; admin can add `silver`, `bronze`) |
| `ai_pulse_topic_categories` | `llm_basics`, `agent_design`, `image_generation`, `code_assistants`, `automation_workflow`, `data_analysis`, `ethics_safety` |
| `ai_pulse_notification_keys` | `tminus_24h`, `tminus_2h`, `tminus_15min`, `late_no_show`, `domain_sync_due`, `lab_presentation_due`, `cycle_complete_recap` |

### 4.3 Policy table (Q3 = Yes for all 16)

`ai_pulse_policies` inheriting the shared config-mixin (`config_key`, `display_name`, `description`, `value_jsonb`, `is_active`, audit columns). Pattern: `counselor_rules` from Spec #537.

| `config_key` | Default | Type | Description |
|---|---|---|---|
| `session_day` | `Thursday` | enum | Weekly briefing day |
| `session_start_time` | `18:55` | time | Briefing start (institution timezone) |
| `session_end_time` | `19:30` | time | Briefing end |
| `late_threshold_minutes` | `10` | int | Joined after start ≥ this = "late" |
| `domain_sync_deadline_offset_days` | `3` | int | Days after Thursday to submit |
| `lab_presentation_day` | `Monday` | enum | Following-week presentation day |
| `gold_standard_count` | `2` | int | Top-N teams per cycle |
| `ig_post_deadline_hours` | `24` | int | Hours after Lab to publish |
| `ig_reach_threshold` | `500` | int | Min IG reach for "engaged publication" |
| `quiz_pass_threshold_live` | `40` | int (%) | Pass score for live attendees |
| `quiz_pass_threshold_async` | `60` | int (%) | Pass score for async make-up (higher bar) |
| `async_makeup_window_hours` | `48` | int | Window after session to complete async |
| `escalation_t1_percent` | `80` | int (%) | Of cycle elapsed → first escalation |
| `escalation_t2_percent` | `100` | int (%) | → second escalation (Dept Head, Director digest) |
| `lovable_week_frequency` | `monthly` | enum | When credits flow into the cycle |
| `cron_tick_minutes` | `240` | int | `fn_run_pulse_cycle_tick` cadence |

Every change writes an audit row with `changed_by`, `changed_at`, `change_reason` (mandatory free-text). Super-admin UI at `/admin/config/ai-pulse`.

---

## 5. Surfaces by Persona

| Surface | Persona | Route | Reads | Writes |
|---|---|---|---|---|
| **My Pulse** | Learner | `/ai-pulse` | own attendance, team, streak, badges | quiz, domain-sync, publication links |
| **Live Session** | Learner / Champion | `/ai-pulse/sessions/[cycle]/live` | meet URL, polls, quiz | join log, poll responses, quiz answers |
| **Class Rotation** | Class Rep | `/ai-pulse/rotation/[class_id]` | this cycle's 5 teams, attendance grid | mark attendance, escalate absence |
| **Lab Scoring** | Faculty | `/ai-pulse/scoring/[cycle]/[class_id]` | team submissions | scores, gold-standard flag, excuse approvals |
| **Dept Heatmap** | Dept Head | `/ai-pulse/department/[dept_id]` | 5 classes × 4 weeks heatmap | nothing (read-only) |
| **Champion Console** | AI Pulse Champion | `/ai-pulse/admin/cycles` | all cycles | create cycle, set topic, broadcast cancellation |
| **Director Digest** | Director | Tuesday 8:33 AM email + dashboard card | dept summary stats | nothing |
| **NAAC Evidence Export** | IQAC | `/ai-pulse/evidence/naac` | all gold-standard publications | CSV export trigger |
| **Policy Admin** | Super Admin | `/admin/config/ai-pulse` | `ai_pulse_policies` rows | edits with `change_reason` |

---

## 6. The 4 Adoption Levers (from architecture conversation, locked here)

| Lever | Mechanism | Substrate dependency |
|---|---|---|
| **Visibility** | Every actor sees their own status in real time | Substrate tables + RLS-scoped reads |
| **Accountability** | Live attendance, escalation cascade T1 → T2 | `fn_run_pulse_cycle_tick` cron + notifications |
| **Gamification** | Streaks, badges, dept leaderboard | `ai_pulse_engagement` aggregations + view |
| **Escalation** | T-24h/T-2h/T-15min stack → late no-show alert → dept-head red flag → Director digest line item | `ai_pulse_notification_keys` value-list + notifications.is_layer_0 (PR #630) |

---

## 7. Wave Plan (5 weeks)

### Wave A — Substrate (Weeks 1–2, no UI emitted)

| Sub-wave | Files | Validation |
|---|---|---|
| **A.0** | Class Rep role audit (`scripts/audit-class-rep-role.sh`); add to `custom_roles` if missing | Role exists with `class` scope |
| **A.1** | 7 substrate tables + 5 value-list tables + `ai_pulse_policies` + RLS + seeded defaults (1 migration: `20260501_create_ai_pulse_substrate.sql`) | `\dt ai_pulse_*` returns 13; all RLS policies pass `verify-rls.sh` |
| **A.2** | `fn_run_pulse_cycle_tick()` SQL function + pg_cron `*/4 * * * *` schedule | Tick runs in <2 sec on dev DB, fires correct notifications by stage |
| **A.3** | Director-digest emitter `fn_generate_ai_pulse_director_digest()` (mirrors PR #394 pattern) | First Tuesday 8:33 AM dry-run produces correct HTML body |

### Wave B — Persona surfaces (Weeks 3–4, parallel by file ownership)

Each surface = one parallel agent. Zero file-overlap with siblings. Per `feedback_avoid_main_in_branch_names_for_agents.md`, branch names use `phase-b-<surface>/...` not `phase-b-main/...`.

| Sub-wave | Owned files | Agent prompt size |
|---|---|---|
| **B.1 Learner My Pulse** | `app/(routes)/ai-pulse/page.tsx` + `_components/learner-*.tsx` + `_data/get-learner-pulse.ts` | ~600 LOC |
| **B.2 Live Session** | `app/(routes)/ai-pulse/sessions/[cycle]/live/*` + Meet API webhook in `app/api/ai-pulse/meet/` | ~900 LOC (highest complexity) |
| **B.3 Class Rep Rotation** | `app/(routes)/ai-pulse/rotation/[class_id]/*` (reuses `attendance-roster.tsx` shape) | ~500 LOC. **Blocked on PR #630 merge** |
| **B.4 Faculty Lab Scoring** | `app/(routes)/ai-pulse/scoring/[cycle]/[class_id]/*` | ~600 LOC |
| **B.5 Dept Head Heatmap** | `app/(routes)/ai-pulse/department/[dept_id]/*` | ~400 LOC |
| **B.6 Champion Console** | `app/(routes)/ai-pulse/admin/cycles/*` | ~500 LOC |

After Wave B: pre-spawn `pr-preflight` against the union of B.1–B.6 file sets to confirm zero overlap.

### Wave C — Admin policy UI + IQAC evidence pipe (Week 5)

| Sub-wave | Files |
|---|---|
| **C.1** | `app/(routes)/admin/config/ai-pulse/*` — edits all 16 `ai_pulse_policies` rows with audit trail + dry-run preview |
| **C.2** | `app/(routes)/ai-pulse/evidence/naac/*` — CSV export of `ai_pulse_publications` mapped to `quality_evidence_mappings` for NAAC Criterion 3.3.1 |
| **C.3** | `silent-failure-auditor` sweep + browser-verify all surfaces with `scripts/local-auth.sh` for each persona |

---

## 8. Dependencies & Risks

| Dependency | Status | Risk if not resolved |
|---|---|---|
| PR #630 (`notifications.is_layer_0`) | **OPEN as of 2026-04-29** | B.3 escalation cascade can't render in Attention Bar until merged |
| Class Rep formal role | ⚠️ Unverified | A.0 might need a separate roles-PR before A.1 |
| Meet API access (host token) | Unknown | B.2 falls back to "Join Now" button-only attendance (still works, just less rich) |
| AI Pulse Champion identity | **Likely: Ranjith (DTO JKKN)** — consistent caller-out across 4 weekly poster posts in AHS facilitators chat (Feb–Mar 2026). Needs human confirmation. | A.0 must lock the name + nominate a backup co-lead |
| Lovable Week monthly cadence | Confirmed | Drives `cron_tick` policy default |

| Risk | Mitigation |
|---|---|
| `work-pulse` naming collision | Locked: `ai-pulse/` route + `ai_pulse_*` tables. CI gate to grep for cross-references. |
| Engagement gaming (join + walk away) | 4-signal AND-gate: joined ∧ polls ∧ stayed ∧ quiz. All required for "engaged" |
| Async make-up abuse | Higher quiz bar (60% vs 40%) + 48h window + flag-distinct in dashboards |
| Rural campus bandwidth | 48h async + recording auto-saved → measure via async-makeup ratio per campus |
| Champion burnout | Substrate logs every cycle → backup host onboards from queryable state |
| RLS gaps | `verify-rls.sh` runs in A.1; any policy that returns rows for unauthorized persona = block |

---

## 9. Acceptance Criteria

**Quantitative (measurable in 8 weeks post-launch):**

- ≥ **95%** live + async attendance per cycle across 44 departments
- ≥ **85%** engagement-gate pass rate among attendees (4-signal AND)
- ≤ **5%** of cycles trigger Director-digest red-flag escalation
- ≥ **40 of 44** departments produce ≥ 1 Gold Standard per month
- **100%** of Gold Standards published to IG + GitHub within 24h policy
- **100%** of policy edits captured in audit log with `change_reason`
- **0** sidebar/permission/catalog drift findings (passes `check-permissions-catalog.mjs`)

**Qualitative:**

- Director can answer "which 3 departments are behind this week?" in one click from Tuesday digest
- Super admin can change `gold_standard_count` from 2 to 3 in 60 seconds without involving a developer
- IQAC can export Q4 NAAC Criterion 3.3.1 evidence CSV in one click

---

## 10. Open Questions

1. **AI Pulse Champion identity** — vault sweep on 2026-04-29 strongly suggests **Ranjith (DTO JKKN)** based on 4 consecutive weekly poster reminders in AHS facilitators chat. Needs human confirmation + co-lead nomination.
2. **Meet API tier** — does JKKN's Google Workspace tier support webhook-based attendance? Confirms B.2 architecture.
3. **Class size variance** — if some classes have <25 students, do we still split into 5 teams or scale down? Policy `min_team_size` may be needed.
4. **Recording storage** — Meet recordings to JKKN Drive or to MyJKKN storage bucket? IQAC retention requirement = 5 years.
5. **Holiday week handling** — when Thursday falls on a holiday, auto-cancel or auto-reschedule? Policy `holiday_handling` may be needed.
6. **Cross-institution learners** (e.g. dental + arts joint program) — which class do they rotate with? Edge case for `ai_pulse_team_members.role_in_team`.

---

## 11. Spec Provenance

- **FST analyses:** `Vaults/Claude Setup/Capture/JKKNKB/26-02-19-{8.12am,9.16am,10.36am}-*.md` (vault confirms 90-msg Google Chat, 600+ learners, 3-stage competition, 5-phase SOP, Lovable convergence)
- **Production sweep:** `git ls-tree jicate/main` confirmed `work-pulse/` collision (renamed to avoid)
- **Pattern reuse:** `app/(routes)/academic/attendance/` (faculty-quick-attendance), `app/(routes)/work-pulse/` (weekly form + compliance + notify API), `counselor_rules` (Spec #537 config-table pattern)
- **Director directive 2026-04-29:** All policy decisions = config rows
- **Mandatory-gate evidence:** Q1 = "Yes — all 5 CRUDable" / Q3 = "Yes — all 16 config-row" (locked in this session)

---

*Spec authored via `/myjkkn-chain /sdd` pipeline on 2026-04-29. Next step: Wave A.0 — Class Rep role audit + AI Pulse Champion identification.*
