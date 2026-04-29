# MyJKKN AI Pulse Module — Specification

> **Status:** Draft v2 (post-interview) · **Author:** SDD pipeline + 4-round /interview · **Date:** 2026-04-29
> **Scope:** Live unified Thursday session + 5-phase Pulse-to-Practice rotation across 44 departments / 8 colleges
> **Goal:** 100% engaged adoption (live or async-make-up or approved excuse) with auditable accountability, NAAC evidence pipeline, and tool-agnostic AI integration.

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

- The live unified Thursday online briefing (6:55–7:30 PM IST) — one Champion-led session for all 8 colleges joining together.
- The 5-phase Pulse-to-Practice cycle (Briefing → Domain-Sync → Lab Presentation → Gold Standard → Publication).
- Class-Rep-driven team rotation, **3–7 teams per class scaled by size band** (Q10).
- Department-Head heatmap and Director Tuesday digest with multi-tier consequence cascade (1/3/5 misses).
- Super-admin UI for all **22** policy values (Q3 expanded).
- IQAC pipe to `quality_evidence_mappings` for NAAC Criterion 3.3.1 evidence.
- **Bilingual sessions and quizzes (English + Tamil)** per Q16.
- **Algorithmic anomaly detection** + monthly Champion review (Q11).
- **Quarterly external judge cadence** (Q4).
- **Featured-tool rotation** via master table (Q15) — Lovable, Cursor, Copilot, Gemini, ChatGPT, Sora, n8n, Perplexity rotating weekly at Champion's discretion.

**Explicitly out of scope (deferred to Phase 2):**

- Native video hosting (we wrap external Meet/Zoom in Wave A).
- Parent/guardian under-18 nudge channel.
- Cross-institution leaderboards.
- Auto-evaluation of submissions by LLM (Gold Standard stays human-judged at v1).
- **Auto-caption-based accessibility for visual/hearing impairments.** Director feedback in Q14: multilingual auto-transcripts at JKKN don't come out well. Genuine disability accommodation deferred to a Phase 2 design pass — see §10 Open Q1.

---

## 3. Personas & Permissions

| Persona | Source | Scope | Permissions (`aiPulse:*`) | Action required |
|---|---|---|---|---|
| **Learner** | Existing role | self | `view:self`, `submit:domain_sync`, `submit:quiz`, `submit:publication`, `opt_out:leaderboard_individual` | Extend learner role |
| **Class Rep** | 🔴 NOT a formal role today (Wave A.0 audit confirmed) | class | `mark:attendance`, `manage:team_rotation`, `escalate:absence` | **New role** in `custom_roles` — separate roles-PR before Wave A.1 |
| **Faculty (Class Adviser)** | Existing | class | `score:lab_presentation`, `select:gold_standard`, `excuse:absence`, `intervene:hod_chat_log` | Extend faculty role |
| **Department Head** | Existing | department | `view:dept_heatmap`, `escalate:dept`, `report:dept`, `intervene:academic_flag` | Extend |
| **AI Pulse Champion** | 🆕 New role — Krishnaveni | global | `manage:cycles`, `manage:topics`, `cancel:session`, `broadcast:announce`, `author:quiz`, `select:featured_tool`, `review:anomalies` | **New role** in `custom_roles` |
| **Co-Champion (Deputy)** | 🆕 New role — TBD (Q9 nominated, name pending) | global | Same as Champion (full delegation when Krishnaveni absent) | **New role** in `custom_roles` — name to be locked in Wave A.0 |
| **External Judge (Quarterly)** | 🆕 New role | session-scoped | `score:gold_standard_quarterly`, `view:cycle_artifacts` | **New role** + onboarding workflow (Wave A.0+) |
| **IQAC Coordinator** | Existing | read-only global | `read:naac_evidence`, `export:naac_csv` | Extend |
| **Director / MD** | Existing | global | `view:digest`, `view:all`, `intervene:academic_flag` | Already has via Director-digest pattern |
| **Super Admin** | Existing | global | `manage:policies`, `manage:value_lists`, `audit:all` | Extend |
| **IT Admin** | Existing | global config only | `configure:meet_api`, `configure:storage` | Extend |

**Wave A.0 prereqs (3 items remaining):**
1. ✅ Champion = Krishnaveni (locked)
2. 🔴 Class Rep formal role — separate roles-PR
3. 🔴 Co-Champion deputy — name nomination pending

