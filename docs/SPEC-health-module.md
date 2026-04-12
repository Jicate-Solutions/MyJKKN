# SPEC: MyJKKN Health Module

> Campus Health Intelligence System for JKKN Institutions

**Status:** SPEC + PLAN COMPLETE — Awaiting human gate approval
**Created:** 2026-04-12
**Author:** Omm + Claude Code (SDD Pipeline)
**Module Route:** `/health/*`

---

## 1. True Goal

Build a closed-loop campus health ecosystem where health sciences students (Dental, Nursing, Pharmacy, Allied Health) provide clinical services to all 4,785 learners, earning practicum hours while generating health data for research and NAAC accreditation.

**Priority model:** All three pillars are EQUAL — student welfare, NAAC accreditation, and clinical training. The flywheel only works when all three are weighted equally. Each reinforces the others.

**This is NOT a fitness app.** It's a system that converts JKKN's unique advantage (4 health colleges out of 8 total) into a measurable wellness program that no other Indian institution has.

---

## 2. Users & Personas

| Persona | Count | Primary Actions | Frequency |
|---------|-------|----------------|-----------|
| **Learner** (all colleges) | 4,785 | Mood check-in, step counter, water tracker, view health profile, take PHQ-9/GAD-7 | Daily |
| **Health Sciences Student** (Dental/Nursing/Pharmacy/Allied Health) | ~1,200 | Conduct screenings, log assessments, view auto-credited practicum hours | During health camps |
| **Campus Counselor** | 1-3 | Receive auto-escalation alerts, view at-risk students, track intervention outcomes | On-demand (alert-driven) |
| **Faculty Supervisor** | ~20 | Approve practicum hours, supervise health camps, view clinical reports | Weekly |
| **HOD / Principal** | 8 | View institution-level health dashboard, anonymized trends | Monthly |
| **Director** | 1 | Cross-institution health analytics, NAAC readiness reports, SDG 3 mapping | Quarterly |

---

## 3. Current State

**Health screenings do NOT exist today** at JKKN. There is no cross-college health program, no digital health tracking, no clinical integration between health colleges and other colleges. This module CREATES the program from scratch — it doesn't digitize an existing one.

**What exists in MyJKKN today:**
- `learners_profiles.blood_group` — only health-adjacent column (often empty)
- Marathon `events_registrations.custom_data` — blood group, emergency contacts, t-shirt size for 1,590 participants
- Admission counselors (CRM role, NOT health counselors)
- PDE module with assessments, badges, quests (reusable patterns)
- Escalation system in notifications (reusable for PHQ-9 auto-escalation)
- Service request workflows (reusable status transitions)
- Custom roles system (`custom_roles` table) — health roles need to be created

---

## 4. Happy Paths

### 4.1 Learner Daily Check-In (5 seconds)

```
Student opens MyJKKN → Health module
  → Sees dashboard: steps today, water glasses, mood streak, hostel ranking
  → Taps mood emoji (😄 😊 😐 😢 😫)
  → Rates sleep quality (1-5 stars)
  → Rates stress level (1-5 blocks)
  → Taps "Done ✓"
  → Dashboard updates with today's entry
  → Streak counter increments
  → Leaderboard position updates
```

### 4.2 Nursing Student Conducts Health Assessment

```
Nursing student opens MyJKKN → Health → Screenings
  → Selects "New Assessment"
  → Scans learner's QR/BIB or searches by name
  → Records: BP (systolic/diastolic), Weight, Height, Vision (L/R)
  → System auto-calculates BMI
  → Submits assessment
  → System auto-credits 0.5 practicum hours to the nursing student's academic record
  → Learner's health profile updates with new BMI, BP readings
  → If BP > 140/90 → auto-flags for counselor follow-up
```

### 4.3 PHQ-9 Depression Screening

