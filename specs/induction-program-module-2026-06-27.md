# Fresher Induction Program — Module Spec

**Date:** 2026-06-27
**Author:** Mac Claude (interview with Director)
**Status:** Scoped & decided — awaiting build go
**Source artifact:** Arts College 10-day induction schedule (24-06 → 09-07-2026), pasted by Director

---

## 1. One-line decision

Induction is **not** a new module. It is the existing **`orientation` event category** (seeded display name "Orientation / Induction") on the **Events platform**, extended with a thin per-student tracking layer that *drives the lifecycle fields MyJKKN already has* (`learners_profiles.lifecycle_status`, `is_profile_complete`, and the `learners/onboarding` completion funnel).

**Why not a new module:** the Events platform already models multi-day programs with daily sessions, time slots, venues, speakers, NAAC criteria, and IQAC evidence status. Rebuilding that = waste + drift. Find the pattern, extend it.

---

## 1b. The real success criteria (Director, 2026-06-27)

**Induction succeeds when freshers refer prospects who JOIN vacant seats — and that happens only because freshers genuinely experienced value.** Attendance is *participation*, not success.

Causal chain the design must drive (value-first):

```
EXPERIENCED VALUE  →  ADVOCACY INTENT  →  REFERRAL SUBMITTED  →  REFERRAL JOINED
(per-session 1–5)     ("recommend JKKN?")   (fresher effort gate)   (PROGRAM KPI: ≥1, ideally 1–2 per fresher,
                                                                     into a vacant seat)
```

Design principle: **maximize experienced value using ALL of JKKN's resources** (every department showcase + Startup Studio, Incubation, 3D printing/AHS, CDC/placement, sports, clubs, wellness, senior-learner mentorship, the MyJKKN/UMIS platform). Each asset experienced = a concrete reason to tell a friend "join JKKN."

---

## 2. Locked decisions (14, from a 4-round interview)

| # | Decision | Choice |
|---|---|---|
| 1 | Where it lives | **Extend the Events platform** (`orientation` category) |
| 2 | How much to track | **Full: per-session attendance + per-session feedback** |
| 3 | Who sees it | **Students see their batch schedule + resources** |
| 4 | Other colleges | **Central reusable blueprint** (one master, each college customizes a copy) |
| 5 | Attendance capture | **Coordinator marks the roster** per session |
| 6 | Feedback | **Students rate each session (1–5 + comment)** |
| 7 | Fresher list | **Auto-list first-years; lateral (2nd-year direct) entrants included** |
| 8 | Batch split | **Auto-split by department/program** (whole depts go together) |
| 9 | Completion rule (participation) | **Attended ≥ 75% of their sessions** |
| 10 | Profile deadline | **`is_profile_complete = true` by the last induction day** |
| 11 | Referral institution scope | **Any JKKN counts; own institution weighted higher** |
| 12 | Referral conversion window | **Joined by end of this admission cycle / academic year** (while seats vacant) |
| 13 | Per-fresher gate vs program KPI | **Effort gates the fresher (submit ≥1 genuine referral); JOINS = program KPI** (not held against the individual) |
| 14 | Design philosophy | **Value-first**: induction maximizes experienced value (using ALL JKKN resources) → authentic advocacy → referrals that join |

**Director's framing on #5 (load-bearing):** freshers are *already* MyJKKN users (records + login created at admission via the account-transition). The **first induction session is the onboarding moment** — capture slim details + activate, then the **detailed profile is filled across the later induction days**. Induction is therefore the *engine that drives the existing onboarding-completion funnel to done.*

---

## 3. Verified production facts (the substrate)