---

## 4. Data Model

### 4.1 Substrate tables (8 substrate + 6 value-list + 1 policy = 15 tables)

| Table | Cardinality | Purpose |
|---|---|---|
| `ai_pulse_cycles` | 1 / week × institutions | Master cycle. `week_start_date, briefing_topic_id, featured_tool_id (FK), host_user_id (Champion or Deputy), meet_url, recording_url, status` |
| `ai_pulse_teams` | **3–7** / class / cycle (scaled by class size band) | Rotational team. `cycle_id, class_id, team_number CHECK (1..7), team_lead_learner_id` |
| `ai_pulse_team_members` | N / team | Junction. `team_id, learner_id, role_in_team` |
| `ai_pulse_attendance` | 1 / learner / cycle | Live + async attendance with derived `miss_state` ENUM(`ENGAGED`, `EXCUSED`, `MISSED`). Only `MISSED` increments strike counter (Q5). |
| `ai_pulse_engagement` | N / learner / cycle | 4-AND-gate signals. `attendance_id, signal_type_id, value, recorded_at` |
| `ai_pulse_lab_presentations` | 1 / team / cycle | Monday outcome. `cycle_id, team_id, presented, scores_json, gold_standard, gold_tier_id, faculty_judge_id, external_judge_id (nullable, quarterly only)` |
| `ai_pulse_publications` | 1 / cycle / team (Top-N + Bottom-N) | Top 2 → IG + GitHub external; **Bottom 2 → MyJKKN intranet only** (Q6). `visibility_scope ENUM('public_external', 'myjkkn_intranet')` |
| **`ai_pulse_anomaly_flags`** 🆕 | N | Algorithmic-flag log. `cycle_id, flag_type, target_user_id, target_team_id, signal_value, reviewed_by, review_outcome, reviewed_at` |

### 4.2 Master value-list tables (6 — Q1 = Yes, all CRUDable institution-scoped)

Each follows the `public.leave_types` pattern. **All tables include `label_en` + `label_ta` for bilingual support (Q16).**

| Master table | Seeded defaults |
|---|---|
| `ai_pulse_engagement_signal_types` | `joined_within_5min`, `polls_responded_3plus`, `stayed_until_endtime`, `quiz_passed_live`, `quiz_passed_async` |
| `ai_pulse_excuse_reasons` | `medical`, `family_emergency`, `exam_clash`, `technical_failure`, `bandwidth`, `other` |
| `ai_pulse_gold_tiers` | `gold_standard` (rank 1; admin can add `silver`, `bronze`) |
| `ai_pulse_topic_categories` | `llm_basics`, `agent_design`, `image_generation`, `code_assistants`, `automation_workflow`, `data_analysis`, `ethics_safety` |
| `ai_pulse_notification_keys` | `tminus_24h`, `tminus_2h`, `tminus_15min`, `late_no_show`, `domain_sync_due`, `lab_presentation_due`, `cycle_complete_recap`, `escalation_t1_class_rep`, `escalation_t2_dept_head` |
| **`ai_pulse_featured_tools`** 🆕 (Q15) | `lovable`, `cursor`, `github_copilot`, `gemini`, `chatgpt`, `sora`, `n8n`, `perplexity`, `claude` (Champion can add/disable per institution) |

### 4.3 Policy table (Q3 = Yes, 22 super-admin-tunable rows)