```
System triggers quarterly PHQ-9 (or student self-initiates)
  → 9 questions, each scored 0-3 (standard validated instrument)
  → Student completes in ~3 minutes
  → System auto-scores: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe
  → IF score > 15:
    → Student sees: "Based on your responses, we recommend speaking with a counselor. Here's how to book a session."
    → Counselor receives alert: "Student [name] scored [score] on PHQ-9. Recommended action: [guidance]."
  → Score stored in health_assessments table (encrypted, student + counselor access only)
  → Anonymized aggregate: Director sees "23% of Engineering hostelers report moderate+ depression"
```

### 4.4 Dental Camp Workflow

```
Dental College announces camp date in MyJKKN
  → Target students get notification: "Free dental screening on Apr 20, 9 AM - 4 PM"
  → Students register for time slots
  → Camp day: Dental students scan attendees, record findings (cavities, gum health, scaling needed)
  → Each dental student's screening count auto-credits practicum hours
  → Students receive results in their health profile
  → Referrals auto-generated for those needing follow-up treatment
  → Camp completion data flows to NAAC wellness report
```

---

## 5. Sad Paths & Error Scenarios

| Scenario | System Response |
|----------|----------------|
| Student refuses PHQ-9 screening | Screening is VOLUNTARY. No penalty. No flag. System records "declined" with timestamp. |
| PHQ-9 score is critical (>20) and student is unreachable | Counselor escalation → if no response in 24h, escalate to HOD with minimal info ("student may need support") |
| Nursing student enters wrong BP reading (e.g., 300/200) | Input validation: systolic 60-250, diastolic 40-150. Out-of-range = warning, not block. |
| Step counter shows 0 all week | No negative consequence. System shows gentle prompt: "Haven't tracked steps this week? Turn on pedometer in settings." |
| Health data breach attempt | RLS policies: individual health data accessible ONLY by student + counselor. Aggregates only for leadership. |
| Student transfers between colleges mid-year | Health data follows the learner (tied to `learner_id`, not `institution_id`). Counselor access transfers with institution change. |

---

## 6. Recovery

| Mistake | Fix |
|---------|-----|
| Wrong blood group entered | Student or counselor can edit health profile. Change logged in audit trail. |
| False positive on PHQ-9 (student was joking) | Counselor marks case as "resolved - false positive" in the escalation log. No permanent record in student's academic file. |
| Duplicate health assessment | De-duplication by learner_id + assessment_type + date. Same-day duplicates rejected with warning. |
| Practicum hours over-credited | Faculty supervisor can adjust hours. Audit log shows original + adjusted values. |

---

## 7. Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Student at Engineering gets dental screening from Dental College student | Cross-institution screening allowed. Dental student gets hours credited to Dental College. Engineering student's profile updated. |
| Learner has blood group in marathon data but NOT in health profile | Auto-migrate: on first health module access, pull `blood_group` from `events_registrations.custom_data` if health profile is empty. |
| Student under 18 | Same privacy rules. Mental health data: student + counselor only. Parents see general wellness status (active/inactive) but NOT PHQ-9 scores. |
| 703 hostelers — mandatory health profile completion? | Hostelers get a "complete your health profile" prompt on login. Not blocking, but tracked. Hostel warden dashboard shows completion %. |
| Student has no smartphone (edge case at JKKN) | Step counter disabled. Manual mood check-in via web (computer lab). BMI/BP from in-person screenings still captured. |

---

## 8. Permissions (Who Can Do What)

| Role | Health Profile | Mood Data | PHQ-9 Scores | Screening Records | Practicum Hours | Analytics |
|------|---------------|-----------|--------------|-------------------|-----------------|-----------|
| **Student (own data)** | Read + Edit | Read + Write | Read + Write (voluntary) | Read | N/A | Own trends |
| **Health Sciences Student** | N/A | N/A | N/A | Create (for others) | View own auto-credited hours | N/A |
| **Campus Counselor** | Read (flagged students) | Read (flagged) | Read (auto-escalated) | N/A | N/A | At-risk dashboard |
| **Faculty Supervisor** | N/A | N/A | N/A | Approve/review | Approve/adjust | Camp reports |
| **HOD / Principal** | N/A | N/A | N/A | N/A | Institution totals | Anonymized aggregates |
| **Director / Super Admin** | N/A | N/A | N/A | N/A | Cross-institution totals | Full anonymized dashboard |