- **Account creation happens at admission, not induction.** `lib/services/admission/account-transition-service.ts` + `rpc_admission_account_transition_with_bills` + `app/api/admission/bridge/convert` create `learners_profiles` + login + bills. By induction, freshers exist with `is_profile_complete = false`.
- **`learners/onboarding`** = the profile-completion funnel (missing-field tiers: critical / needs_work / almost). **Reuse, do not duplicate.** Induction drives this to 100%.
- **Lifecycle:** `learners_profiles.lifecycle_status` = `admitted → active → graduated`. `admission_leads.funnel_stage` is the *separate* pre-admission enum — do not conflate.
- **Events spine (prod, additive migrations `20260417000001`–`000005`):**
  - `events` — has `event_category_id`, `naac_criteria TEXT[]`, `iqac_evidence_status`, `target_audience JSONB`, `scope`, `visibility`, venue.
  - `event_sessions` — `day_number`, `session_order`, `start_at`/`end_at`, `venue_text`/`venue_resource_id`, `primary_speaker_id`, `status`.
  - `event_human_roles` — `user_id` (internal) OR `external_contact JSONB` (external); `role_type` incl. `speaker`,`coordinator`.
  - `event_categories` — has `approval_chain_template`, `required_docs_config` JSONB (blueprint home); `orientation` category seeded as "Orientation / Induction".
  - `events/presets` page exists (events-promotion "presets-per-type").

---

## 4. Data model

### 4.1 Reuse (extend only)
- **`events`** — one row per (college × academic year) induction. `event_category_id` → orientation; set `naac_criteria`, `iqac_evidence_status`, `target_audience`. Tag academic year.
- **`event_sessions`** — one row per Day × Batch × time-slot. Combined "Batch A & B" sessions = batch `both`.
- **`event_human_roles`** — resource persons. Extend `role_type` (or `external_contact.kind`) to credit **department** and **student-group** (e.g., "English Department", "TFD Learners") alongside named-staff + external vendors.
- **`learners_profiles` + `learners/onboarding`** — the per-student profile-completion track. Induction drives `is_profile_complete`.
- **Existing session-feedback engine** — keyed to `session_id`.
- **Coordinator-roster attendance pattern** — mirror for sessions.

