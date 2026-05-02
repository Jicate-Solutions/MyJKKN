# MyJKKN AI Pulse Module — Specification v3

> **Status:** Draft v3 — Events-Extension Approach · **Date:** 2026-05-02
> **Supersedes:** v1 (2026-04-29) + v2 (2026-04-29 post-/interview). Both prior versions proposed 15 new tables; this v3 reframes AI Pulse as an extension of the existing events module.
> **Lesson driver:** `feedback_synonym_grep_audit_required.md` + Director directive 2026-05-02 ("read what's already in the codebase, find the pattern, extend it. Only the last resort is the new file/specs.")

---

## 0. Outcome Metric (Q0 lock — locked 2026-05-02)

```yaml
outcome_metric:
  metric_name: engaged_attendance_rate
  baseline_value: "0% (no system today; manual / Sheets tracking)"
  threshold_90d: "≥95% engaged (live OR async OR excused) across 44 depts × 12 cycles"
  kill_criterion: "If <70% engaged at day-90, archive substrate and revert to manual tracking. If 70–95%, revise architecture before scaling."
```

Verdict-date: 90 days post Wave A.1 merge. Director runs the verdict; if missed, formally archive.

---

## 1. Module Identity

| Field | Value |
|---|---|
| Brand | **AI Pulse** (institutional brand) |
| Implementation | **Recurring weekly rows in `startup_events` with `config.kind='ai_pulse'`** discriminator — extends existing events module, not a parallel substrate. Locked 2026-05-02 (OQ-1 resolution). |
| User-facing route prefix | `/ai-pulse/*` (composes existing event components with AI-Pulse filter) |
| Permission namespace | `aiPulse:*` (NEW keys only — most behaviors inherit from existing event permissions) |

**Distinct from `work-pulse/`** (employee-survey module) and **distinct from prior v2 spec** (15 new tables — wrong approach, replaced).

---

## 2. Scope

**In scope (Wave A–B, 3 weeks vs prior 5 weeks):**