**New custom roles to create:**
- `health_counselor` — access to escalated student data
- `health_screener` — can create screening records for other students
- `health_supervisor` — approve practicum hours, manage health camps

---

## 9. What They See (UI Requirements)

### 9.1 Student Mobile Dashboard (First Screen)

```
┌───────────────────────────────┐
│  Good Morning, Karthika ☀️     │
│                               │
│  🚶 3,247 steps    🏆 #12     │
│  ━━━━━━━━━━━━━ 65% of goal   │
│                               │
│  💧 ████░░░░ 4/8 glasses      │
│                               │
│  😊 7-day mood streak         │
│  [Check in now →]             │
│                               │
│  ┌─────────────────────────┐  │
│  │ 📅 Dental Camp: Apr 20  │  │
│  │ 🏥 BMI: 22.4 (Normal)   │  │
│  │ 🩸 Blood: B+            │  │
│  └─────────────────────────┘  │
│                               │
│  Pharmacy Hostel: 🥇 This Week│
└───────────────────────────────┘
```

### 9.2 Admin Health Dashboard

```
┌────────────────────────────────────────────┐
│  JKKN Health Intelligence Dashboard        │
│                                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  │ 4,785│ │ 2,847│ │  67% │ │  12  │     │
│  │Total │ │Active│ │Mood  │ │Alerts│     │
│  │Learn.│ │Users │ │Check │ │Today │     │
│  └──────┘ └──────┘ └──────┘ └──────┘     │
│                                            │
│  Institution Wellness Scores:              │
│  Engineering  ████████░░ 78%               │
│  Dental       ███████░░░ 72%               │
│  Pharmacy     █████████░ 89%               │
│  Nursing      ██████████ 95%               │
│                                            │
│  Stress Trend (30 days):                   │
│  ─────/\────/──────── Avg: 2.3/5          │
│                                            │
│  PHQ-9 Distribution:                       │
│  Minimal: 67% | Mild: 22% | Moderate: 8%  │
│  Mod-Severe: 2% | Severe: 1%              │
└────────────────────────────────────────────┘
```

### 9.3 Counselor Alert View

```
┌────────────────────────────────────────────┐
│  ⚠️ Active Alerts (3)                      │
│                                            │
│  🔴 HIGH: Rahul K (Eng, Sem 4)            │
│     PHQ-9: 18 (Moderately Severe)          │
│     3h ago · Not yet contacted             │
│     [Contact →] [View History →]           │
│                                            │
│  🟡 MEDIUM: Priya S (Pharmacy, Sem 2)     │
│     Mood: 😢 for 5 consecutive days       │
│     12h ago · Counselor notified           │
│     [Contact →] [View History →]           │
│                                            │
│  🟢 RESOLVED: Arun M (Dental, Sem 6)      │
│     PHQ-9: 16 → 8 after 3 sessions        │
│     Marked resolved by Dr. Selvi           │
└────────────────────────────────────────────┘
```

---

## 10. Connections & Integrations

| System | Integration | Priority |
|--------|-------------|----------|
| **Academic Module** | Attendance-health correlation (auto-detect: low mood + low attendance pattern) | Phase 4 |
| **Campus Living** | Hostel-specific health dashboards. Warden sees hosteler wellness summary. | Phase 2 |
| **Events/Marathon** | Activity history — past marathon/sports participation feeds into health profile | Phase 1 |
| **Notifications** | Auto-escalation engine — reuse existing `escalation_level` pattern | Phase 2 |
| **PDE (Badges/Quests)** | Gamification — wellness badges, step challenges, health quest campaigns | Phase 1 |
| **ABDM** | NOT integrating. Internal-only. Schema designed for future ABDM compatibility if needed. | Deferred |

---

## 11. Success Criteria

### 3-Month Target: 50%+ Daily Active Users