### 4.2 Net-new (small, additive)
1. `event_sessions.outcome_text TEXT` — the *stated* learning outcome (your "Outcome" column; NAAC language). Distinct from measured feedback.
2. `event_sessions.resource_links JSONB` — PPT / Google Drive / Slides links (+ optional "who can view" note; Drive folders may gate access).
3. `event_sessions.batch TEXT CHECK (batch IN ('A','B','both'))` (or FK to `induction_batches`).
4. `induction_batches` — `(event_id, batch_label, fill_rule)`.
5. `induction_enrollment` — `(event_id, learner_id, batch, enrolled_at, source)`. Auto-built: first-years + laterals; auto-split by department.
6. `event_session_attendance` — `(session_id, learner_id, status CHECK present|absent|excused|od, marked_by, marked_at)`. Coordinator-marked.
7. `induction_completion` — rollup `(event_id, learner_id, sessions_attended, sessions_total, attendance_pct, participation_complete, value_score_avg, advocacy_score, referrals_submitted, referrals_joined, outcome_complete, completed_at)`.
   - `participation_complete = attendance_pct >= 75` (the participation track).
   - `outcome_complete = referrals_submitted >= 1` (the fresher's *effort* gate — what they control).
   - `referrals_joined` = **program KPI**, READ from the admission funnel; never gates the individual.
   Surfaced on student record + dashboard + NAAC rollup.

### 4.3 Referral outcome — reuse the admission referral chain (do NOT build new)
- A fresher refers via the **existing admission referral bridge** (PR #243): a new `admission_leads` row with `lead_source = 'learner'` + `referred_by` = the fresher's learner_id (referral fields already on `learners_profiles`, synced by `sync_lead_referral_to_learner_profile`).
- "Joined a vacant seat" = referred lead reaches admitted/enrolled, checked against `admission_year_quota_seats` / `intake_history` vacancy (`intake_capacity` − filled).
- Induction adds only: (a) a **refer-a-prospect CTA** surfaced during/after induction, and (b) a **read-only measurement rollup** (a VIEW/RPC) joining `admission_leads.referred_by` → join status → seat vacancy. **No new referral table.**
- Scope/weight (decisions 11–12): count joins at any JKKN institution, own-institution weighted higher, within the current admission cycle.

### 4.3 Security (mandatory per CLAUDE.md)
Every new RPC: `STABLE SECURITY DEFINER SET search_path=public` + `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT ... TO authenticated`. RLS on every new table: `is_super_admin() OR is_admin() OR (user_has_permission('induction.<action>') AND role_has_institution_access(institution_id))`. Permission prefix: `induction.*` (or `events.induction.*`).

---

## 5. Student journey (ties to the real schedule)

```
ADMITTED (record + login already exist, is_profile_complete=false)
  → Day 1 Inaugural (MD Sir, Batch A&B): activation + slim onboard
  → Day 2 "MYJKKN" (Vishvanadhan) + Day 7 "UMIS Overview": platform sessions = profile-fill drivers
  → across days: coordinator marks attendance; student rates each session 1–5
  → by Day 10: is_profile_complete=true (deadline)
  → attendance ≥ 75% ⇒ induction_completion.is_completed=true ⇒ lifecycle_status=active
  → events.iqac_evidence_status feeds NAAC Criterion 5/7 automatically
```

---

## 5b. Success model — the value→join funnel + scorecard

The induction "scorecard" (per college × year) is a read over existing data + the new feedback/attendance rollups:

| Stage | Signal | Source | Role |
|---|---|---|---|
| **Value** | per-session 1–5 + comment | new session-feedback link (reuse engine) | leading; low scores = fix-this signal |
| **Advocacy** | "How likely to recommend JKKN?" (0–10) at induction end | reuse feedback engine | bridge; predicts referrals |
| **Referral (effort)** | referrals submitted (≥1 gates the fresher) | `admission_leads` (lead_source='learner', referred_by) | the fresher's controllable gate |
| **Joined (KPI)** | referrals that enrolled in a vacant seat | admission funnel × seat vacancy | **headline success number** |

Reporting: value → advocacy → submitted → joined (+ seats filled), drillable by college / department / batch / session. Sessions with low value scores are the explicit improvement loop for next year's blueprint.

## 5c. Design principle — use ALL of JKKN
The blueprint deliberately routes every fresher through JKKN's full asset map (each asset experienced = a future referral talking point):
- **Shared JKKN spine** (every college): Startup Studio, Incubation, 3D printing/AHS, CDC/Placement, Sports, Clubs, Wellness/Yoga, Library, MyJKKN/UMIS platform, senior-learner mentorship, MD address.
- **Per-college showcases** (the college's own copy adds): its signature departments (Arts e.g. TFD fashion show, English/Tamil, Microbiology open mic, Growth Hacking).
Blueprint = shared spine; college copy = spine + domain showcases.

## 5d. Self-improving loop — reuse the ONE SCF loop (multi-scope), re-point its verifier

**Correction (Director, 2026-06-27): SCF is NOT two loops — it is ONE self-improving loop running at three scopes, unified by a memory+verifier core.** Induction reuses the *whole* loop; we change exactly one thing (what the verifier closes on).

SCF's real anatomy (verified in `jicate/main` migrations):
- **Per-learner scope** — `fn_scf_nudge_pending_learners`, `fn_scf_carryforward_for_learner` (nudge each student; re-ask "better this time?").
- **Per-actor scope** — `fn_scf_faculty_followups` (the actor's own weak sessions + did the next one improve — the "lift").
- **Leadership scope** — `session_feedback_escalations` + weekly escalation digest (tiered push when a unit repeatedly underperforms).
- **Self-improving CORE (the reason it's not just a repeat):** `scf_ai_suggestions` = MEMORY (each suggestion + the input state it was based on + the outcome) and `fn_scf_measure_suggestion_outcomes` = VERIFIER (did the *next* session actually improve?). Cron: `scf-measure-outcomes`.

**Induction reuse = inherit all of the above; re-point ONLY the verifier's outcome:**
- SCF verifier asks: *"did the next session's understanding lift?"*
- Induction verifier asks: *"did this fresher refer — and did the referral JOIN a vacant seat?"*
- Scope re-map: per-learner = the **fresher** (nudge to refer; carry-forward "did your referral convert?"); per-actor = the **coordinator/college** (which sessions drove joins); leadership = the **cross-college induction scorecard** escalation. The `scf_ai_suggestions` memory now remembers "we changed session X / nudged fresher Y"; the verifier attributes the **join** back to it.
- **Reward guardrail:** optimize referral-joins **balanced with value/advocacy** — never trade genuine educational value for referral pressure (consistent with decision 13 "effort gates the fresher" + the value-first philosophy).

**Build discipline:** SIMULATE the loop across ≥3 cycles before shipping (a 3-cycle sim previously caught a clock-ordering bug a static review missed — `feedback_simulate_stateful_logic_and_autosave_commits`).

## 6. Edge cases (decided)

- **Batches swap topics** (Day 2: A=Zero-to-Hero / B=MYJKKN, swap PM) → two session-instances of the same topic, each batch-scoped. Native.
- **Combined sessions** (Inaugural, Placement, Talent Hunt) → `batch='both'`.
- **Split slots** (Day 4/5 hourly splits) → explicit `start_at`/`end_at` per session. Native.
- **Resource-person variety** → staff (user_id) / external (external_contact) / department / student-group.
- **Tamil & half-empty rows** → store as-pasted, render correctly, never auto-generate Tamil; all non-essential fields optional with graceful empty states.
- **Late admission mid-induction** → enrollment re-runnable; missed sessions = absent (excusable).
- **Excused / OD** → attendance status includes `excused` + `od`.
- **Profile-complete ≠ induction-complete** → two separate signals, both shown, neither overwrites the other.
- **Year-over-year** → each induction tied to academic year; history preserved for NAAC.
- **Venue clash** → reuse events `resource_reservations` (already prevents double-booking).

---

## 7. Proposed build phases (NOT started — awaiting go)

- **Phase 0 — Blueprint + schema:** orientation "Induction" preset (the JKKN spine: Inaugural, MYJKKN, UMIS, Placement, Yoga, Talent Hunt) + the 5 new tables + `outcome_text`/`resource_links`/`batch` columns + RLS + locked-from-anon RPCs.
- **Phase 1 — Admin authoring:** clone-from-blueprint → fill days/sessions/speakers/venues/outcomes/links; auto-enroll (first-years + laterals); auto-split batches by department.
- **Phase 2 — Run it daily:** coordinator roster attendance per session; student per-session 1–5 + comment (reuse feedback engine).
- **Phase 3 — Student-facing value:** fresher sees batch schedule + resources + per-session feedback prompts; onboarding "finish your profile" nudge wired to the Day-10 deadline.
- **Phase 4 — Referral + advocacy:** end-of-induction advocacy/NPS question; refer-a-prospect CTA wired to the existing admission referral bridge (`lead_source='learner'`); fresher effort gate (≥1 submitted).
- **Phase 5 — Scorecard, lifecycle + NAAC:** the value→advocacy→submitted→**joined** scorecard (read over admission funnel × seat vacancy); `induction_completion` on student record + dashboard; IQAC/NAAC evidence auto-rollup.
- **Phase 6 — Self-improving + personalised loop:** reuse the SCF engine, reward = referrals-joined (balanced with value); program loop improves next year's blueprint, personalised loop nudges each fresher along the funnel. Simulate ≥3 cycles before ship.

Each phase = its own PR (or stacked set), built from a `jicate/main` worktree, shipped via `/ship-myjkkn`.

---

## 8. Open / assumed (confirm at build time)
- "Slim details" captured at first session = minimal set to activate + assign batch (name, phone, college email, department). Confirm exact fields.
- Permission prefix `induction.*` vs `events.induction.*` — pick at Phase 0.
- Whether `batch` lives as a column on `event_sessions` or via `induction_batches` FK — finalize when wiring auto-split.
