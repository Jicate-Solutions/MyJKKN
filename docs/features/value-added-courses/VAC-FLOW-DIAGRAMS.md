# VAC Module — Complete Flow Diagrams

**Created:** 2026-04-02
**For:** Implementation Reference
**Module:** Value-Added Courses (VAC) + CASE Graduation Tracker

---

## Table of Contents

1. [VAC Module Internal Flows](#1-vac-module-internal-flows)
   - 1.1 Course Catalog & Discovery Flow
   - 1.2 Enrollment Flow
   - 1.3 Lesson Progression & Sequential Gating
   - 1.4 CASE Graduation Tracker Flow
   - 1.5 Placement Test Flow
   - 1.6 Certificate & Completion Flow
   - 1.7 Admin Course Management Flow
   - 1.8 Admin Analytics Flow
   - 1.9 CASE Risk Alert System (Cron)
2. [Cross-Module Integration Map](#2-cross-module-integration-map)
   - 2.1 Master Integration Architecture
   - 2.2 VAC ↔ Organization Module
   - 2.3 VAC ↔ Learners Module
   - 2.4 VAC ↔ Billing Module
   - 2.5 VAC ↔ Academic (Attendance) Module
   - 2.6 VAC ↔ Academic (Timetable) Module
   - 2.7 VAC ↔ Staff Module
   - 2.8 VAC ↔ Notification Module
   - 2.9 VAC ↔ Admission CRM Module
3. [Data Flow Architecture](#3-data-flow-architecture)
4. [State Machine Diagrams](#4-state-machine-diagrams)

---

## 1. VAC Module Internal Flows

### 1.1 Course Catalog & Discovery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    COURSE CATALOG FLOW                           │
│                    Route: /vac                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐                                                    │
│  │ Learner  │                                                    │
│  │ visits   │                                                    │
│  │  /vac    │                                                    │
│  └────┬─────┘                                                    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                         │
│  │ Load Course Catalog                 │                         │
│  │ VACService.getCourses(filters)      │                         │
│  │                                     │                         │
│  │ Query: vac_courses                  │                         │
│  │   WHERE is_active = true            │                         │
│  │   AND institution_id = user's inst  │                         │
│  └────┬────────────────────────────────┘                         │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                         │
│  │ Display Page Layout                 │                         │
│  │                                     │                         │
│  │  ┌──────────┐  ┌────────────────┐   │                         │
│  │  │ FILTERS  │  │ COURSE GRID    │   │                         │
│  │  │          │  │                │   │                         │
│  │  │ Search   │  │ ┌──────┐┌────┐│   │                         │
│  │  │ Track    │  │ │Card 1││Card││   │                         │
│  │  │ Category │  │ │      ││  2 ││   │                         │
│  │  │ Fee Range│  │ └──────┘└────┘│   │                         │
│  │  │ Sort By  │  │ ┌──────┐┌────┐│   │                         │
│  │  │ NSQF Lvl │  │ │Card 3││Card││   │                         │
│  │  │          │  │ │      ││  4 ││   │                         │
│  │  └──────────┘  │ └──────┘└────┘│   │                         │
│  │                └────────────────┘   │                         │
│  └────┬────────────────────────────────┘                         │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                         │
│  │ RECOMMENDED COURSES Section         │                         │
│  │                                     │                         │
│  │ Query: vac_course_programmes        │                         │
│  │   JOIN vac_courses                  │                         │
│  │   WHERE programme_id =              │                         │
│  │     learner's programme_id          │                         │
│  │                                     │                         │
│  │ Shows courses mapped to learner's   │                         │
│  │ specific degree programme           │                         │
│  └────┬────────────────────────────────┘                         │
│       │                                                          │
│       │ Click on course card                                     │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                         │
│  │ Navigate to /vac/[courseId]         │                         │
│  │ (Course Detail Page)               │                         │
│  └─────────────────────────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Enrollment Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       ENROLLMENT FLOW                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐                                                        │
│  │ /vac/[courseId]                                                        │
│  │ Course Detail │                                                       │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────────┐    YES   ┌───────────────────────────┐         │
│  │ Already enrolled?    ├─────────►│ Show full course content  │         │
│  │                      │          │ (all lessons accessible   │         │
│  │ Check: vac_enrollments          │  based on progress)       │         │
│  │  WHERE user_id = me  │          └───────────────────────────┘         │
│  │  AND course_id = X   │                                                │
│  └──────┬───────────────┘                                                │
│         │ NO                                                             │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │ Show Course Preview  │                                                │
│  │                      │                                                │
│  │ ┌──────────────────┐ │                                                │
│  │ │ Course Info      │ │                                                │
│  │ │ - Name, Code     │ │                                                │
│  │ │ - Duration: 30h  │ │                                                │
│  │ │ - Fee: ₹500      │ │                                                │
│  │ │ - NSQF Level     │ │                                                │
│  │ │ - Fink's Profile │ │                                                │
│  │ └──────────────────┘ │                                                │
│  │                      │                                                │
│  │ ┌──────────────────┐ │                                                │
│  │ │ Lesson List      │ │                                                │
│  │ │ Hour 1 ✅ (free) │ │  ◄── Hour 1 always accessible as preview      │
│  │ │ Hour 2 🔒        │ │                                                │
│  │ │ Hour 3 🔒        │ │  ◄── Remaining hours locked                   │
│  │ │ ...              │ │                                                │
│  │ │ Hour 30 🔒       │ │                                                │
│  │ └──────────────────┘ │                                                │
│  │                      │                                                │
│  │ [  ENROLL NOW  ]     │  ◄── EnrollButton component                   │
│  └──────┬───────────────┘                                                │
│         │ Click Enroll                                                   │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │ Is this a CASE track │    YES   ┌──────────────────────────────┐      │
│  │ course?              ├─────────►│ Redirect to placement test   │      │
│  │                      │          │ /vac/case/placement/[trackId]│      │
│  │ Check: case_track_   │          │                              │      │
│  │   courses WHERE      │          │ (See 1.5 Placement Flow)     │      │
│  │   course_id = X      │          └──────────────────────────────┘      │
│  └──────┬───────────────┘                                                │
│         │ NO (regular VAC)                                               │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │ Create Enrollment    │                                                │
│  │                      │                                                │
│  │ INSERT vac_enrollments                                                │
│  │ {                    │                                                │
│  │   user_id,           │                                                │
│  │   course_id,         │                                                │
│  │   status: 'active',  │                                                │
│  │   payment_status:    │                                                │
│  │     'pending',       │                                                │
│  │   payment_amount:    │                                                │
│  │     course.fee       │                                                │
│  │ }                    │                                                │
│  └──────┬───────────────┘                                                │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │ Fee = 0 or waived?   │    YES   ┌──────────────────────────────┐      │
│  │                      ├─────────►│ Auto-set payment_status =   │      │
│  │                      │          │ 'waived'                     │      │
│  └──────┬───────────────┘          │ Redirect to course content   │      │
│         │ NO (fee > 0)             └──────────────────────────────┘      │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │ ★ BILLING MODULE ★   │                                                │
│  │ Generate bill in     │                                                │
│  │ billing_student_bills │                                               │
│  │                      │                                                │
│  │ Student pays via     │                                                │
│  │ /billing/schedule    │                                                │
│  │                      │                                                │
│  │ On payment complete: │                                                │
│  │ UPDATE vac_enrollments                                                │
│  │   SET payment_status │                                                │
│  │     = 'paid'         │                                                │
│  └──────┬───────────────┘                                                │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │ Full Course Access   │                                                │
│  │ Granted              │                                                │
│  │                      │                                                │
│  │ Redirect to          │                                                │
│  │ /vac/[courseId]      │                                                │
│  │ with all lessons     │                                                │
│  │ unlockable           │                                                │
│  └──────────────────────┘                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Lesson Progression & Sequential Gating

```
┌─────────────────────────────────────────────────────────────────────────┐
│              LESSON PROGRESSION (Sequential Gating)                      │
│              Route: /vac/[courseId]/[lessonId]                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  COURSE STRUCTURE (30 hours, 3 weeks):                                   │
│                                                                          │
│  Week 1 (LEARN)          Week 2 (LEVERAGE)      Week 3 (LEVERAGE)        │
│  ┌────┬────┬────┐       ┌────┬────┬────┐       ┌────┬────┬────┐         │
│  │H1  │H2  │H3  │  ...  │H11 │H12 │H13 │  ...  │H21 │H22 │... │        │
│  │FREE│LOCK│LOCK│       │LOCK│LOCK│LOCK│       │LOCK│LOCK│LOCK│         │
│  └──┬─┴──┬─┴────┘       └────┴────┴────┘       └────┴────┴──┬─┘        │
│     │    │                                                    │          │
│     │    │  Sequential unlock: H(N) completes → H(N+1) opens │          │
│     │    │                                                    │          │
│     ▼    ▼                                                    ▼          │
│                                                                          │
│  LESSON ACCESS CHECK:                                                    │
│                                                                          │
│  ┌───────────────────────────┐                                           │
│  │ Learner opens lesson      │                                           │
│  │ /vac/[courseId]/[lessonId]│                                           │
│  └──────────┬────────────────┘                                           │
│             │                                                            │
│             ▼                                                            │
│  ┌───────────────────────────┐                                           │
│  │ Is hour = 1?              │  YES → Always accessible (free preview)   │
│  └──────────┬────────────────┘                                           │
│             │ NO                                                         │
│             ▼                                                            │
│  ┌───────────────────────────┐                                           │
│  │ Is enrolled?              │  NO → Show enrollment gate component      │
│  │ Check vac_enrollments     │       (EnrollmentGate)                    │
│  └──────────┬────────────────┘                                           │
│             │ YES                                                        │
│             ▼                                                            │
│  ┌───────────────────────────┐                                           │
│  │ Is payment complete?      │  NO → Show "Complete payment to access"   │
│  │ payment_status =          │       Link to /billing/schedule           │
│  │   'paid' OR 'waived'     │                                           │
│  └──────────┬────────────────┘                                           │
│             │ YES                                                        │
│             ▼                                                            │
│  ┌───────────────────────────┐                                           │
│  │ Is previous lesson done?  │  NO → Show "Complete Hour N-1 first"     │
│  │                           │       with progress indicator             │
│  │ Check vac_learner_progress│                                           │
│  │   WHERE lesson_id =       │                                           │
│  │     previous_lesson.id   │                                           │
│  │   AND status = 'completed'│                                           │
│  └──────────┬────────────────┘                                           │
│             │ YES                                                        │
│             ▼                                                            │
│  ┌─────────────────────────────────────────────┐                         │
│  │           LESSON CONTENT PAGE               │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │ LESSON HEADER                         │  │                         │
│  │  │ Title | Week N | Hour N | LTL Phase   │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │ LEARNING OUTCOMES (JSONB array)       │  │                         │
│  │  │ - Outcome 1                           │  │                         │
│  │  │ - Outcome 2                           │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │ STUDENT CONTENT (JSONB array)         │  │                         │
│  │  │ Rich text / markdown / media blocks   │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │ TIERED EXERCISES                      │  │                         │
│  │  │                                       │  │                         │
│  │  │ Tier 1: Apply (basic)    [■■■□□]      │  │                         │
│  │  │ Tier 2: Analyze (medium) [■■□□□]      │  │                         │
│  │  │ Tier 3: Create (advanced)[■□□□□]      │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │ GEMINI PROMPTS (AI Practice)          │  │                         │
│  │  │ Pre-built prompts for AI practice     │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │ SELF-CHECK QUIZ                       │  │                         │
│  │  │ Auto-graded knowledge check           │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  │  ┌───────────────────────────────────────┐  │                         │
│  │  │        [ MARK AS COMPLETE ]           │  │                         │
│  │  │                                       │  │                         │
│  │  │  UPSERT vac_learner_progress          │  │                         │
│  │  │  { user_id, course_id, lesson_id,     │  │                         │
│  │  │    status: 'completed',               │  │                         │
│  │  │    completed_at: now(),               │  │                         │
│  │  │    score: quiz_score }                │  │                         │
│  │  │                                       │  │                         │
│  │  │  → Next lesson (N+1) unlocks          │  │                         │
│  │  └───────────────────────────────────────┘  │                         │
│  │                                             │                         │
│  └─────────────────────────────────────────────┘                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.4 CASE Graduation Tracker Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CASE GRADUATION TRACKER FLOW                              │
│                    Route: /vac/case                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CASE = 6 Tracks × 30 Hours Each = 180 Hours Total                          │
│                                                                              │
│  TRACK STRUCTURE:                                                            │
│                                                                              │
│  AI MASTERY (4 tracks)              HUMAN EXCELLENCE (2 tracks)              │
│  ┌──────────────────────┐           ┌──────────────────────┐                 │
│  │ AI-1: Foundations    │           │ H-1: Communication   │                 │
│  │ (seq_order: 1)       │           │ (seq_order: 1)       │                 │
│  └──────────┬───────────┘           └──────────┬───────────┘                 │
│             │ prerequisite                      │ prerequisite               │
│             ▼                                   ▼                            │
│  ┌──────────────────────┐           ┌──────────────────────┐                 │
│  │ AI-2: Application    │           │ H-2: Leadership      │                 │
│  │ (seq_order: 2)       │           │ (seq_order: 2)       │                 │
│  └──────────┬───────────┘           └──────────────────────┘                 │
│             │ prerequisite                                                   │
│             ▼                                                                │
│  ┌──────────────────────┐                                                    │
│  │ AI-3: Mastery        │           PARALLEL SEMESTER MAP:                   │
│  │ (seq_order: 3)       │           ┌────────────────────────────┐           │
│  └──────────┬───────────┘           │ Sem 1: AI-1 + H-1          │           │
│             │ prerequisite          │ Sem 2: AI-2 + H-2          │           │
│             ▼                       │ Sem 3: AI-3                │           │
│  ┌──────────────────────┐           │ Sem 4: AI-4                │           │
│  │ AI-4: Innovation     │           │ Sem 5+: Catch-up/Retries  │           │
│  │ (seq_order: 4)       │           └────────────────────────────┘           │
│  └──────────────────────┘                                                    │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════          │
│                                                                              │
│  LEARNER DASHBOARD (/vac/case):                                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │                                                             │             │
│  │  ┌──────────────┐   Overall Progress                       │             │
│  │  │   PROGRESS   │   ┌─────────────────────────────────┐    │             │
│  │  │     RING     │   │ 3/6 Tracks Complete             │    │             │
│  │  │    ╭───╮     │   │ 90/180 Hours Done               │    │             │
│  │  │   ╭│50%│╮    │   │ Risk: ON TRACK 🟢               │    │             │
│  │  │    ╰───╯     │   │ Est. Graduation: May 2027       │    │             │
│  │  │              │   └─────────────────────────────────┘    │             │
│  │  └──────────────┘                                          │             │
│  │                                                             │             │
│  │  TRACK CARDS:                                               │             │
│  │  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐         │             │
│  │  │ AI-1 ✅  ││ AI-2 ✅  ││ AI-3 🔄  ││ AI-4 🔒  │         │             │
│  │  │Complete  ││Complete  ││In Prog.  ││Locked    │         │             │
│  │  │30/30 hrs ││30/30 hrs ││18/30 hrs ││0/30 hrs  │         │             │
│  │  │Score: 87%││Score: 92%││Score: -- ││          │         │             │
│  │  └──────────┘└──────────┘└──────────┘└──────────┘         │             │
│  │  ┌──────────┐┌──────────┐                                  │             │
│  │  │ H-1 ✅   ││ H-2 🔄   │                                  │             │
│  │  │Complete  ││In Prog.  │                                  │             │
│  │  │30/30 hrs ││12/30 hrs │                                  │             │
│  │  └──────────┘└──────────┘                                  │             │
│  │                                                             │             │
│  └─────────────────────────────────────────────────────────────┘             │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════          │
│                                                                              │
│  TRIPLE GATE COMPLETION (per track):                                         │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                  │
│  │ GATE 1:        │  │ GATE 2:        │  │ GATE 3:        │                  │
│  │ ATTENDANCE     │  │ GRADER SCORE   │  │ PROJECT        │                  │
│  │                │  │                │  │                │                  │
│  │ ≥ 75%         │  │ ≥ 80%         │  │ Submitted +    │                  │
│  │ of 30 hours   │  │ average across │  │ Scored         │                  │
│  │               │  │ all lessons    │  │                │                  │
│  │ Source:       │  │                │  │ Source:        │                  │
│  │ student_      │  │ Source:        │  │ case_track_    │                  │
│  │ attendance    │  │ vac_learner_   │  │ enrollments    │                  │
│  │ (filtered by  │  │ progress.score │  │ .project_      │                  │
│  │ VAC course)   │  │ AVG()         │  │ submitted      │                  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘                  │
│          │                   │                    │                           │
│          ▼                   ▼                    ▼                           │
│  ┌──────────────────────────────────────────────────────┐                    │
│  │ ALL THREE GATES PASSED?                              │                    │
│  │                                                      │                    │
│  │  YES → UPDATE case_track_enrollments                 │                    │
│  │         SET status = 'completed',                    │                    │
│  │             completed_at = now()                     │                    │
│  │                                                      │                    │
│  │       → UPDATE case_learner_progress                 │                    │
│  │         SET tracks_completed += 1,                   │                    │
│  │             total_hours_completed += 30              │                    │
│  │                                                      │                    │
│  │       → IF tracks_completed = 6:                     │                    │
│  │           SET graduation_ready = true                │                    │
│  │                                                      │                    │
│  │  NO  → Show which gates are incomplete               │                    │
│  │        Offer retry if attendance/score insufficient   │                    │
│  └──────────────────────────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Placement Test Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              PLACEMENT TEST FLOW                                 │
│              Route: /vac/case/placement/[trackId]                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐                                            │
│  │ Learner clicks   │                                            │
│  │ "Start Track" on │                                            │
│  │ CASE dashboard   │                                            │
│  └────────┬─────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌────────────────────────────┐                                  │
│  │ Check prerequisite track   │                                  │
│  │                            │                                  │
│  │ case_tracks.prerequisite_  │                                  │
│  │   track_id IS NULL?        │                                  │
│  │                            │   NO → Check if prerequisite     │
│  │ (AI-1, H-1 have no        │        track completed            │
│  │  prerequisite)             │        If not → "Complete X      │
│  └────────┬───────────────────┘         first" message           │
│           │ OK (allowed)                                         │
│           ▼                                                      │
│  ┌────────────────────────────┐                                  │
│  │ Load placement questions   │                                  │
│  │                            │                                  │
│  │ Source: case-placement-    │                                  │
│  │   questions.ts             │                                  │
│  │ 10 questions per track     │                                  │
│  │ (50 total across 5 areas)  │                                  │
│  └────────┬───────────────────┘                                  │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────┐                     │
│  │          PLACEMENT TEST UI              │                     │
│  │                                         │                     │
│  │  Question 1 of 10                       │                     │
│  │  ┌───────────────────────────────────┐  │                     │
│  │  │ What is the Principal-Agent       │  │                     │
│  │  │ framework in AI governance?       │  │                     │
│  │  │                                   │  │                     │
│  │  │ ○ A) Definition 1                 │  │                     │
│  │  │ ○ B) Definition 2                 │  │                     │
│  │  │ ○ C) Definition 3                 │  │                     │
│  │  │ ○ D) Definition 4                 │  │                     │
│  │  └───────────────────────────────────┘  │                     │
│  │                                         │                     │
│  │  [  Previous  ]    [  Next  ]           │                     │
│  │                                         │                     │
│  │  Progress: ████░░░░░░ 4/10              │                     │
│  └────────────┬────────────────────────────┘                     │
│               │ Submit                                           │
│               ▼                                                  │
│  ┌────────────────────────────┐                                  │
│  │ Calculate placement score  │                                  │
│  │                            │                                  │
│  │ Score: 0-100%              │                                  │
│  │                            │                                  │
│  │ Scoring logic:             │                                  │
│  │ ┌─────────────────────┐    │                                  │
│  │ │ 0-30%  → Week 1     │    │  ◄── Start from beginning       │
│  │ │ 31-60% → Week 2     │    │  ◄── Skip basics                │
│  │ │ 61-100%→ Week 3     │    │  ◄── Advanced start             │
│  │ └─────────────────────┘    │                                  │
│  └────────────┬───────────────┘                                  │
│               │                                                  │
│               ▼                                                  │
│  ┌────────────────────────────┐                                  │
│  │ Save placement result      │                                  │
│  │                            │                                  │
│  │ INSERT case_track_enrollments                                 │
│  │ {                          │                                  │
│  │   user_id,                 │                                  │
│  │   track_id,                │                                  │
│  │   course_id,               │                                  │
│  │   placement_score: 65,     │                                  │
│  │   placement_start_week: 3, │                                  │
│  │   placement_taken_at: now()│                                  │
│  │   status: 'enrolled'       │                                  │
│  │ }                          │                                  │
│  │                            │                                  │
│  │ ALSO INSERT vac_enrollments│                                  │
│  │ for the mapped course      │                                  │
│  └────────────┬───────────────┘                                  │
│               │                                                  │
│               ▼                                                  │
│  ┌────────────────────────────┐                                  │
│  │ Redirect to course         │                                  │
│  │ /vac/[courseId]            │                                  │
│  │                            │                                  │
│  │ Lessons before start_week  │                                  │
│  │ are auto-marked as         │                                  │
│  │ 'tested_out' in progress   │                                  │
│  └────────────────────────────┘                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.6 Certificate & Completion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              CERTIFICATE & COMPLETION FLOW                        │
│              Route: /vac/certificate/[enrollmentId]              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐                                            │
│  │ All lessons in   │                                            │
│  │ course completed │                                            │
│  │ (30/30 hours)    │                                            │
│  └────────┬─────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────┐                                    │
│  │ Auto-update enrollment   │                                    │
│  │                          │                                    │
│  │ UPDATE vac_enrollments   │                                    │
│  │ SET status = 'completed',│                                    │
│  │     completed_at = now() │                                    │
│  │                          │                                    │
│  │ (Trigger or service call)│                                    │
│  └────────┬─────────────────┘                                    │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────┐                                    │
│  │ Is CASE track course?    │                                    │
│  │                          │  YES                               │
│  │                          ├────► Update case_track_enrollments  │
│  │                          │      Check triple gate             │
│  │                          │      (See 1.4 Triple Gate)         │
│  └────────┬─────────────────┘                                    │
│           │ (both paths)                                         │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────┐                │
│  │         CERTIFICATE PAGE                     │                │
│  │                                              │                │
│  │  ┌────────────────────────────────────────┐  │                │
│  │  │     JKKN INSTITUTION                   │  │                │
│  │  │     Certificate of Completion          │  │                │
│  │  │                                        │  │                │
│  │  │  This certifies that                   │  │                │
│  │  │  [LEARNER NAME]                        │  │                │
│  │  │                                        │  │                │
│  │  │  has successfully completed            │  │                │
│  │  │  [COURSE NAME] ([COURSE CODE])         │  │                │
│  │  │                                        │  │                │
│  │  │  Duration: 30 hours                    │  │                │
│  │  │  NSQF Level: [N]                       │  │                │
│  │  │  NCrF Credits: [N]                     │  │                │
│  │  │                                        │  │                │
│  │  │  Score: [Average %]                    │  │                │
│  │  │  Date: [completion_date]               │  │                │
│  │  │                                        │  │                │
│  │  │  ┌──────────────────────────────────┐  │  │                │
│  │  │  │ SENIOR LEARNER ENDORSEMENT      │  │  │                │
│  │  │  │ (if all 6 CASE tracks done)     │  │  │                │
│  │  │  │                                  │  │  │                │
│  │  │  │ "CASE Graduate — Agency Index:  │  │  │                │
│  │  │  │  [score]/10"                     │  │  │                │
│  │  │  └──────────────────────────────────┘  │  │                │
│  │  │                                        │  │                │
│  │  │  [QR Code]  [Download PDF]             │  │                │
│  │  └────────────────────────────────────────┘  │                │
│  │                                              │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.7 Admin Course Management Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ADMIN COURSE MANAGEMENT FLOW                          │
│                    Routes: /vac/admin/courses/*                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  /vac/admin                                                              │
│  ┌─────────────────────────────────────────────────────────┐             │
│  │ ADMIN DASHBOARD                                         │             │
│  │                                                         │             │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │             │
│  │ │ Total   │ │ Active  │ │ Total   │ │ Revenue │       │             │
│  │ │ Courses │ │ Enroll. │ │ Learners│ │ ₹XXX    │       │             │
│  │ │ 93      │ │ 156     │ │ 89      │ │         │       │             │
│  │ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │             │
│  │                                                         │             │
│  │ Quick Links: [Courses] [Enrollments] [Analytics] [CASE] │             │
│  └─────────────────────────────────────────────────────────┘             │
│       │                                                                  │
│       ▼                                                                  │
│  /vac/admin/courses                                                      │
│  ┌─────────────────────────────────────────────────────────┐             │
│  │ COURSE LIST (DataTable)                                 │             │
│  │                                                         │             │
│  │ [+ Add Course]  [Filters ▼]  [Search...]               │             │
│  │                                                         │             │
│  │ ┌──────┬──────────┬──────┬────────┬────────┬─────────┐ │             │
│  │ │ Code │ Name     │Track │Fee     │Status  │Actions  │ │             │
│  │ ├──────┼──────────┼──────┼────────┼────────┼─────────┤ │             │
│  │ │AI101 │AI Found..│AI-1  │₹500   │Active  │[⋮]      │ │             │
│  │ │AI201 │AI Appli..│AI-2  │₹500   │Active  │[⋮]      │ │             │
│  │ │HE101 │Communic..│H-1   │₹500   │Active  │[⋮]      │ │             │
│  │ └──────┴──────────┴──────┴────────┴────────┴─────────┘ │             │
│  │                                                         │             │
│  │ Pagination: [< 1 2 3 4 5 >]                            │             │
│  └─────────────┬───────────────────────────────────────────┘             │
│                │                                                         │
│    ┌───────────┼───────────────────┐                                     │
│    │           │                   │                                     │
│    ▼           ▼                   ▼                                     │
│  [+ Add]    [Edit ✏️]          [Manage Lessons]                          │
│    │           │                   │                                     │
│    ▼           ▼                   ▼                                     │
│  /vac/admin/courses/new          /vac/admin/courses/[id]/lessons         │
│  ┌─────────────────────┐       ┌───────────────────────────┐             │
│  │ COURSE FORM          │      │ LESSON MANAGEMENT         │             │
│  │                      │      │                           │             │
│  │ Basic Info:          │      │ 30 lessons (Week × Hour)  │             │
│  │ - Code, Name, Desc  │      │                           │             │
│  │ - Institution        │      │ [+ Add Lesson]            │             │
│  │ - Track (dropdown)   │      │                           │             │
│  │ - Category           │      │ Week 1:                   │             │
│  │   (add_on/value_add) │      │  H1: Title... [Edit]     │             │
│  │                      │      │  H2: Title... [Edit]     │             │
│  │ Academic:            │      │  ...                      │             │
│  │ - Duration (hours)   │      │ Week 2:                   │             │
│  │ - Weeks              │      │  H11: Title... [Edit]    │             │
│  │ - Fee                │      │  ...                      │             │
│  │ - NSQF Level (1-10)  │      │ Week 3:                   │             │
│  │ - NHEQF Level (4-10) │      │  H21: Title... [Edit]    │             │
│  │ - NCrF Credits       │      └───────────────────────────┘             │
│  │ - Faculty Eligible   │                                                │
│  │                      │                                                │
│  │ Fink's Taxonomy:     │                                                │
│  │ ┌──────────────────┐ │                                                │
│  │ │ FINK'S EDITOR    │ │                                                │
│  │ │                  │ │                                                │
│  │ │ Foundational  20%│ │                                                │
│  │ │ Application  25% │ │                                                │
│  │ │ Integration  15% │ │                                                │
│  │ │ Human Dim.  10%  │ │                                                │
│  │ │ Caring      15%  │ │                                                │
│  │ │ Learning    15%  │ │                                                │
│  │ │ ────────── 100%  │ │                                                │
│  │ └──────────────────┘ │                                                │
│  │                      │                                                │
│  │ Programme Mapping:   │                                                │
│  │ ☑ B.Tech CSE        │                                                │
│  │ ☑ B.Tech IT         │                                                │
│  │ ☐ MBA               │                                                │
│  │ ☐ BCA               │                                                │
│  │                      │                                                │
│  │ [Save] [Cancel]      │                                                │
│  └──────────────────────┘                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.8 Admin Analytics Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              ADMIN ANALYTICS FLOW                                │
│              Route: /vac/admin/analytics                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ANALYTICS DASHBOARD (4 Tabs)                            │     │
│  │                                                         │     │
│  │ [Overview] [CASE Tracks] [Programmes] [Trends]          │     │
│  │                                                         │     │
│  │ ═══════════════════════════════════════════════          │     │
│  │                                                         │     │
│  │ TAB 1: OVERVIEW                                         │     │
│  │ ┌──────────────────┐  ┌──────────────────┐              │     │
│  │ │ Enrollment Funnel │  │ Completion Rate  │              │     │
│  │ │                  │  │                  │              │     │
│  │ │ Enrolled:  500   │  │    ╭─────╮       │              │     │
│  │ │ Active:    380   │  │   ╭│ 72% │╮      │              │     │
│  │ │ Completed: 290   │  │    ╰─────╯       │              │     │
│  │ │ Dropped:   30    │  │                  │              │     │
│  │ └──────────────────┘  └──────────────────┘              │     │
│  │                                                         │     │
│  │ ─────────────────────────────────────────────           │     │
│  │                                                         │     │
│  │ TAB 2: CASE TRACKS                                      │     │
│  │ ┌──────────────────────────────────────────┐            │     │
│  │ │ Track Completion Rates (Bar Chart)       │            │     │
│  │ │                                          │            │     │
│  │ │ AI-1  ████████████████████░░  85%        │            │     │
│  │ │ AI-2  ███████████████░░░░░░░  65%        │            │     │
│  │ │ AI-3  █████████░░░░░░░░░░░░░  40%        │            │     │
│  │ │ AI-4  ████░░░░░░░░░░░░░░░░░░  20%        │            │     │
│  │ │ H-1   █████████████████████░  90%        │            │     │
│  │ │ H-2   ██████████████░░░░░░░░  60%        │            │     │
│  │ └──────────────────────────────────────────┘            │     │
│  │                                                         │     │
│  │ ─────────────────────────────────────────────           │     │
│  │                                                         │     │
│  │ TAB 3: PROGRAMMES                                       │     │
│  │ ┌──────────────────────────────────────────┐            │     │
│  │ │ Programme-wise Enrollment (Table)        │            │     │
│  │ │                                          │            │     │
│  │ │ Programme    │ Enrolled │ Done │ At Risk  │            │     │
│  │ │ B.Tech CSE   │ 120     │ 80   │ 12       │            │     │
│  │ │ B.Tech IT    │ 95      │ 65   │ 8        │            │     │
│  │ │ MBA          │ 60      │ 45   │ 5        │            │     │
│  │ └──────────────────────────────────────────┘            │     │
│  │                                                         │     │
│  │ ─────────────────────────────────────────────           │     │
│  │                                                         │     │
│  │ TAB 4: TRENDS                                           │     │
│  │ ┌──────────────────────────────────────────┐            │     │
│  │ │ Monthly Enrollment Trend (Line Chart)    │            │     │
│  │ │         .─*                              │            │     │
│  │ │       /    \    .*─*                     │            │     │
│  │ │     /       \  /                         │            │     │
│  │ │  *─*         *─                          │            │     │
│  │ │  Jan  Feb  Mar  Apr  May                 │            │     │
│  │ └──────────────────────────────────────────┘            │     │
│  │                                                         │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  Data Sources:                                                   │
│  - get_vac_course_enrollment_stats() function                    │
│  - vac_enrollments_with_details view                             │
│  - case_graduation_readiness view                                │
│  - case_risk_calculator view                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.9 CASE Risk Alert System (Cron)

```
┌─────────────────────────────────────────────────────────────────────────┐
│              CASE RISK ALERT SYSTEM                                      │
│              Cron: 7:00 AM IST Daily (30 1 * * *)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────┐                                                       │
│  │ pg_cron fires │                                                       │
│  │ SELECT         │                                                      │
│  │ process_case_  │                                                      │
│  │   alerts()     │                                                      │
│  └───────┬───────┘                                                       │
│          │                                                               │
│          ▼                                                               │
│  ┌──────────────────────────────────────────────────────────┐            │
│  │ STEP 1: Calculate risk for all active learners           │            │
│  │                                                          │            │
│  │ FOR EACH learner in case_learner_progress:               │            │
│  │                                                          │            │
│  │  Query case_risk_calculator view:                        │            │
│  │  ┌────────────────────────────────────────────┐          │            │
│  │  │ semesters_remaining = total - current      │          │            │
│  │  │ tracks_remaining = 6 - tracks_completed    │          │            │
│  │  │ tracks_per_sem_needed =                    │          │            │
│  │  │   CEIL(tracks_remaining / semesters_remain)│          │            │
│  │  │                                            │          │            │
│  │  │ Risk Level:                                │          │            │
│  │  │ ┌────────────────────────────────────────┐ │          │            │
│  │  │ │ tracks_per_sem ≤ 1  → ON_TRACK   🟢   │ │          │            │
│  │  │ │ tracks_per_sem = 2  → AT_RISK    🟡   │ │          │            │
│  │  │ │ tracks_per_sem ≥ 3  → CRITICAL   🔴   │ │          │            │
│  │  │ │ semesters_remaining                    │ │          │            │
│  │  │ │   = 0 AND not done  → OVERDUE    ⚫   │ │          │            │
│  │  │ │ all 6 complete      → COMPLETED  ✅   │ │          │            │
│  │  │ └────────────────────────────────────────┘ │          │            │
│  │  └────────────────────────────────────────────┘          │            │
│  │                                                          │            │
│  │  UPDATE case_learner_progress                            │            │
│  │    SET risk_level = calculated_risk                      │            │
│  └──────────────┬───────────────────────────────────────────┘            │
│                 │                                                        │
│                 ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐            │
│  │ STEP 2: Generate alerts based on exam proximity          │            │
│  │                                                          │            │
│  │ Check case_graduation_requirements:                      │            │
│  │   enforcement_days_before_exam (default: 25)             │            │
│  │                                                          │            │
│  │ Alert triggers:                                          │            │
│  │ ┌──────────────────────────────────────────────────────┐ │            │
│  │ │ Days to exam │ Alert Type      │ Who gets alerted   │ │            │
│  │ │──────────────│─────────────────│────────────────────│ │            │
│  │ │ 90 days      │ 90_day_warning  │ Learner only       │ │            │
│  │ │ 60 days      │ 60_day_warning  │ Learner + Coord.   │ │            │
│  │ │ 30 days      │ 30_day_warning  │ Learner + Coord.   │ │            │
│  │ │ 25 days      │ enforcement     │ All + HOD          │ │            │
│  │ │ AT_RISK any  │ risk_alert      │ Learner + Coord.   │ │            │
│  │ │ CRITICAL any │ critical_alert  │ All stakeholders   │ │            │
│  │ └──────────────────────────────────────────────────────┘ │            │
│  └──────────────┬───────────────────────────────────────────┘            │
│                 │                                                        │
│                 ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐            │
│  │ STEP 3: Insert alerts + send notifications               │            │
│  │                                                          │            │
│  │ INSERT case_alerts                                       │            │
│  │ { user_id, alert_type, message,                          │            │
│  │   sent_via: ['push', 'in_app'],                          │            │
│  │   coordinator_id }                                       │            │
│  │                                                          │            │
│  │          ┌────────────┐                                  │            │
│  │          │            │                                  │            │
│  │          ▼            ▼                                  │            │
│  │  ★ NOTIFICATION  ★ PUSH SERVICE                          │            │
│  │    MODULE           push_subscriptions                   │            │
│  │    notifications    → browser push                       │            │
│  │    table                                                 │            │
│  └──────────────────────────────────────────────────────────┘            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Cross-Module Integration Map

### 2.1 Master Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│                        MyJKKN SYSTEM — VAC INTEGRATION MAP                       │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐      │
│  │                         VAC MODULE (Core)                               │      │
│  │                                                                         │      │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │      │
│  │   │ VAC Courses   │  │ VAC Lessons   │  │ VAC Enroll   │                │      │
│  │   │ (93 courses)  │  │ (2,746 items) │  │ (learner↔    │                │      │
│  │   │              │  │              │  │  course)      │                │      │
│  │   └──────┬───────┘  └──────────────┘  └──────┬───────┘                 │      │
│  │          │                                    │                         │      │
│  │   ┌──────┴───────┐  ┌──────────────┐  ┌──────┴───────┐                 │      │
│  │   │ CASE Tracks   │  │ CASE Batches  │  │ CASE Track   │                │      │
│  │   │ (6 tracks)    │  │ (scheduling)  │  │ Enrollments  │                │      │
│  │   └──────────────┘  └──────────────┘  └──────────────┘                 │      │
│  │                                                                         │      │
│  └──────────────────────────────┬──────────────────────────────────────────┘      │
│                                 │                                                 │
│         ┌───────────┬───────────┼───────────┬───────────┬───────────┐             │
│         │           │           │           │           │           │             │
│         ▼           ▼           ▼           ▼           ▼           ▼             │
│  ┌─────────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐    │
│  │ ORGANIZATION││ LEARNERS ││ BILLING  ││ATTENDANCE││  STAFF   ││NOTIFICA- │    │
│  │   MODULE    ││  MODULE  ││  MODULE  ││  MODULE  ││  MODULE  ││  TIONS   │    │
│  │             ││          ││          ││          ││          ││          │    │
│  │institutions ││learners_ ││billing_  ││student_  ││staff     ││notifica- │    │
│  │programs     ││profiles  ││student_  ││attendance││staff_    ││tions     │    │
│  │semesters    ││profiles  ││bills     ││timetables││plans     ││user_     │    │
│  │sections     ││          ││receipts  ││periods   ││staff_plan││notifica- │    │
│  │departments  ││          ││discounts ││          ││_courses  ││tions     │    │
│  │courses      ││          ││refunds   ││          ││          ││push_subs │    │
│  └──────┬──────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘    │
│         │            │           │           │           │           │           │
│         │            │           │           │           │           │           │
│         ▼            ▼           ▼           ▼           ▼           ▼           │
│  ┌──────────────────────────────────────────────────────────────────────────┐    │
│  │                        SHARED FOUNDATION                                 │    │
│  │                                                                          │    │
│  │  ┌────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐  │    │
│  │  │  profiles   │  │ user_institution_   │  │ Supabase Auth (auth.uid) │  │    │
│  │  │  (all users)│  │ access (multi-tenant│  │ RLS policies             │  │    │
│  │  └────────────┘  └─────────────────────┘  └──────────────────────────┘  │    │
│  │                                                                          │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐    │
│  │                     ALSO CONNECTS TO (Indirect)                          │    │
│  │                                                                          │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐         │    │
│  │  │ ADMISSION  │  │  STARTUP   │  │ WORK PULSE │  │   AUDIT    │         │    │
│  │  │   CRM      │  │  STUDIO    │  │            │  │   TRAIL    │         │    │
│  │  │            │  │            │  │            │  │            │         │    │
│  │  │ Lead →     │  │ CASE =     │  │ VAC project│  │ Activity   │         │    │
│  │  │ Enrolled → │  │ evolved    │  │ submissions│  │ logging of │         │    │
│  │  │ VAC student│  │ case_study │  │ as "work"  │  │ all VAC ops│         │    │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘         │    │
│  │                                                                          │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 VAC ↔ Organization Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ ORGANIZATION MODULE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ORGANIZATION HIERARCHY:                                             │
│                                                                      │
│  institutions ──────────────────── vac_courses.institution_id        │
│       │                            (each course belongs to 1 inst.)  │
│       ▼                                                              │
│  departments ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (indirect via programmes)         │
│       │                                                              │
│       ▼                                                              │
│  programs ──────────────────────── vac_courses.programme_id          │
│       │                            vac_course_programmes (junction)  │
│       │                            case_track_courses.programme_id   │
│       │                            case_learner_progress.programme_id│
│       │                            case_graduation_requirements      │
│       │                              .programme_id                   │
│       ▼                                                              │
│  semesters ─────────────────────── CASE semester mapping             │
│       │                            (Sem 1: AI-1+H-1,                │
│       │                             Sem 2: AI-2+H-2, etc.)          │
│       ▼                                                              │
│  sections ──────────────────────── case_batches                      │
│                                    (batch = section × track × term)  │
│                                                                      │
│  DATA FLOW:                                                          │
│  ┌────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│  │ Admin sets  │     │ VAC courses are  │     │ Learner sees     │   │
│  │ up programs │────►│ mapped to        │────►│ courses for      │   │
│  │ & semesters │     │ programmes via   │     │ their programme  │   │
│  │ in Org.     │     │ vac_course_      │     │ in Recommended   │   │
│  │ module      │     │ programmes       │     │ section          │   │
│  └────────────┘     └──────────────────┘     └──────────────────┘   │
│                                                                      │
│  TABLES CONNECTED:                                                   │
│  ┌─────────────────────────────────────────────────────┐             │
│  │ institutions.id  ←──── vac_courses.institution_id   │             │
│  │ programs.id      ←──── vac_courses.programme_id     │             │
│  │ programs.id      ←──── vac_course_programmes        │             │
│  │                          .programme_id              │             │
│  │ programs.id      ←──── case_track_courses           │             │
│  │                          .programme_id              │             │
│  │ programs.id      ←──── case_learner_progress        │             │
│  │                          .programme_id              │             │
│  │ programs.id      ←──── case_graduation_requirements │             │
│  │                          .programme_id              │             │
│  │ institutions.id  ←──── case_batches.institution_id  │             │
│  │ institutions.id  ←──── case_track_courses           │             │
│  │                          .institution_id            │             │
│  └─────────────────────────────────────────────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 VAC ↔ Learners Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ LEARNERS MODULE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────┐         ┌──────────────────────────┐          │
│  │  learners_profiles │         │  profiles                │          │
│  │                    │         │                          │          │
│  │  id ───────────────┼────────►│  id (same UUID)          │          │
│  │  program_id        │         │  programme_id (NEW col)  │          │
│  │  semester_id       │         │  role                    │          │
│  │  institution_id    │         │  institution_id          │          │
│  │  lifecycle_status  │         │                          │          │
│  │  roll_number       │         │  Used by:                │          │
│  │                    │         │  - vac_enrollments       │          │
│  │  Provides:         │         │    .user_id              │          │
│  │  - Student identity│         │  - vac_learner_progress  │          │
│  │  - Current semester│         │    .user_id              │          │
│  │  - Programme info  │         │  - case_track_enrollments│          │
│  │                    │         │    .user_id              │          │
│  └────────┬──────────┘         │  - case_learner_progress │          │
│           │                    │    .user_id              │          │
│           │                    └──────────────────────────┘          │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │                    LEARNER LIFECYCLE                      │        │
│  │                                                          │        │
│  │  Admission Lead                                          │        │
│  │       │                                                  │        │
│  │       ▼                                                  │        │
│  │  Application Submitted                                   │        │
│  │       │                                                  │        │
│  │       ▼                                                  │        │
│  │  Enrolled Student ─────────────────► VAC ENROLLMENT      │        │
│  │       │                              ELIGIBLE             │        │
│  │       │                                                  │        │
│  │       │  lifecycle_status                                │        │
│  │       │  = 'enrolled' OR                                 │        │
│  │       │    'active_student'                              │        │
│  │       │                                                  │        │
│  │       ▼                                                  │        │
│  │  Active Student ──────► Can enroll in VAC courses        │        │
│  │       │                 Can access CASE tracker           │        │
│  │       │                 Can take placement tests          │        │
│  │       │                                                  │        │
│  │       ▼                                                  │        │
│  │  Graduating ──────────► Must complete 6 CASE tracks      │        │
│  │       │                 case_graduation_requirements      │        │
│  │       │                 enforced 25 days before exam     │        │
│  │       │                                                  │        │
│  │       ▼                                                  │        │
│  │  Alumni ──────────────► VAC certificates remain          │        │
│  │                         accessible as portfolio          │        │
│  │                                                          │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  KEY QUERIES:                                                        │
│  ┌──────────────────────────────────────────────────────┐            │
│  │ -- Get learner's programme for course recommendations│            │
│  │ SELECT p.programme_id, lp.semester_id                │            │
│  │ FROM profiles p                                      │            │
│  │ JOIN learners_profiles lp ON lp.id = p.learner_id    │            │
│  │ WHERE p.id = auth.uid()                              │            │
│  │                                                      │            │
│  │ -- Get recommended courses for learner               │            │
│  │ SELECT vc.* FROM vac_courses vc                      │            │
│  │ JOIN vac_course_programmes vcp                       │            │
│  │   ON vcp.course_id = vc.id                           │            │
│  │ WHERE vcp.programme_id = learner's_programme_id      │            │
│  └──────────────────────────────────────────────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.4 VAC ↔ Billing Module

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      VAC ↔ BILLING MODULE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ENROLLMENT-TO-PAYMENT FLOW:                                             │
│                                                                          │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐     │
│  │ Student      │     │ VAC Module        │     │ Billing Module   │     │
│  │ clicks       │────►│ Creates           │────►│ Generates        │     │
│  │ "Enroll Now" │     │ vac_enrollments   │     │ billing_student_ │     │
│  │              │     │ payment_status:   │     │ bills            │     │
│  │              │     │ 'pending'         │     │                  │     │
│  └──────────────┘     └──────────────────┘     └────────┬─────────┘     │
│                                                          │               │
│                                                          ▼               │
│                        ┌──────────────────────────────────────────┐      │
│                        │          BILLING FLOW                    │      │
│                        │                                          │      │
│                        │  1. billing_parent_categories             │      │
│                        │     └─ "Value Added Courses"             │      │
│                        │                                          │      │
│                        │  2. billing_sub_categories                │      │
│                        │     └─ "AI Mastery Track" / "General"    │      │
│                        │                                          │      │
│                        │  3. billing_item_categories               │      │
│                        │     └─ amount: course.fee (₹500)         │      │
│                        │     └─ frequency: 'one_time'             │      │
│                        │                                          │      │
│                        │  4. billing_student_bills                 │      │
│                        │     ┌────────────────────────────────┐   │      │
│                        │     │ student_id: learner UUID       │   │      │
│                        │     │ item_category_id: VAC fee item │   │      │
│                        │     │ bill_description:              │   │      │
│                        │     │   "VAC: AI Foundations (AI101)" │   │      │
│                        │     │ unit_amount: 500               │   │      │
│                        │     │ final_amount: 500              │   │      │
│                        │     │ status: 'unpaid'               │   │      │
│                        │     │ due_date: enrollment + 7 days  │   │      │
│                        │     └────────────────────────────────┘   │      │
│                        │                                          │      │
│                        │  5. Student pays at /billing/schedule    │      │
│                        │     → HDFC SmartGateway                  │      │
│                        │     → billing_receipts created           │      │
│                        │                                          │      │
│                        └─────────────────────┬────────────────────┘      │
│                                              │                           │
│                                              ▼                           │
│                        ┌──────────────────────────────────────────┐      │
│                        │ CALLBACK: Payment confirmed              │      │
│                        │                                          │      │
│                        │ UPDATE vac_enrollments                   │      │
│                        │ SET payment_status = 'paid',             │      │
│                        │     payment_date = now(),                │      │
│                        │     payment_reference = receipt_number   │      │
│                        │                                          │      │
│                        │ → Full course access granted             │      │
│                        └──────────────────────────────────────────┘      │
│                                                                          │
│  EDGE CASES:                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ Fee = 0        → Auto-set payment_status = 'waived'             │    │
│  │ Scholarship    → billing_discounts applied, reduced bill amount │    │
│  │ Course drop    → billing_refunds if within refund window        │    │
│  │ Expiry         → If enrolled but not paid within 30 days,       │    │
│  │                  enrollment.status → 'expired'                  │    │
│  │ Faculty course → faculty_eligible = true, auto-waived fee       │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.5 VAC ↔ Academic (Attendance) Module

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ ATTENDANCE MODULE                                  │
│                  (CASE Triple Gate: Attendance ≥ 75%)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HOW ATTENDANCE IS MARKED FOR VAC:                                       │
│                                                                          │
│  ┌────────────────────┐     ┌────────────────────┐                       │
│  │ Academic Admin      │     │ Faculty marks      │                       │
│  │ creates VAC         │────►│ attendance at      │                       │
│  │ timetable slot      │     │ /academic/attendance│                      │
│  │                     │     │                    │                       │
│  │ timetables          │     │ student_attendance │                       │
│  │   timetable_data    │     │ {                  │                       │
│  │   [DAY][periodId]   │     │   attendance_date, │                       │
│  │   = {               │     │   timetable_id,    │                       │
│  │     course_id:      │     │   section_id,      │                       │
│  │       <vac_course>, │     │   attendance_data: │                       │
│  │     staff_ids:      │     │   { student_id:    │                       │
│  │       [facilitator] │     │     'present' }    │                       │
│  │   }                 │     │ }                  │                       │
│  └────────────────────┘     └─────────┬──────────┘                       │
│                                       │                                  │
│                                       ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐            │
│  │ VAC ATTENDANCE CALCULATION                               │            │
│  │ (for CASE triple gate)                                   │            │
│  │                                                          │            │
│  │  Query:                                                  │            │
│  │  ┌────────────────────────────────────────────────────┐  │            │
│  │  │ SELECT                                             │  │            │
│  │  │   COUNT(*) FILTER (WHERE student present)          │  │            │
│  │  │     as attended,                                   │  │            │
│  │  │   COUNT(*) as total_classes                        │  │            │
│  │  │ FROM student_attendance sa                         │  │            │
│  │  │ JOIN timetable_slot_continuity tsc                 │  │            │
│  │  │   ON tsc.timetable_id = sa.timetable_id            │  │            │
│  │  │ JOIN case_track_courses ctc                        │  │            │
│  │  │   ON ctc.course_id = tsc.course_id                 │  │            │
│  │  │ WHERE ctc.track_id = [track_id]                    │  │            │
│  │  │   AND sa.user_id = [learner_id]                    │  │            │
│  │  └────────────────────────────────────────────────────┘  │            │
│  │                                                          │            │
│  │  attendance_pct = attended / total_classes * 100          │            │
│  │                                                          │            │
│  │  UPDATE case_track_enrollments                           │            │
│  │    SET attendance_percentage = attendance_pct,            │            │
│  │        completion_gate_attendance =                       │            │
│  │          (attendance_pct >= 75.0)                         │            │
│  │                                                          │            │
│  └──────────────────────────────────────────────────────────┘            │
│                                                                          │
│  VISUAL (in CASE Tracker):                                               │
│                                                                          │
│  ┌────────────────────────────────────────────┐                          │
│  │ Track: AI-1 Foundations                    │                          │
│  │                                            │                          │
│  │ Gate 1: Attendance                         │                          │
│  │ ████████████████████████░░░░░░  82% ✅     │                          │
│  │ (Threshold: 75%)                           │                          │
│  │                                            │                          │
│  │ 25 of 30 classes attended                  │                          │
│  └────────────────────────────────────────────┘                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.6 VAC ↔ Academic (Timetable) Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ TIMETABLE MODULE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ TIMETABLE STRUCTURE (JSONB)                                  │     │
│  │                                                              │     │
│  │ timetable_data = {                                           │     │
│  │   "monday": {                                                │     │
│  │     "period_1_id": {                                         │     │
│  │       course_id: "regular-math-101",                         │     │
│  │       staff_ids: ["prof-a"]                                  │     │
│  │     },                                                       │     │
│  │     "period_5_id": {           ◄── VAC SLOT                  │     │
│  │       course_id: "vac-ai-101",  ◄── VAC Course ID           │     │
│  │       staff_ids: ["vac-facilitator"],                        │     │
│  │       slot_type: "vac"          ◄── Tagged as VAC            │     │
│  │     }                                                        │     │
│  │   },                                                         │     │
│  │   "wednesday": {                                              │     │
│  │     "period_5_id": {           ◄── VAC SLOT (same period)   │     │
│  │       course_id: "vac-ai-101",                               │     │
│  │       staff_ids: ["vac-facilitator"],                        │     │
│  │       slot_type: "vac"                                       │     │
│  │     }                                                        │     │
│  │   }                                                          │     │
│  │ }                                                            │     │
│  │                                                              │     │
│  │ → 2 slots/week × 15 weeks = 30 hours per VAC course ✓       │     │
│  │                                                              │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  INTEGRATION FLOW:                                                   │
│                                                                      │
│  ┌────────────┐     ┌────────────────┐     ┌──────────────────┐     │
│  │ Academic   │     │ Timetable      │     │ VAC Courses      │     │
│  │ Admin      │────►│ Editor         │────►│ Appear in        │     │
│  │ schedules  │     │ /academic/     │     │ student's        │     │
│  │ VAC periods│     │ timetables     │     │ /learners/       │     │
│  │            │     │                │     │ my-timetable     │     │
│  └────────────┘     └────────────────┘     └──────────────────┘     │
│                                                                      │
│  CASE BATCH SCHEDULING (case_batches):                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │ case_batches.schedule_json = {                           │        │
│  │   "delivery_format": "moderate",  // 2 sessions/week    │        │
│  │   "sessions": [                                         │        │
│  │     { "day": "monday",    "period": "period_5" },       │        │
│  │     { "day": "wednesday", "period": "period_5" }        │        │
│  │   ],                                                    │        │
│  │   "start_date": "2026-07-15",                           │        │
│  │   "end_date": "2026-11-15"                              │        │
│  │ }                                                        │        │
│  │                                                          │        │
│  │ Delivery formats:                                        │        │
│  │   spread    = 1 session/week  × 30 weeks                │        │
│  │   moderate  = 2 sessions/week × 15 weeks (DEFAULT)      │        │
│  │   intensive = 5 sessions/week × 6 weeks                 │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.7 VAC ↔ Staff Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ STAFF MODULE                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │                                                          │        │
│  │  staff ──────────────────► case_batches.facilitator_id   │        │
│  │  (VAC Facilitators)        (who teaches the batch)       │        │
│  │                                                          │        │
│  │  staff_plans ────────────► Track VAC teaching hours       │        │
│  │  (workload planning)       in staff's weekly allocation  │        │
│  │                                                          │        │
│  │  staff_plan_courses ─────► Map VAC course to facilitator │        │
│  │  { staff_plan_id,          with hours_per_week           │        │
│  │    course_id: vac_course,                                │        │
│  │    section_id,                                           │        │
│  │    hours_per_week: 2 }                                   │        │
│  │                                                          │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  FLOW:                                                               │
│                                                                      │
│  ┌────────────┐    ┌─────────────────┐    ┌──────────────────┐      │
│  │ Admin      │    │ Assign VAC      │    │ Facilitator      │      │
│  │ creates    │───►│ facilitators    │───►│ marks attendance │      │
│  │ VAC course │    │ in staff        │    │ for their VAC    │      │
│  │ + batch    │    │ planning module │    │ classes          │      │
│  └────────────┘    └─────────────────┘    └──────────────────┘      │
│                                                                      │
│  FACULTY AS LEARNERS:                                                │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │ vac_courses.faculty_eligible = true                      │        │
│  │                                                          │        │
│  │ Faculty can ALSO enroll in VAC courses for               │        │
│  │ professional development. They see these in              │        │
│  │ /vac/my-courses → "Professional Development" tab         │        │
│  │                                                          │        │
│  │ profiles.role = 'faculty' AND enrolled in VAC            │        │
│  │ → Appears in both:                                       │        │
│  │   - As facilitator (teaching)                            │        │
│  │   - As learner (own professional development)            │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.8 VAC ↔ Notification Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ NOTIFICATION MODULE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  NOTIFICATION TRIGGERS:                                              │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ Source Event           │ Notification              │ Channel  │   │
│  │────────────────────────│────────────────────────────│──────────│   │
│  │ Enrollment created     │ "Welcome to [Course]"     │ In-app   │   │
│  │ Payment received       │ "Access granted to [X]"   │ In-app   │   │
│  │ Lesson completed       │ "Lesson N done! Next: N+1"│ In-app   │   │
│  │ Course completed       │ "Certificate ready!"      │ Push     │   │
│  │ CASE 90-day warning    │ "90 days to exam..."      │ Push     │   │
│  │ CASE 60-day warning    │ "60 days remaining..."    │ Push     │   │
│  │ CASE 30-day warning    │ "URGENT: 30 days left"    │ Push     │   │
│  │ CASE 25-day enforce    │ "CRITICAL: Enforcement"   │ Push+SMS │   │
│  │ At-risk detected       │ "Your progress needs..."  │ Push     │   │
│  │ Attendance < 75%       │ "Attendance warning..."   │ Push     │   │
│  │ Track completed        │ "Track X complete!"       │ Push     │   │
│  │ All 6 tracks done      │ "Graduation ready!"       │ Push     │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  INTEGRATION:                                                        │
│                                                                      │
│  ┌──────────────┐     ┌────────────────────┐     ┌─────────────┐    │
│  │ VAC Service   │     │ Notification       │     │ User sees   │    │
│  │ (or cron job) │────►│ Service            │────►│ bell icon   │    │
│  │ fires event   │     │                    │     │ notification│    │
│  │               │     │ INSERT into        │     │ in navbar   │    │
│  │               │     │ notifications +    │     │             │    │
│  │               │     │ user_notifications │     │ + push to   │    │
│  │               │     │                    │     │ mobile via  │    │
│  │               │     │ Send push via      │     │ push_subs   │    │
│  │               │     │ push_subscriptions │     │             │    │
│  └──────────────┘     └────────────────────┘     └─────────────┘    │
│                                                                      │
│  case_alerts TABLE (VAC-specific alerts):                            │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │ This is SEPARATE from general notifications.             │        │
│  │ case_alerts stores CASE-specific alert history with:     │        │
│  │ - alert_type (risk, attendance, graduation)              │        │
│  │ - coordinator_id (who should follow up)                  │        │
│  │ - read_at (tracking acknowledgment)                      │        │
│  │                                                          │        │
│  │ case_alerts → ALSO creates notifications table entry     │        │
│  │ for unified notification experience                      │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.9 VAC ↔ Admission CRM Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                  VAC ↔ ADMISSION CRM (Indirect)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  The Admission CRM feeds the Learners module, which feeds VAC.       │
│  This is an INDIRECT connection through the learner lifecycle.       │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │                                                          │        │
│  │  ADMISSION CRM                LEARNERS           VAC     │        │
│  │                                                          │        │
│  │  ┌──────────┐              ┌──────────┐     ┌──────────┐│        │
│  │  │ Lead     │              │ learners_│     │ vac_     ││        │
│  │  │ captured │──► Apply ──►│ profiles │──►  │ enroll-  ││        │
│  │  │          │   Admit     │          │Enroll│ ments    ││        │
│  │  └──────────┘              │ lifecycle│ in  │          ││        │
│  │                            │ _status: │ VAC │          ││        │
│  │  Marketing:               │'enrolled'│     └──────────┘│        │
│  │  "Learn AI at JKKN"       └──────────┘                 │        │
│  │  VAC as selling point                                   │        │
│  │  in admission campaigns                                 │        │
│  │                                                          │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  DATA FLOW:                                                          │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │ admission_leads.programme_id = programs.id               │        │
│  │      → Same programme determines VAC course mapping      │        │
│  │                                                          │        │
│  │ admission_applications.status = 'enrolled'               │        │
│  │      → Triggers learners_profiles creation               │        │
│  │      → Student can now access /vac                       │        │
│  │                                                          │        │
│  │ MARKETING USE CASE:                                      │        │
│  │ - VAC completion stats shown in admission dashboards     │        │
│  │ - "93% of our students complete AI certification"        │        │
│  │ - Expo marketing materials reference CASE tracks         │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE DATA FLOW ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────── WRITE PATH ──────────────────────────────┐       │
│  │                                                                    │       │
│  │  ADMIN WRITES:                                                     │       │
│  │  ┌──────────┐     ┌──────────┐     ┌──────────┐                   │       │
│  │  │ Create   │     │ Create   │     │ Configure│                   │       │
│  │  │ Course   │────►│ Lessons  │────►│ CASE     │                   │       │
│  │  │ (93)     │     │ (2,746)  │     │ Tracks(6)│                   │       │
│  │  └──────────┘     └──────────┘     └──────────┘                   │       │
│  │       │                                  │                         │       │
│  │       ▼                                  ▼                         │       │
│  │  ┌──────────┐                      ┌──────────┐                   │       │
│  │  │ Map to   │                      │ Create   │                   │       │
│  │  │Programme │                      │ Batches  │                   │       │
│  │  │(junction)│                      │(schedule)│                   │       │
│  │  └──────────┘                      └──────────┘                   │       │
│  │                                                                    │       │
│  │  LEARNER WRITES:                                                   │       │
│  │  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐ │       │
│  │  │ Enroll   │────►│ Take     │────►│ Complete │────►│ Submit   │ │       │
│  │  │ in course│     │Placement │     │ Lessons  │     │ Project  │ │       │
│  │  │          │     │ Test     │     │ (1→30)   │     │          │ │       │
│  │  └──────────┘     └──────────┘     └──────────┘     └──────────┘ │       │
│  │       │                │                │                 │       │       │
│  │       ▼                ▼                ▼                 ▼       │       │
│  │  vac_enrollments  case_track_   vac_learner_      case_track_    │       │
│  │                   enrollments    progress          enrollments    │       │
│  │                   .placement_                     .project_      │       │
│  │                    score                           submitted     │       │
│  │                                                                    │       │
│  └────────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌───────────────────────── READ PATH ───────────────────────────────┐       │
│  │                                                                    │       │
│  │  LEARNER READS:                                                    │       │
│  │                                                                    │       │
│  │  /vac ─────────────────► vac_courses + vac_course_programmes      │       │
│  │  /vac/[id] ────────────► vac_lessons + vac_learner_progress       │       │
│  │  /vac/my-courses ──────► vac_enrollments_with_details (VIEW)      │       │
│  │  /vac/case ────────────► case_tracks + case_track_enrollments     │       │
│  │                          + case_learner_progress                   │       │
│  │  /vac/certificate ─────► vac_enrollments + profiles               │       │
│  │                                                                    │       │
│  │  ADMIN READS:                                                      │       │
│  │                                                                    │       │
│  │  /vac/admin ───────────► Aggregated stats (count queries)         │       │
│  │  /vac/admin/analytics ─► case_graduation_readiness (VIEW)         │       │
│  │                          case_risk_calculator (VIEW)               │       │
│  │                          get_vac_course_enrollment_stats() (FUNC) │       │
│  │  /vac/admin/case ──────► case_learner_progress                    │       │
│  │                          + case_alerts (risk management)          │       │
│  │                                                                    │       │
│  └────────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌───────────────────────── CRON PATH ───────────────────────────────┐       │
│  │                                                                    │       │
│  │  7:00 AM IST Daily:                                                │       │
│  │                                                                    │       │
│  │  process_case_alerts()                                             │       │
│  │       │                                                            │       │
│  │       ├──► READ case_learner_progress (all active)                │       │
│  │       ├──► READ case_graduation_requirements                      │       │
│  │       ├──► COMPUTE risk via case_risk_calculator view             │       │
│  │       ├──► WRITE case_learner_progress.risk_level                 │       │
│  │       ├──► WRITE case_alerts (new alerts)                         │       │
│  │       └──► WRITE notifications + push (via notification service)  │       │
│  │                                                                    │       │
│  └────────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. State Machine Diagrams

### 4.1 VAC Enrollment Status

```
                    ┌─────────┐
         Enroll     │         │   Fee waived/paid
        ────────►   │ ACTIVE  │ ──────────────────► (course access)
                    │         │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │COMPLETED │ │EXPIRED │ │CANCELLED │
        │          │ │        │ │          │
        │All 30    │ │30 days │ │Student   │
        │lessons   │ │no      │ │withdrew  │
        │done      │ │payment │ │          │
        └──────────┘ └────────┘ └──────────┘
              │
              ▼
        ┌──────────┐
        │CERTIFICATE│
        │ available │
        └──────────┘
```

### 4.2 CASE Track Enrollment Status

```
                    ┌──────────┐
      Placement     │          │    Start attending
      test taken    │ ENROLLED │ ─────────────────────┐
     ──────────►    │          │                      │
                    └──────────┘                      ▼
                                              ┌─────────────┐
                                              │             │
                                              │ IN_PROGRESS │
                                              │             │
                                              └──────┬──────┘
                                                     │
                                     ┌───────────────┼───────────────┐
                                     │               │               │
                                     ▼               ▼               ▼
                              ┌──────────┐    ┌────────────┐  ┌──────────┐
                              │COMPLETED │    │ INCOMPLETE │  │  RETRY   │
                              │          │    │            │  │          │
                              │All 3     │    │Semester    │  │Failed    │
                              │gates     │    │ended but   │  │gate(s), │
                              │passed    │    │gates not   │  │re-enroll │
                              │          │    │met         │  │next sem  │
                              └──────────┘    └────────────┘  └──────────┘
```

### 4.3 CASE Learner Risk Level

```
                    ┌──────────┐
                    │          │
     Start ────────►│ ON_TRACK │◄──── recalculate daily
                    │   🟢     │
                    └─────┬────┘
                          │ tracks_per_sem_needed > 1
                          ▼
                    ┌──────────┐
                    │          │
                    │ AT_RISK  │◄──── 60-day alert triggered
                    │   🟡     │
                    └─────┬────┘
                          │ tracks_per_sem_needed >= 3
                          ▼
                    ┌──────────┐
                    │          │
                    │ CRITICAL │◄──── 30-day + coordinator alert
                    │   🔴     │
                    └─────┬────┘
                          │ semesters_remaining = 0 AND not done
                          ▼
                    ┌──────────┐
                    │          │
                    │ OVERDUE  │◄──── HOD + enforcement alert
                    │   ⚫     │
                    └──────────┘

     Any state → COMPLETED ✅ (when tracks_completed = 6)
```

### 4.4 Payment Status

```
                    ┌──────────┐
                    │          │
     Enroll ───────►│ PENDING  │
                    │          │
                    └─────┬────┘
                          │
              ┌───────────┼────────────┐
              │           │            │
              ▼           ▼            ▼
        ┌──────────┐ ┌────────┐  ┌──────────┐
        │   PAID   │ │ WAIVED │  │ REFUNDED │
        │          │ │        │  │          │
        │ HDFC     │ │ Fee=0  │  │ Student  │
        │ gateway  │ │ or     │  │ dropped  │
        │ confirms │ │ scholar│  │ within   │
        │          │ │ -ship  │  │ window   │
        └──────────┘ └────────┘  └──────────┘
```

---

## Quick Reference: All Tables & Their Cross-Module Connections

```
┌──────────────────────────────────────────────────────────────────────────┐
│ VAC TABLE               │ CONNECTS TO                │ MODULE           │
│─────────────────────────│────────────────────────────│──────────────────│
│ vac_courses             │ institutions.id            │ Organization     │
│                         │ programs.id                │ Organization     │
│─────────────────────────│────────────────────────────│──────────────────│
│ vac_lessons             │ vac_courses.id             │ (internal)       │
│─────────────────────────│────────────────────────────│──────────────────│
│ vac_enrollments         │ profiles.id (user_id)      │ Learners/Auth    │
│                         │ vac_courses.id             │ (internal)       │
│                         │ billing_student_bills      │ Billing          │
│─────────────────────────│────────────────────────────│──────────────────│
│ vac_learner_progress    │ profiles.id (user_id)      │ Learners/Auth    │
│─────────────────────────│────────────────────────────│──────────────────│
│ vac_course_programmes   │ programs.id                │ Organization     │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_tracks             │ case_tracks.id (self-ref)  │ (internal)       │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_track_courses      │ programs.id                │ Organization     │
│                         │ institutions.id            │ Organization     │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_track_enrollments  │ profiles.id (user_id)      │ Learners/Auth    │
│                         │ case_batches.id            │ (internal)       │
│                         │ student_attendance         │ Attendance       │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_batches            │ institutions.id            │ Organization     │
│                         │ staff.id (facilitator)     │ Staff            │
│                         │ timetables                 │ Timetable        │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_learner_progress   │ profiles.id (user_id)      │ Learners/Auth    │
│                         │ programs.id                │ Organization     │
│                         │ institutions.id            │ Organization     │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_alerts             │ profiles.id (user_id)      │ Learners/Auth    │
│                         │ profiles.id (coordinator)  │ Staff            │
│                         │ notifications              │ Notifications    │
│─────────────────────────│────────────────────────────│──────────────────│
│ case_graduation_reqs    │ programs.id                │ Organization     │
│                         │ institutions.id            │ Organization     │
└──────────────────────────────────────────────────────────────────────────┘

External module connections: 7 modules
  Organization:   8 FK references
  Learners/Auth:  6 FK references  
  Billing:        1 integration point (enrollment → bill)
  Attendance:     1 integration point (triple gate calculation)
  Staff:          2 FK references (facilitator, coordinator)
  Timetable:      1 integration point (batch scheduling)
  Notifications:  1 integration point (alerts → push)
```