| Metric | Target | How to Measure |
|--------|--------|---------------|
| **DAU (Daily Active Users)** | 2,400+ (50% of 4,785) | Count of unique `mood_checkins` per day |
| **Health Profile Completion** | 80%+ | Learners with blood_group + emergency_contact + allergies filled |
| **Mood Check-in Streak** | 30%+ with 7+ day streaks | `streak_count >= 7` in `health_daily_logs` |
| **Step Counter Adoption** | 40%+ tracking steps | Learners with `step_count > 0` at least 3 days/week |
| **Screening Camp Conducted** | At least 1 | Digital records in `health_screenings` table |
| **Counselor Escalation Working** | <2h response time | Time between PHQ-9 alert and counselor acknowledgment |
| **Zero Data Breaches** | 0 | RLS audit: no cross-student data leaks |

### 12-Month Target: NAAC-Ready

| Metric | Target |
|--------|--------|
| Cross-college health screenings | 3+ types (dental, nursing, pharmacy) |
| Practicum hours logged | 500+ clinical hours across health colleges |
| Research dataset | Anonymized export used in 1+ faculty publication |
| NAAC wellness report | Auto-generated, covers SDG 3 criteria |

---

## 12. Data Privacy & Compliance

| Data Type | Storage | Access | Encryption |
|-----------|---------|--------|------------|
| Blood group, allergies, medical conditions | `health_profiles` table | Student + counselor + screening staff | Standard RLS |
| Mood check-ins (daily) | `health_daily_logs` table | Student only (anonymized aggregates to leadership) | Standard RLS |
| PHQ-9 / GAD-7 scores | `health_assessments` table | Student + assigned counselor ONLY | Column-level encryption recommended |
| BP, BMI, vision readings | `health_screenings` table | Student + screening staff + supervisor | Standard RLS |
| Step count, water intake | `health_daily_logs` table | Student only | Standard RLS |
| Practicum hours | `health_practicum_hours` table | Health student + supervisor | Standard RLS |

**Indian health data laws:** No specific HIPAA equivalent in India for educational institutions. Follow IT Act 2000 + DPDP Act 2023 principles: consent, purpose limitation, data minimization, reasonable security.

---

## 13. Phased Implementation

### Phase 1: Health Profile + Physical Tracking (Weeks 1-2)

**Tables:** `health_profiles`, `health_daily_logs`, `health_goals`
**Pages:** `/health/dashboard` (student), `/health/profile` (student), `/health/leaderboard`
**Features:** Step counter (manual entry from phone Health app; Capacitor native app in Sprint 2), water intake, health profile CRUD, gamification (streaks, badges by mood/water consistency), consent gate (simple one-time "I Agree" screen), activity history from events

### Phase 2: Mental Health + Escalation (Weeks 3-4)

**Tables:** `health_assessments`, `health_escalations`, `health_peer_support`
**Pages:** `/health/mood` (check-in), `/health/assessments` (PHQ-9/GAD-7), `/health/counselor` (counselor dashboard)
**Features:** Daily mood check-in (3 taps), PHQ-9/GAD-7 auto-scored instruments, auto-escalation to counselor, counselor alert dashboard, anonymous peer support forum

### Phase 3: Clinical Integration (Weeks 5-8)

**Tables:** `health_screenings`, `health_practicum_hours`, `health_camps`
**Pages:** `/health/screenings` (screener view), `/health/camps` (camp management), `/health/practicum` (hours tracker)
**Features:** Screening workflows (dental, nursing, pharmacy, physio), auto-credit practicum hours, camp scheduling + registration, cross-college screening support

### Phase 4: Analytics + Accreditation (Weeks 9-12)

**Tables:** `health_analytics_snapshots`
**Pages:** `/health/analytics` (admin), `/health/reports` (NAAC generator)
**Features:** Institution health dashboard, attendance-health correlation, NAAC wellness report auto-generation, SDG 3 mapping, anonymized research export

---

## 14. Assumptions (Flagged for Review)