- Live unified Thursday session (6:55–7:30 PM IST) modeled as a `startup_events` row with `config.kind='ai_pulse'` discriminator + per-cycle settings in same JSONB.
- 5-phase Pulse-to-Practice cycle reuses existing event lifecycle (`draft → planning → execution → live → post_event → archived`).
- Class Incharge attendance marking via existing `event_team_attendance` (extend `day_type` enum to include `'live_session'`).
- Lab Presentation Monday → existing `event_demo_slots`.
- Domain-Sync + Top-2 IG/GitHub publications → existing `event_submissions` (already has `github_url`, `live_app_url`).
- Bilingual sessions/quizzes (Q16) — store templates in `events.config` JSONB + new `ai_pulse_policies`.
- Anomaly detection (Q11) — genuinely new `ai_pulse_anomaly_flags` table.
- Featured-tool rotation (Q15) — `events.config.featured_tool_id` references new `ai_pulse_featured_tools` master.
- Super-admin policies (Q3) — new `ai_pulse_policies` config table.
- Director Tuesday digest — extends existing daily-digest pattern (PR #394) with AI Pulse line items.

**Explicitly out of scope:**

- Parallel `ai_pulse_*` substrate (was v1/v2 approach — superseded).
- New "Class Rep" role (use existing `class_incharges`).
- Recreating leaderboard / evaluation / declare / demo-day routes — REUSE existing `events/[id]/*` components composed under `/ai-pulse/*`.
- Auto-caption-based accessibility (Q14 quality concern).

---

## 3. Personas (mostly reused — only NEW permission keys are AI-Pulse-scoped)

| Persona | Source | Action |
|---|---|---|
| **Learner** | Existing | Extend with `aiPulse:submit:domain_sync`, `aiPulse:submit:quiz` |
| **Class Incharge** | ✅ EXISTS — `class_incharges` table + `/staff/class-incharges` UI | Add `aiPulse:rotation.manage`, `aiPulse:attendance.mark`, `aiPulse:absence.escalate` to `lib/constants/permissions.ts` |
| **Faculty (Lab Judge)** | Existing | Reuses existing `events/[id]/evaluate` permissions |
| **Department Head** | Existing | Existing `events/[id]/dashboard` access; add `aiPulse:dept.intervene` |
| **AI Pulse Champion** (Krishnaveni, locked 2026-04-29) | New role | `aiPulse:cycles.manage`, `aiPulse:topics.set`, `aiPulse:tool.feature`, `aiPulse:anomaly.review`, `aiPulse:quiz.author` |
| **Co-Champion** (Ranjith / Ranjith@jkkn.ac.in, locked 2026-05-02) | New role | Same as Champion — full delegation |
| **External Judge (Quarterly)** | New role | `aiPulse:gold.judge_quarterly` |
| **IQAC, Director, Super Admin, IT Admin** | Existing | Standard permissions |

---

## 4. Data Model — The Real Delta

### 4.1 Existing tables AI Pulse REUSES (no schema changes)

| Existing table | Role in AI Pulse |
|---|---|
| `startup_events` (or `events` — see §10 OQ-1) | Each weekly cycle = one row |
| `event_team_members` | 3–7 teams per section per cycle |
| `event_team_attendance` | Live + async attendance — adds `'live_session'` + `'async_makeup'` to `day_type` CHECK; adds `engagement_signals JSONB` |
| `event_demo_slots` | Monday Lab presentation slots |
| `event_submissions` | Domain-Sync artifacts + Top-2 publications (`github_url`, `live_app_url`, `app_name`, `description`, `proof_urls` already exist) |
| `event_staff_assignments` | Faculty assigned to event for evaluation |
| `event_checklists` | Operational checklists per cycle |
| `event_venue_assignments` | (Multi-campus federated mode if used) |
| `class_incharges` | Section → staff mapping (who marks attendance) |
| `sections` | Class organization unit |
| `quality_evidence_mappings` | NAAC Criterion 3.3.1 evidence pipe |

### 4.2 NEW tables (3 — down from v2's 15)

| Table | Purpose | Justification |
|---|---|---|
| `ai_pulse_policies` | 22 super-admin-tunable rows (Q3 config-row pattern) | Generic events have no policy table; this is genuinely new and follows `counselor_rules` (Spec #537). |
| `ai_pulse_anomaly_flags` | Algorithmic flag log (Q11) | Generalized anomaly-detection pattern doesn't exist in events module. Genuinely new. |
| `ai_pulse_featured_tools` | Vendor-agnostic tool master (Q15) | Could be JSONB on `events.config` but a master table allows institution-scoped CRUD per Q1 rule. |

### 4.3 Column / constraint changes (audit-corrected 2026-05-02)

**Schema audit finding:** `startup_events` does NOT have an `event_type` column (verified 2026-05-02 via `awk` on `01_tables.sql`). Use `config.kind = 'ai_pulse'` JSONB discriminator instead — zero schema change to `startup_events`.

```sql
-- NO ALTER on startup_events. Discriminator lives in config JSONB:
--   INSERT INTO startup_events (name, config, ...) VALUES (
--     'AI Pulse Cycle 2026-05-08', '{"kind":"ai_pulse", ...}'::jsonb, ...
--   );
-- Service-layer query: WHERE config->>'kind' = 'ai_pulse'

-- Extend attendance day_type to support live sessions + async make-up
ALTER TABLE event_team_attendance DROP CONSTRAINT IF EXISTS event_team_attendance_day_type_check;
ALTER TABLE event_team_attendance ADD CONSTRAINT event_team_attendance_day_type_check
  CHECK (day_type IN ('build_day', 'demo_day', 'live_session', 'async_makeup'));

-- 4-AND engagement gate signals stored as JSONB on existing attendance row
ALTER TABLE event_team_attendance ADD COLUMN IF NOT EXISTS engagement_signals JSONB DEFAULT '{}';
-- Shape: {joined_within_5min: true, polls_responded: 4, stayed_until: '19:28', quiz_score: 65}
```

That's the entire schema delta: **3 new tables + 1 new column + 1 ENUM extension** (audit corrected — no `startup_events` schema change needed). v2 proposed 15 new tables.

### 4.4 `events.config` JSONB usage for AI Pulse cycles

Per-cycle settings live in `events.config` (existing JSONB column):
```json
{
  "ai_pulse": {
    "cycle_week_start_date": "2026-05-08",
    "featured_tool_id": "uuid-of-tool",
    "briefing_topic_id": "uuid-of-topic",
    "host_user_id": "uuid-of-krishnaveni-or-ranjith",
    "meet_url": "https://meet.google.com/...",
    "recording_url": "https://drive.google.com/...",
    "external_judge_cycle": false,
    "gold_standard_count": 2,
    "bottom_n_publication_count": 2,
    "primary_language": "en",
    "secondary_language": "ta"
  }
}
```

Mirrors existing pattern where `events.config` already holds event-type-specific settings.

---

## 5. Surfaces — Compose Existing, Don't Recreate

| Surface | Implementation | Existing reuse |
|---|---|---|
| **My Pulse** (Learner) | `/ai-pulse/page.tsx` | New thin component over registrations filtered to `startup_events.config->>'kind' = 'ai_pulse'` |
| **Live Session** | `/ai-pulse/live/[cycle]/page.tsx` | New (Meet wrapper); writes to `event_team_attendance` |
| **Section Rotation** (Class Incharge) | `/ai-pulse/rotation/[section_id]/page.tsx` | Reuse `attendance-roster.tsx` from `academic/attendance/_components/` |
| **Lab Scoring** | redirect → `/startup-studio/events/[id]/evaluate` | Reuse |
| **Leaderboard** | redirect → `/startup-studio/events/[id]/leaderboard` | Reuse |
| **Gold Standard Declaration** | redirect → `/startup-studio/events/[id]/declare` | Reuse |
| **Lab Demo Day** | redirect → `/startup-studio/events/[id]/demo-day` | Reuse |
| **Champion Console** | `/ai-pulse/admin/cycles/page.tsx` | Composes `events/[id]/dashboard` + new cycle-creation flow |
| **Quiz Authoring Console** | `/ai-pulse/admin/quiz/[cycle]/page.tsx` | New (Q7 + Q16 sustainability requirement) |
| **Anomaly Review** | `/ai-pulse/admin/anomalies/page.tsx` | New (Q11) — reads `ai_pulse_anomaly_flags` |
| **NAAC Evidence Export** | `/ai-pulse/evidence/naac/page.tsx` | Thin wrapper over `quality_evidence_mappings` |
| **Director Digest** | Existing daily-digest extended | Add AI Pulse section to existing `fn_generate_super_admin_daily_digest` |
| **Policy Admin** | `/admin/config/ai-pulse/page.tsx` | New — edits `ai_pulse_policies` |

**13 surfaces from v2 → 4 genuinely new + 4 thin filtered wrappers + 4 reuse-via-redirect + 1 extension to existing digest.** Most code is already written.

---

## 6. Wave Plan (3 weeks vs v2's 5)

### Wave A — Schema delta (Week 1, ~120 LOC migration)
- A.1: 1 migration with 3 new tables + 1 column add + 2 ENUM extensions + 22 seeded policy rows + featured-tool seed rows
- A.2: Cycle-generation cron (extend existing pattern from `/api/cron/sunday-wrap/`)

### Wave B — New surfaces (Week 2, ~6 routes)
- B.1: Champion Console + cycle creation
- B.2: Quiz Authoring Console (bilingual, AI-suggest from transcript)
- B.3: Section Rotation (Class Incharge attendance marking)
- B.4: Live Session (Meet join + 4-AND engagement signal capture)
- B.5: Anomaly Review
- B.6: Policy Admin

Surfaces composing existing event components are thin wrappers (~50 LOC each).

### Wave C — IQAC pipe + Director digest extension (Week 3)
- C.1: NAAC evidence export
- C.2: Director Tuesday digest extension
- C.3: silent-failure-auditor sweep + browser-verify

---

## 7. Decision Log (preserved from v2 — 16 /interview decisions still valid)

| Q | Pick | v3 Implementation |
|---|---|---|
| Q0 | engaged_attendance_rate ≥95% | Lock §0 above |
| Q1 | All 5 value lists CRUDable master tables | Reduced to 3 new master tables (others move to JSONB or existing tables) |
| Q3 | All 22 policies in `ai_pulse_policies` | Yes — single new config table |
| Q4 | Quarterly external judges | `events.config.external_judge_cycle: true` quarterly |
| Q5 | Both excuses + async make-up rescue | `event_team_attendance.day_type` includes `'async_makeup'`; engagement_signals JSONB encodes pass |
| Q6 | Bottom-2 visible on MyJKKN intranet only | `ai_pulse_policies.bottom_n_visibility_scope='myjkkn_intranet'` |
| Q7 | Champion-authored quizzes | New `/ai-pulse/admin/quiz` console only |
| Q8 | Google Drive recordings | `events.config.recording_url` |
| Q9 | Single named deputy | Co-Champion = Ranjith (locked) |
| Q10 | Adaptive 3/5/7 teams by section size | `ai_pulse_policies.team_count_thresholds` JSONB; team count enforced when generating `event_team_members` |
| Q11 | Algorithmic flagging + Champion monthly review | `ai_pulse_anomaly_flags` table |
| Q12 | Move beyond Lovable | `ai_pulse_featured_tools` master + `events.config.featured_tool_id` |
| Q13 | Unified across 8 colleges | One `events` row per cycle (institution_id = JKKN parent) |
| Q14 | Multilingual transcript quality unreliable | Don't rely on auto-captions; bilingual is human-led |
| Q15 | Featured tool rotates weekly | Champion sets `events.config.featured_tool_id` per cycle |
| Q16 | Bilingual sessions + quizzes | `ai_pulse_policies` rows for primary/secondary language; `event_team_attendance.engagement_signals.quiz_score_lang_*` |

---

## 8. Dependencies & Risks

| Dependency | Status |
|---|---|
| PR #630 (`notifications.is_layer_0`) | OPEN — blocks Director-digest red-flag rendering |
| Champion = Krishnaveni | ✅ Locked 2026-04-29 |
| Co-Champion = Ranjith (Ranjith@jkkn.ac.in) | ✅ Locked 2026-05-02 |
| Section-attendance role | ✅ Reuse `class_incharges` (locked 2026-05-02) |

| Risk | Mitigation |
|---|---|
| events vs startup_events schema split | OQ-1 below — must resolve before Wave A.1 |
| ~~`event_type` constraint~~ | ✅ Resolved 2026-05-02 audit: `startup_events` has no `event_type` column. Using `config.kind` JSONB discriminator — no schema risk. |
| Krishnaveni quiz-authoring × 2 languages | Quiz Authoring Console (B.2) with AI-suggest |
| Recurring weekly cycle generation | Cron pattern reused from `/api/cron/sunday-wrap` |

---

## 9. Acceptance Criteria

- ≥ 95% engaged_attendance_rate per cycle across 44 depts × 12 cycles (90 days)
- 100% bilingual coverage on quizzes
- < 10% anomaly false-positive rate after 4 monthly reviews
- 4 quarterly external-judge cycles in year-1
- 0 sidebar/permission catalog drift
- Outcome metric verdict at day 90 (per §0 kill criterion)

---

## 10. Open Questions (4 — must resolve before Wave A.1)

1. ✅ **events vs startup_events — RESOLVED 2026-05-02:** Use `startup_events` with `config.kind='ai_pulse'` JSONB discriminator. All team/attendance/submission/demo-slot infrastructure already references `startup_events(id)`. Zero schema change to that table; AI Pulse cycles inserted as new rows with config kind set.
2. **Accessibility for visual/hearing impairment** — Q14 noted multilingual auto-transcripts unreliable. Phase 2 design pass needed.
3. **`learners` FK column** — `learners.id` vs `learners_profiles.id` — outstanding from v2. Likely irrelevant in v3 if all learner tracking flows through `event_registrations`.
4. **External judge recruitment workflow** — quarterly cadence locked; sourcing/honorarium/format TBD.

---

## 11. v1/v2 → v3 Refactor Provenance

- **v1 (2026-04-29):** drafted via `/sdd` pipeline. 13 tables. Wrong assumption: AI Pulse needs its own substrate.
- **v2 (2026-04-29):** drafted via `/interview` 4 rounds. 15 tables. Same wrong assumption, more decisions locked.
- **v3 (2026-05-02):** Director surfaced `/staff/class-incharges` (existing) → triggered audit → events module discovered as 80% of substrate → reframe as extension. **3 new tables + 1 new column + 2 ENUM extensions.**
- **Closed PRs:** #633 (spec v1/v2) closed with reference to this v3. #634 (15-table migration) closed — replaced by ~120-LOC events-extension migration in a future PR.

---

*Spec authored 2026-05-02 in response to Director directive: "read what's already in the codebase, find the pattern, extend it. Only the last resort is the new file/specs." 12 of 15 v2 tables collapse into existing events infrastructure. Outcome metric locked. Wave A.1 migration drafts after OQ-1 (events vs startup_events) resolves.*