`ai_pulse_policies` inheriting the shared config-mixin. Pattern: `counselor_rules` (Spec #537).

| `config_key` | Default | Type | Locked by |
|---|---|---|---|
| `session_day` | `Thursday` | enum | (default) |
| `session_start_time` | `18:55` | time | (default) |
| `session_end_time` | `19:30` | time | (default) |
| `late_threshold_minutes` | `10` | int | (default) |
| `domain_sync_deadline_offset_days` | `3` | int | (default) |
| `lab_presentation_day` | `Monday` | enum | (default) |
| `gold_standard_count` | `2` | int | (default) |
| `bottom_n_publication_count` 🆕 | `2` | int | Q3 / Q6 |
| `bottom_n_visibility_scope` 🆕 | `myjkkn_intranet` | enum (`myjkkn_intranet`, `public_external`, `department_only`, `anonymized_public`) | Q6 |
| `learner_visibility_override_enabled` 🆕 | `true` | bool | UGC anti-ragging mitigation |
| `ig_post_deadline_hours` | `24` | int | (default) |
| `ig_reach_threshold` | `500` | int | (default) |
| `quiz_pass_threshold_live` | `40` | int (%) | (default) |
| `quiz_pass_threshold_async` | `60` | int (%) | (default) |
| `async_makeup_window_hours` | `48` | int | (default) |
| `engaged_state_definition` 🆕 | `live_or_async_or_excused` | enum | Q5 |
| `consequence_tier_thresholds` 🆕 | `{"nudge": 1, "hod_chat": 3, "academic_flag": 5}` | JSONB | Q2 |
| `escalation_t1_percent` | `80` | int (%) | (default) |
| `escalation_t2_percent` | `100` | int (%) | (default) |
| `team_count_thresholds` 🆕 | `{"small": {"max_size": 25, "teams": 3}, "medium": {"max_size": 75, "teams": 5}, "large": {"teams": 7}}` | JSONB | Q10 |
| `multi_campus_mode` 🆕 | `unified` | enum (`unified`, `per_college`, `hybrid`, `federated`) | Q13 |
| `bilingual_mode` 🆕 | `true` | bool | Q16 |
| `primary_language` 🆕 | `en` | enum | Q16 |
| `secondary_language` 🆕 | `ta` | enum | Q16 |
| `external_judge_cadence` 🆕 | `quarterly` | enum (`quarterly`, `every_cycle`, `none`, `open_public_async`) | Q4 |
| `featured_tool_rotation_strategy` 🆕 | `weekly_champion_pick` | enum (`weekly_champion_pick`, `quarterly_focus`, `none`) | Q15 |
| `cron_tick_minutes` | `240` | int | (default) |

Every change writes an audit row with `changed_by`, `changed_at`, `change_reason` (mandatory free-text). Super-admin UI at `/admin/config/ai-pulse`.

---

## 5. Surfaces by Persona

| Surface | Persona | Route | Purpose |
|---|---|---|---|
| **My Pulse** | Learner | `/ai-pulse` | own attendance, team, streak, badges |
| **Live Session** | Learner / Champion | `/ai-pulse/sessions/[cycle]/live` | meet URL, polls, quiz |
| **Class Rotation** | Class Rep | `/ai-pulse/rotation/[class_id]` | mark attendance, escalate |
| **Lab Scoring** | Faculty | `/ai-pulse/scoring/[cycle]/[class_id]` | scores, gold flag, excuse approval |
| **Dept Heatmap** | Dept Head | `/ai-pulse/department/[dept_id]` | heatmap + intervene:hod_chat_log |
| **Champion Console** | Champion / Deputy | `/ai-pulse/admin/cycles` | create cycle, set topic, pick featured tool, broadcast |
| **Quiz Authoring Console** 🆕 | Champion / Deputy | `/ai-pulse/admin/quiz/[cycle]` | bilingual quiz editor; AI-suggested questions from transcript; preview learner experience; schedule publication T-2h | Critical for Q7 + Q16 — must minimize Krishnaveni's quiz-auth time to <8 min/cycle/language |
| **Anomaly Review** 🆕 | Champion | `/ai-pulse/admin/anomalies` | monthly review of flagged items (Q11) |
| **Leaderboard (intra-MyJKKN)** 🆕 | All Learners + Faculty | `/ai-pulse/leaderboard` | Top + Bottom team rankings (per Q3+Q6); honors `learner_visibility_override` opt-out |
| **External Judge Console** 🆕 | External Judge (quarterly) | `/ai-pulse/external-judge/[cycle]` | 1 cycle/quarter — score artifacts; rubric-driven |
| **Director Digest** | Director | Tuesday 8:33 AM email + dashboard card | dept summary stats + multi-tier escalation list |
| **NAAC Evidence Export** | IQAC | `/ai-pulse/evidence/naac` | CSV export of publications |
| **Policy Admin** | Super Admin | `/admin/config/ai-pulse` | edits all 22 `ai_pulse_policies` rows |

---

## 6. The 4 Adoption Levers

| Lever | Mechanism | Substrate dependency |
|---|---|---|
| **Visibility** | Every actor sees own status real-time | Substrate + RLS-scoped reads |
| **Accountability** | Live attendance + multi-tier consequence cascade (1/3/5 misses → nudge/HOD chat/academic flag, per Q2) | `fn_run_pulse_cycle_tick` + `consequence_tier_thresholds` policy |
| **Gamification** | Streaks, badges, dept leaderboard with Top-N + Bottom-N visibility (intranet only per Q6) | `ai_pulse_engagement` aggregations + `bottom_n_visibility_scope` policy |
| **Escalation** | T-24h/T-2h/T-15min stack → late-no-show → dept-head red flag → Director digest line item → faculty/HOD intervention | `ai_pulse_notification_keys` value-list + `notifications.is_layer_0` (PR #630) |

---

## 7. Wave Plan (5 weeks)

### Wave A — Substrate (Weeks 1–2)

| Sub-wave | Deliverable | Validation |
|---|---|---|
| **A.0** | (1) Class Rep role added to `custom_roles`; (2) Co-Champion deputy role added; (3) deputy name locked; (4) `learners` FK column pinned | Roles in DB; Champion + Deputy named; FK confirmed |
| **A.1** | 8 substrate + 6 master + 1 policy = 15 tables; RLS; seeded defaults; bilingual `label_en`/`label_ta` columns | `\dt ai_pulse_*` returns 15; verify-rls.sh passes |
| **A.2** | `fn_run_pulse_cycle_tick()` — implements miss-state derivation (Q5), consequence-tier escalation (Q2), team-count adaptation (Q10), bilingual notification routing (Q16) | Tick runs <2 sec; correct notifications by stage + language |
| **A.3** | Director-digest emitter `fn_generate_ai_pulse_director_digest()` (mirrors PR #394 pattern) + multi-tier list rendering | First Tuesday 8:33 AM dry-run produces correct bilingual HTML |

### Wave B — Persona surfaces (Weeks 3–4, parallel by file ownership)

| Sub-wave | Owned files | Notes |
|---|---|---|
| **B.1 Learner My Pulse** | `app/(routes)/ai-pulse/page.tsx` + `_components/learner-*.tsx` | ~600 LOC. Bilingual UI required. |
| **B.2 Live Session** | `app/(routes)/ai-pulse/sessions/[cycle]/live/*` + Meet API webhook | ~900 LOC. Highest complexity. |
| **B.3 Class Rep Rotation** | `app/(routes)/ai-pulse/rotation/[class_id]/*` | ~500 LOC. **Blocked on PR #630 merge.** |
| **B.4 Faculty Lab Scoring** | `app/(routes)/ai-pulse/scoring/[cycle]/[class_id]/*` | ~600 LOC. |
| **B.5 Dept Head Heatmap** | `app/(routes)/ai-pulse/department/[dept_id]/*` | ~400 LOC. |
| **B.6 Champion Console** | `app/(routes)/ai-pulse/admin/cycles/*` | ~500 LOC. |
| **B.7 Quiz Authoring Console** 🆕 | `app/(routes)/ai-pulse/admin/quiz/*` + AI-suggest API in `app/api/ai-pulse/quiz/suggest/` | ~600 LOC. **Critical for Q7 + Q16 sustainability.** Bilingual templates + transcript-driven question suggestions. |
| **B.8 Anomaly Review** 🆕 | `app/(routes)/ai-pulse/admin/anomalies/*` + detection function | ~400 LOC. Q11. |
| **B.9 Leaderboard** 🆕 | `app/(routes)/ai-pulse/leaderboard/*` | ~300 LOC. Honors learner_visibility_override. Q3+Q6. |

After Wave B: pre-spawn `pr-preflight` against the union of B.1–B.9 file sets to confirm zero overlap.

### Wave C — Admin policy UI + IQAC evidence pipe (Week 5)

| Sub-wave | Deliverable |
|---|---|
| **C.1** | `app/(routes)/admin/config/ai-pulse/*` — 22 policy editor with audit + dry-run preview |
| **C.2** | `app/(routes)/ai-pulse/evidence/naac/*` — CSV export to `quality_evidence_mappings` for NAAC 3.3.1 |
| **C.3** | External Judge Console (quarterly) `/ai-pulse/external-judge/*` |
| **C.4** | `silent-failure-auditor` sweep + browser-verify all surfaces with `scripts/local-auth.sh` per persona |

---

## 8. Dependencies & Risks

| Dependency | Status | Risk if not resolved |
|---|---|---|
| PR #630 (`notifications.is_layer_0`) | OPEN | Wave B.3 escalation cascade can't render |
| Class Rep formal role | 🔴 NOT a role today (audit confirmed) | A.1 substrate can't merge until roles-PR lands |
| Co-Champion deputy name | 🔴 Pending | A.0 closure blocked |
| Meet API tier (webhook attendance) | Unknown | B.2 falls back to "Join Now" button-only attendance |
| AI Pulse Champion identity | ✅ Krishnaveni (locked 2026-04-29) | — |

| Risk | Mitigation |
|---|---|
| `work-pulse` naming collision | Locked: `ai-pulse/` route + `ai_pulse_*` tables. CI grep gate. |
| Engagement gaming | 4-AND-gate + `ai_pulse_anomaly_flags` algorithmic detection (Q11) |
| Krishnaveni bottleneck (quiz authoring × 2 languages) | Quiz Authoring Console (B.7) with AI-suggested questions, prior-cycle templates, ≤8-min target per language |
| Bilingual quality drift | Native-Tamil reviewer in dept Q&A — Wave A.0 to identify; pull from Tamil dept faculty pool |
| Bottom-N publication legal exposure | `learner_visibility_override` policy (default true) lets individual learner opt out of name appearance |
| Champion absence | Co-Champion deputy role (Q9) + queryable cycle log → backup onboards in <30 min |
| External judge cadence overhead | Quarterly only (4/year — Q4) keeps Krishnaveni's coordination load manageable |
| Lovable credit exhaustion | Featured-tool master table (Q15) decouples program from any single vendor — switch to Cursor/Copilot/Gemini at zero substrate cost |
| Multilingual auto-caption unreliability (per Q14) | Don't promise auto-captions; bilingual sessions are human-led; visual/hearing-impairment accommodation deferred to Phase 2 with explicit design pass |
| RLS gaps | `verify-rls.sh` runs in A.1 |

---

## 9. Acceptance Criteria

**Quantitative (measurable in 8 weeks post-launch):**

- ≥ **95%** "engaged" rate per cycle (live OR async make-up OR approved excuse) across 44 departments × 8 colleges
- ≥ **85%** 4-AND-gate pass among live attendees
- ≤ **5%** of cycles trigger Director Tuesday-digest red flag
- ≥ **40 of 44** departments produce ≥ 1 Gold Standard / month
- **100%** of Gold Standards published per `ig_post_deadline_hours` policy
- **100%** of policy edits captured in audit log with `change_reason`
- **100%** bilingual coverage (every quiz published in both `primary_language` and `secondary_language`)
- **< 10%** anomaly-flag false-positive rate after first 4 monthly reviews
- **0** sidebar/permission/catalog drift findings (`check-permissions-catalog.mjs`)
- **4** quarterly external-judge sessions completed in year-1

**Qualitative:**

- Director sees "which 3 departments are behind this week?" in one click from Tuesday digest, with multi-tier escalation list
- Super admin can change any of the 22 policy values in <60 seconds with audit trail
- IQAC exports Q4 NAAC Criterion 3.3.1 evidence CSV in one click
- Krishnaveni authors a bilingual quiz in <16 minutes total (8 min × 2 languages) using AI-suggested questions
- Co-Champion deputy can host a session unassisted after one shadow-cycle

---

## 10. Open Questions

1. **Accessibility strategy for visual/hearing impairment** — Director feedback (Q14): multilingual auto-transcripts at JKKN don't come out well, so caption-based accessibility is unreliable. Need a Phase 2 design pass on alternatives (human-transcribed captions, sign-language interpreter, slide-deck textual fallback). Current spec doesn't promise auto-captions.
2. **Co-Champion deputy name** — Q9 model locked (single named deputy); name TBD. Wave A.0 blocker.
3. **Meet API tier** — does JKKN's Google Workspace tier support webhook-based attendance? Confirms B.2 architecture.
4. **Recording storage operationalization** — Q8 chose Google Drive; need to confirm Workspace storage quota + IQAC sharing permission setup.
5. **Holiday week handling** — when Thursday falls on a holiday, auto-cancel or auto-reschedule? Suggest add policy `holiday_handling_mode` if needed.
6. **Cross-institution learners** — for joint programs (e.g. dental + arts), which class do they rotate with? Edge case for `ai_pulse_team_members.role_in_team`.
7. **External judge recruitment** — who handles quarterly external-judge sourcing? Honorarium budget? Format (in-person vs Meet vs async written)? Wave A.0+ to design.
8. **Anomaly-detection signal definitions** — Q11 picked algorithmic flagging; the spec lists 5 candidate signals but exact thresholds (std-dev cutoffs, timing fingerprints) need empirical calibration after first 4 cycles run.

---

## 11. Spec Provenance

- **FST analyses:** `Vaults/Claude Setup/Capture/JKKNKB/26-02-19-{8.12am,9.16am,10.36am}-*.md`
- **Production sweep (2026-04-29):** `git ls-tree jicate/main` confirmed `work-pulse/` collision (renamed)
- **Pattern reuse:** `app/(routes)/academic/attendance/`, `app/(routes)/work-pulse/`, `counselor_rules` (Spec #537)
- **Director directive 2026-04-29:** All policy decisions = config rows
- **Mandatory-gate evidence:** Q1 = "Yes — all 6 CRUDable" / Q3 = "Yes — all 22 config-row"
- **/interview rounds 1–4 (2026-04-29):** 16 forced-choice answers locked — see §12 Decision Log

---

## 12. Decision Log (Interview rounds 1–4)

Every non-default substrate / policy / scope choice traces back here.

| # | Question | Pick | Rationale | Substrate impact |
|---|---|---|---|---|
| Q1 | Win condition | **100% engaged, zero no-shows** | Director sets aggressive target; Q5 reconciles with reality | `engaged_state_definition` policy |
| Q2 | Consequence model for repeat absentees | **Multi-tier (1/3/5)** | Proportional intervention, not theater | `consequence_tier_thresholds` policy |
| Q3 | Bottom-team visibility | **Top 2 + Bottom 2 publicly** | Radical transparency for accountability | `bottom_n_publication_count` policy |
| Q4 | External judges | **Quarterly showcase** | Operationally manageable, NAAC-grade signal | `external_judge_cadence` policy |
| Q5 | Miss-counter rule | **Both excuses + async rescue** | Realistic with 100% engaged target | `engaged_state_definition` policy + miss_state derivation |
| Q6 | Bottom-N "publicly" scope | **Show on MyJKKN intranet only** | Internal accountability, no external shaming | `bottom_n_visibility_scope` policy + `learner_visibility_override` policy |
| Q7 | Quiz authorship | **Champion-authored every quiz** | Quality > scale | Quiz Authoring Console (B.7) — CRITICAL for sustainability |
| Q8 | Recording storage | **Google Drive (institutional)** | NAAC-friendly, IQAC-familiar, cost-effective | IT Admin role + storage policy |
| Q9 | Co-lead succession | **Single named deputy (academic year)** | Simplest succession model | Co-Champion role added to personas |
| Q10 | Class size variance | **Adaptive (3/5/7 by size band)** | Prevents tiny + giant team failure modes | `team_count_thresholds` policy + team_number CHECK 1..7 |
| Q11 | Anti-gaming model | **Algorithmic + Champion monthly review** | Detects most patterns at low ongoing cost | `ai_pulse_anomaly_flags` table + B.8 surface |
| Q12 | Lovable runway | **"Move beyond Lovable, it's just a tool"** | Vendor-agnostic program design | `ai_pulse_featured_tools` master table + `featured_tool_id` FK |
| Q13 | Multi-campus timing | **Unified — all 8 colleges, one Champion-led session** | Cross-pollination, simplest substrate | `multi_campus_mode` policy = `unified` |
| Q14 | Disability accommodation | **(Director-noted multilingual transcripts unreliable)** | Don't promise what we can't deliver | Phase 2 design pass — flagged in §10 Q1 |
| Q15 | Tool rotation strategy | **Weekly via master table, Champion picks** | Maximum flexibility, vendor-agnostic | `featured_tool_rotation_strategy` policy + master table |
| Q16 | Language strategy | **Bilingual sessions + bilingual quizzes (English + Tamil)** | Most inclusive, doubles Krishnaveni's load | `bilingual_mode` + `primary_language` + `secondary_language` policies; `label_en` + `label_ta` columns on all master tables |

---

*Spec authored via `/myjkkn-chain /sdd` + `/interview` 4-round pipeline on 2026-04-29. Next single move: Wave A.0 — lock Co-Champion deputy name, draft Class Rep roles-PR, pin `learners` FK column.*