| # | Assumption | Risk if Wrong |
|---|-----------|---------------|
| [A1] | Web Pedometer API works on most student phones (Android Chrome + iOS Safari) | If not supported, step counter requires native app wrapper |
| [A2] | JKKN has at least 1 campus counselor available for mental health escalation | If no counselor exists, auto-escalation has no recipient |
| [A3] | Health sciences faculty will supervise student-conducted screenings | If no faculty buy-in, Phase 3 clinical integration stalls |
| [A4] | Students will voluntarily do PHQ-9/GAD-7 screenings | If participation < 20%, mental health data is too sparse for trends |
| [A5] | Dental/Nursing students' academic calendar allows time for health camps | If practicum schedule conflicts, camps can't be staffed |
| [A6] | DPDP Act 2023 doesn't require explicit consent for institutional health programs | May need consent collection workflow added |

---

---

## 15. Locked-In Decisions (Post-Assumption Audit)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Step counting** | Manual entry (Sprint 1) → Capacitor native app (Sprint 2) | Web Pedometer API has 0% iOS support. No browser can count steps reliably. Manual entry for v1, native wrapper for v2. |
| **Counselor** | Build system now, appoint person later | Only 1 counselor (Priya Krishnan, Engineering) exists. System ready but auto-escalation dormant until qualified person appointed. |
| **Consent** | Simple one-time consent screen | DPDP Act requires consent. Most students 18+ so parental consent skipped. "I Agree" + "Learn More" gate on first access. |
| **Build priority** | Phase 1 + 2 together (web) then Capacitor | Ship mood + water + profile + PHQ-9 + GAD-7 + counselor dashboard in Sprint 1 (3 weeks). Capacitor native app in Sprint 2 (3 weeks). |
| **Gamification** | Full — streaks, badges, institution leaderboards | By mood streak and water consistency (not steps in Sprint 1). Steps leaderboard added when Capacitor ships. |
| **PHQ-9 success metric** | 30% participation (revised down from 50%) | Research shows 30-60% voluntary participation in Indian college PHQ-9 studies. 30% of 4,785 = 1,435 responses — statistically meaningful. |
| **Minors consent** | Skip for v1 — almost all students 18+ | JKKN is a college/university. DigiLocker parental consent deferred to v2 if needed. |

---

## 16. Implementation Plan

**Full plan:** `docs/plans/2026-04-12-health-module.md`

### Sprint 1: Web Module (Weeks 1-3) — 24 tasks

| Batch | Tasks | What Gets Built |
|-------|-------|----------------|
| Foundation | 0-5 | Consent table, health tables, RLS, types, service, hooks |
| Pages (parallel) | 6-11 | Dashboard, mood check-in, step entry, water tracker, profile, leaderboard |
| Integration | 12-14 | Sidebar, custom roles, build verify |
| Mental Health | 15-24 | PHQ-9/GAD-7 engine, escalation, counselor dashboard, peer support |

### Sprint 2: Capacitor Native App (Weeks 4-6)

| Task | What |
|------|------|
| Capacitor setup | Initialize Capacitor project, configure iOS + Android |
| Health Connect / HealthKit | Read step data from phone health stores |
| Background sync | Auto-sync steps every hour |
| Push notifications | Daily mood check-in reminder |
| Play Store listing | Build, sign, submit to Google Play |

### Sprint 3: Clinical Integration (Weeks 7-10) — Phase 3

| Task | What |
|------|------|
| Screening workflow | Dental/Nursing/Pharmacy assessment forms |
| Practicum auto-credit | Screening → hours auto-logged |
| Camp management | Schedule, register, track health camps |

### Sprint 4: Analytics + NAAC (Weeks 11-12) — Phase 4

| Task | What |
|------|------|
| Admin dashboard | Institution wellness scores, trend charts |
| NAAC report generator | Auto-generate wellness report for accreditation |
| Research export | Anonymized dataset for faculty publications |

---

*Spec + Plan produced by SDD Pipeline. Ready for human gate approval.*
