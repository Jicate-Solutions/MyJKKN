# Startup Studio — "Foundations" (Level 0) Spec

**Module:** `app/(routes)/startup-studio`
**Date:** 2026-06-01
**Status:** Draft for review (no code written yet)
**Source of the curriculum:** YCEO "Think Startup" student workbook (18 sessions + glossary), photographed in `~/Downloads/THINK STARTUP BOOK`.
**Author context:** Director (MD + CAIO). Non-coder — see "Plain-English summary" first.

---

## 0. Plain-English summary (for the Director)

The live `/startup-studio` is already a powerful machine, but its lowest rung is **"App Builder"** — it assumes a student who can *already* find a problem and direct AI to build an app. The "Think Startup" book is the stage **before** that: it forms the founder and teaches them how to find, frame, and evaluate an idea in the first place.

This spec adds that missing on-ramp as **"Foundations" — a new Level 0** inside the same Startup Studio, built by **extending the engine the studio already uses** (the same dynamic-worksheet system that today powers the "Ideal Customer Profile" exercise). We are **not** inventing a new mechanism. We reuse:

- the **worksheet form engine** (dynamic fields → student answers) already in production,
- the **progression ladder** (add a Level 0 below "App Builder"),
- the **mentor** system,
- the **same DB shape** the team already used to seed the ICP worksheet.

What's genuinely new and small: a thin "Foundations cohort/enrollment" container, the 18 book worksheets seeded as data, two new field types (a table/matrix and a read-only case-study block), and a mentor-feedback box on each worksheet.

**Build it in 3 phases.** Phase 1 (the part that actually matters — the ideation toolkit + founder self-assessment) is ~2–3 weeks. Full thing ~4–6 weeks.

---

## 1. Goal & success criteria

**Goal:** Give every student a structured, mentor-reviewed path from "blank slate" to "an idea framed well enough to enter the Appathon," using the book's 18 sessions, delivered *inside* the existing Startup Studio (not a separate app).

**Success criteria (verifiable):**
1. A student can enrol into a Foundations cohort and see the 18 worksheets in order.
2. A student can fill and submit a worksheet; a mentor can read it and leave structured feedback.
3. The 4 ideation tools (5 Whys, 6 Thinking Hats, SCAMPER, DFV) and the founder self-assessment render and store answers correctly.
4. Completing the required Foundations worksheets advances the student to **Level 0 → Level 1 (App Builder)** on the existing progression ladder.
5. Zero new "form mechanism" is introduced — the existing `sf100`-exercise renderer component is reused verbatim (with two additive field types).

---

## 2. Verified production scope (what this spec is built on)

Confirmed against `jicate/main` (production) on 2026-06-01. Local `feat/projects-retire-okr-menu` is **0 ahead / 6 behind** prod; **none of the 6 prod-only commits touch `startup-studio`** (they are campus-living hostel migrations). Therefore **local `/startup-studio` == production exactly.**

**The substrate to reuse — verified, not assumed:**

`supabase/migrations/20260401000001_sf100_exercises.sql`:

```sql
CREATE TABLE sf100_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES sf100_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields: [{ id, type: 'text'|'textarea'|'select'|'radio'|'number'|'scale',
  --            label, required, options?, placeholder? }]
  is_required BOOLEAN DEFAULT false,
  due_date DATE,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_by UUID REFERENCES profiles(id), ...
);

CREATE TABLE sf100_exercise_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES sf100_exercises(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  response_data JSONB NOT NULL DEFAULT '{}',
  submitted_by UUID NOT NULL REFERENCES profiles(id), ...
  UNIQUE(exercise_id, enrollment_id)
);
-- migration also SEEDS a 17-field "Ideal Customer Profile Builder" worksheet via a DO block.
```

**Renderer** (`app/(routes)/startup-studio/solve-for-100/_components/sf100-exercise-form.tsx`) supports exactly: `text`, `textarea`, `number`, `select`, `radio`, `scale`.

**Service** `SF100Service` (`lib/services/startup-studio/sf100-service.ts`, re-exported from `index.ts`) exposes `listExercises / createExercise / getExerciseResponses / submitExerciseResponse`.

**Progression** (`lib/constants/startup-studio/progression.ts`): levels **1–5** (`App Builder → Traction Builder → Solution Architect → AI Orchestrator → AI Principal`), each with `auto_criteria`. **No Level 0 today.**

**Key constraints discovered (these shape the design):**
- `SF100Enrollment.registration_id` is **non-nullable** → enrollment *requires* an event registration. Foundations is pre-event, per-student → **cannot reuse `sf100_enrollments`.**
- `SF100Program` is saturated with traction semantics (`paid_user_target`, `stall_*_days`, `min_transaction_amount`) → **overloading `sf100_programs` would pollute it.**
- `sf100_exercise_responses` has **no mentor-review columns** → the book's "Mentor's Suggestions" is missing even from the engine.

---

## 3. Architecture decision (and the alternatives rejected)

**Decision: Foundations is a new "journey" subsystem that owns thin container tables and reuses every shared pattern.** This mirrors exactly how the module already works — Cycles, Solve-100, NIF, and Events are each parallel journeys with their own tables that share the generic worksheet renderer, progression, mentor, and notification patterns.

**What we reuse verbatim:**
- The worksheet **`fields` JSONB schema** and the **`sf100-exercise-form.tsx` renderer** (lifted to a shared component — see §6).
- The **seed-via-migration-DO-block** technique (same as the ICP worksheet).
- The **progression** ladder (add Level 0).
- The **mentor** entities (`ss_mentors`, `ss_mentor_matches`) for assigning reviewers.
- **Notifications** (`sf100_notifications` pattern / `notification-service.ts`).

**What is new (small):** a Foundations container (`ss_foundations_*`) whose response table is a structural twin of `sf100_exercise_responses` **plus** mentor-review columns.

| Option | Verdict | Why |
|---|---|---|
| **A. New `ss_foundations_*` container, reuse renderer + patterns** ✅ chosen | **Adopt** | Matches the codebase's demonstrated "parallel journeys share patterns" architecture; clean semantics; reuses the jewel (renderer + field schema). |
| B. Overload `sf100_programs` / `sf100_enrollments` | Reject | `registration_id` is mandatory (no pre-event enrol); program columns are traction-specific → semantic pollution. |
| C. Hardcode 18 bespoke React forms | Reject | This is the "invent a parallel mechanism" anti-pattern; throws away the existing renderer; unmaintainable. |
| D. Worksheets as TS constants instead of DB rows | Note | Lighter, matches `tracks.ts`/`roles.ts` convention — but the team's *demonstrated* choice (ICP) is DB rows seeded via migration. We follow the demonstrated pattern (DB), which also leaves room for admin editing later. |

---

## 4. Data model (new — additive only)

All tables `ss_foundations_*` to sit alongside the other journey tables. RLS mirrors the `sf100_exercises` policies (authenticated SELECT; service_role ALL; owner INSERT/UPDATE on own responses).

```sql
-- A cohort = a group running the program (e.g., "TIPS Global, Class 9, 2026-27").
CREATE TABLE ss_foundations_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  academic_year TEXT,
  lead_mentor_id UUID REFERENCES ss_mentors(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','archived')),
  starts_on DATE, ends_on DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per STUDENT (individual formation; no event registration needed).
CREATE TABLE ss_foundations_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES ss_foundations_cohorts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','withdrawn')),
  completion_pct NUMERIC DEFAULT 0,           -- % of required worksheets reviewed
  graduated_to_level1_at TIMESTAMPTZ,         -- when they crossed into "App Builder"
  enrolled_at TIMESTAMPTZ DEFAULT NOW(), enrolled_by UUID REFERENCES profiles(id),
  UNIQUE(cohort_id, student_id)
);

-- Twin of sf100_exercises. cohort_id NULL = global canon (the 18 book worksheets).
CREATE TABLE ss_foundations_worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID REFERENCES ss_foundations_cohorts(id) ON DELETE CASCADE,  -- NULL = canon
  session_no INTEGER NOT NULL,                -- 1..18
  strand TEXT NOT NULL CHECK (strand IN ('mindset','ideation','evaluation','model','pitch','reflection')),
  title TEXT NOT NULL,
  description TEXT,                            -- short instructions / case text
  fields JSONB NOT NULL DEFAULT '[]',          -- SAME schema as sf100_exercises.fields (+2 new types, §5)
  is_required BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Twin of sf100_exercise_responses + the mentor-review columns the engine lacks today.
CREATE TABLE ss_foundations_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES ss_foundations_worksheets(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES ss_foundations_enrollments(id) ON DELETE CASCADE,
  response_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed')),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  -- NEW capability (missing from sf100 engine): per-worksheet mentor feedback
  mentor_feedback TEXT,
  mentor_rating INTEGER CHECK (mentor_rating BETWEEN 1 AND 5),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worksheet_id, enrollment_id)
);
```

The 18 canon worksheets are inserted via a **migration `DO $$` block** exactly like the ICP seed (§7 maps every session to its fields).

---

## 5. Engine extension (shared — benefits Solve-100 too)

Add **two field types** to the `SF100ExerciseField` union (`types/startup-studio/sf100.ts`) and the renderer `switch` (`sf100-exercise-form.tsx`). Additive and backward-compatible — existing exercises keep working.

| New `type` | Renders as | Needed by (book) | `response_data` shape |
|---|---|---|---|
| `matrix` | Editable table; `columns: {key,label,type}[]`, `rows?` fixed or add-row | Assumption Analyzer (S16), DFV/Rate-the-Idea (S5), revenue streams ×3/6/12mo (S14), cost items (S15), inspiring-entrepreneurs (S1), business-model examples (S10) | `{ [fieldId]: Array<Record<colKey,val>> }` |
| `markdown` | **Display-only** rendered text (no input) | teaching cases (Oyo/Ather/DKF/MTO/Diwali Mela), instructions, the "money cycle" / "three circles" explainers | n/a (not stored) |

Deferred (engine has no file upload today — do **not** invent one here): `image` (Draw Your Solution S4, Logo S10) and `video` (60-sec pitch S18). Phase 3 — reuse existing upload infra rather than building new.

---

## 6. Component reuse (the important "extend, don't reinvent" move)

The renderer `sf100-exercise-form.tsx` currently lives under `solve-for-100/_components`. **Lift it to a shared location** so both journeys use one renderer:

- Move → `components/startup-studio/worksheet-form.tsx` (generic; props: `fields`, `value`, `onChange`, `readOnly`).
- Re-export a thin `sf100-exercise-form.tsx` that wraps it (so Solve-100 imports are untouched — zero-risk refactor).
- Foundations worksheet pages render the **same** component.
- Add the `matrix` + `markdown` cases once, in the shared component → both journeys gain them.

This is the single highest-leverage reuse: one renderer, two journeys, fixed field-type vocabulary.

---

## 7. Curriculum mapping — 18 sessions → worksheets

Each row becomes one `ss_foundations_worksheets` canon record. "Fields" lists the field `type`s. ⚠ = needs a new field type from §5.

| S | Worksheet (strand) | Fields | Fills which book gap |
|--|--|--|--|
| 1 | About Me (mindset) | text ×3, textarea ×3 | Founder self-assessment |
| 1 | Five Big Drivers of Change + The Doers (mindset) | text ×5, radio, textarea | — |
| 1 | Two Mindsets: Scarcity vs Abundance (mindset) | matrix ⚠ | — |
| 1 | Five Entrepreneurs Who Inspire You (mindset) | matrix ⚠ (name \| what you admire) | Role models |
| 1 | One Crazy Idea (ideation) | textarea ×3 | — |
| 2 | Ideation Challenge (ideation) | textarea ×4 | — |
| 2 | Founder Case Studies — Sahil&Sudhir, Oyo, Ather, Unacademy (mindset) | markdown ⚠ + textarea (learning points) | **Teaching-case library** |
| 2 | Startup vs Other Enterprises / PMF (mindset) | markdown ⚠ + textarea | — |
| 3 | 8 Mindsets of a Founder (mindset) | text ×8, textarea | — |
| 3 | Doubling Lilies — exponential thinking (mindset) | markdown ⚠ + textarea | — |
| 3 | Founder-Type Matrix — Passion × Scale (mindset) | scale ×2 → computed quadrant, radio ("where do you belong"), textarea | **Founder-type self-placement** |
| 4 | One Idea for Young CEO (ideation) | textarea ×3 (problem / solution / origin) | — |
| 4 | **5 Whys** (ideation) | textarea ×5 + textarea (what it revealed) | **Root-cause toolkit** |
| 4 | **6 Thinking Hats** (ideation) | textarea ×6 (white/red/black/yellow/green/blue) | **Brainstorm toolkit** |
| 4 | DKF Case (evaluation) | markdown ⚠ + textarea | — |
| 4 | **SCAMPER** (ideation) | textarea ×7 | **Idea-improvement toolkit** |
| 4 | Draw Your Solution (ideation) | textarea (image ⚠ deferred to P3) | — |
| 5 | **DFV Scoring** (evaluation) | scale ×3 (Desirability/Feasibility/Viability) + textarea ×3 reasons | **Idea-evaluation toolkit** |
| 5 | Rate the Idea / good vs bad (evaluation) | matrix ⚠ (idea \| score \| reason) | — |
| 5 | Idea Dating — peer scoring (evaluation) | matrix ⚠ (peer-to-peer; see Open Q #3) | Peer validation |
| 5 | **Value Proposition Canvas** (model) | textarea ×6 (gains/pains/jobs/products/pain-relievers/gain-creators) | **Value-prop literacy** |
| 5/6 | **Core Value Proposition** mad-lib (model) | text ("We help [X] do [Y] by doing [Z]") | **CVP statement** |
| 7 | Ideal Customer (model) | *reuse the seeded ICP worksheet* (link, don't duplicate) | already in engine |
| 8 | Market Sizing — TMO = f(ICP) + MTO case (model) | markdown ⚠ + number ×n | — |
| 9 | Brand + **TAM/SAM/SOM/LAM** (model) | markdown ⚠ + number ×4 + textarea | **Market-sizing literacy** |
| 10 | **Business-Model Archetype** (model) | radio (Free/Freemium/Cost-plus/Leasing/Subscription/Platform/Social) + matrix ⚠ examples | **Business-model literacy** |
| 11 | Customers, Channels & Relationships (model) | textarea ×5 | — |
| 12 | Key Activities & Resources (model) | textarea ×2 / matrix ⚠ | — |
| 13 | Diwali Mela / the Money Cycle (model) | markdown ⚠ + number (profit calc) | — |
| 14 | Revenue Streams ×3/6/12mo (model) | matrix ⚠ | **Unit-economics worksheet** |
| 15 | Cost Items ×3/6/12mo (model) | matrix ⚠ | **Unit-economics worksheet** |
| 16 | **Assumption Analyzer** + CAC + critical risks (evaluation) | matrix ⚠ (assumption \| chance-wrong \| impact \| score) + number + textarea | **Assumption/risk rigour** |
| 17 | Improve the Idea — cheaper/better (evaluation) | textarea | — |
| 18 | 60-Second Pitch (pitch) | textarea (video ⚠ deferred to P3) | — |
| — | A Note on Overall Growth (reflection) | textarea | **Reflective journal** |
| all | Mentor's Suggestions & Comments | (mentor-review columns on every response) | **Mentor feedback loop** |

Plus a **Glossary** (24 terms from the book) — simplest path: `lib/constants/startup-studio/foundations-glossary.ts` + a drawer on the Foundations layout (no DB).

---

## 8. API routes (mirror existing `startup-studio` route patterns)

All under `app/api/startup-studio/foundations/`, using `withAuth` + `successApiResponse`/`createdResponse`/`errorResponse` + `corsHeaders` (identical to existing routes):

```
GET    /cohorts                              list cohorts
POST   /cohorts                              create cohort
GET    /cohorts/[id]                         cohort detail + roster
POST   /cohorts/[id]/enroll                  enrol student(s)
GET    /worksheets?cohort_id=&strand=        list worksheets (canon + cohort overrides)
GET    /worksheets/[id]                      worksheet definition
GET    /worksheets/[id]/responses            responses (mentor view)
POST   /worksheets/[id]/responses            submit/update own response
POST   /responses/[id]/review                mentor feedback (mentor_feedback, rating)  ← new capability
GET    /enrollments/my                       my enrolment + progress
GET    /enrollments/[id]/progress            completion %, level status
```

Service: `lib/services/startup-studio/foundations-service.ts` (extends `BaseService` like `cycles-service.ts`). Hooks: `hooks/startup-studio/use-foundations.ts` (React Query, mirroring `use-sf100.ts`).

---

## 9. UI pages (mirror existing module structure)

```
app/(routes)/startup-studio/foundations/
  page.tsx                          Foundations home (cohorts or "my journey")
  layout.tsx                        + Glossary drawer
  cohorts/[id]/...                  admin: roster, progress board
  my-journey/                       student: 18 worksheets as a guided stepper
    [worksheetId]/                  fill a worksheet (shared worksheet-form.tsx)
  review/                           mentor: queue of submitted responses to review
```

Add **"Foundations"** as a group in `app/(routes)/startup-studio/nav-config.ts` (icon `GraduationCap` or `Compass`), placed first (it's the on-ramp).

---

## 10. Progression — add Level 0

In `lib/constants/startup-studio/progression.ts`, prepend:

```ts
{
  level: 0,
  name: 'Explorer',
  test: 'Completed the Foundations program — found, framed, and evaluated an idea',
  auto_criteria: { foundations_completion_pct: 80 }, // ≥80% of required worksheets reviewed
  stage: 'Foundations',
  identity: 'I can find a real problem and judge whether an idea is worth building.',
  color: 'slate',
}
```

Widen `ProgressionLevelNumber` (`types/startup-studio/index.ts`) to include `0`. Update `progression-service.ts` auto-criteria evaluation to read `ss_foundations_enrollments.completion_pct`. Level 0 → Level 1 transition stamps `graduated_to_level1_at`.

---

## 11. Permissions / roles

Reuse the existing module role model — do **not** invent roles. Run `/persona-design` on Foundations before build to map: **student** (own responses), **mentor/reviewer** (review queue + feedback), **cohort admin / facilitator** (create cohorts, enrol, see all). Register new routes in `lib/permissions-audit/module-mappings.ts` + `lib/constants/table-module-map.ts` (the `check-permission-audit-coverage` script runs inside `npm run build` and will fail the deploy if the new `ss_foundations_*` tables and routes aren't registered — known gate).

---

## 12. Phasing (ship the on-ramp that matters first)

**Phase 1 — MVP on-ramp (~2–3 weeks).** The pieces that decide *who even reaches the Appathon*:
- Container tables + RLS; shared `worksheet-form.tsx`; `matrix` + `markdown` field types; mentor-review columns + `/responses/[id]/review`.
- Seed **8 worksheets**: About Me, Founder-Type Matrix, 5 Whys, 6 Thinking Hats, SCAMPER, DFV, CVP, Overall-Growth reflection.
- Level 0 "Explorer"; student stepper UI; mentor review queue; nav entry.
- **Verifiable done:** student completes the 8, mentor reviews, student crosses to Level 1.

**Phase 2 — value-prop & business-model literacy (~1–2 weeks).** VPC, TAM/SAM/SOM, business-model archetype, revenue/cost matrices, Assumption Analyzer; link the existing ICP worksheet.

**Phase 3 — enrichment.** Teaching-case library (markdown), glossary drawer, peer Idea-Dating (cross-enrollment scoring), and `image`/`video` field types (Draw Your Solution, Logo, 60-sec pitch) via existing upload infra.

---

## 13. Open questions / verify-before-build

1. **Live DB drift check.** Module code == prod is confirmed by git, but some migrations are applied via Supabase MCP, not files. Before building, confirm `sf100_exercises` / `sf100_exercise_responses` exist in the live DB exactly as the migration (quick `\d` via Supabase MCP). Schema for new tables is greenfield so low risk.
2. **Mentor wiring.** Reuse `ss_mentors` + `ss_mentor_matches`, or is a simple `reviewed_by = profiles.id` enough for v1? (Recommend: simple reviewer for Phase 1; wire `ss_mentor_matches` in Phase 2.)
3. **Idea Dating (peer scoring)** is the one worksheet that isn't a solo form — it needs cross-enrollment scoring (student A scores student B). Deferred to Phase 3; model as its own light table if pursued, not as `response_data`.
4. **Worksheets: DB vs constants.** Spec chooses DB-seeded (matches the ICP precedent). If the Director wants the curriculum git-versioned/non-editable, flip to a constants file — decide before Phase 1 seed.
5. **Cohort vs individual.** Spec assumes per-student enrolment. Confirm whether Foundations runs school-cohort-wide (auto-enrol a class) — affects the enrol endpoint only.

## 14. Out of scope
- Equity / IP ownership of student ventures (a governance/strategy decision, not this module).
- Changing the Appathon/Solve-100/NIF flows (Foundations only *feeds* them).
- File-upload infrastructure (reuse existing; don't build new here).

---

## 15. Effort estimate
- Phase 1: ~2–3 weeks (1 dev). Phase 2: ~1–2 weeks. Phase 3: ~1–2 weeks. **Total ~4–6 weeks.**
- Net-new tables: 4 (`ss_foundations_*`). Net-new field types: 2. Reused components/patterns: renderer, progression, mentor, notifications, route/service/hook conventions.
- **⚠ Superseded by the assumption-thrash deltas below — see §16.**

---

## 16. Silent Assumption Decisions (from /assumption-thrash, 2026-06-02)

**Preflight (Layer-2 broad sweep):** Done via git-verified committed migrations (no Supabase MCP this session). Five form/curriculum engines exist in prod (`sf100_exercises`, `vac_courses`/`vac_lessons`, `pde_assessments`, `campus-living/wellness`, `ai-pulse/quiz` + NAAC/internship form engines). **VAC was the closest false-twin** — a student curriculum engine — but lacks the studio progression-ladder + Appathon coupling that is Foundations' whole point. Resolved: **extend `sf100_exercises` (studio-native)**. No same-audience-AND-same-problem parallel that should replace it.

### Round 1 — structural
| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Engine / home | **Studio-native** — extend sf100 worksheet engine | Tightest coupling to progression ladder + Appathon funnel (which the outcome metric measures); VAC lacks it |
| 2 | Curriculum variance | **One canon 18-set** for now (cohort can override individual worksheets) | Evidence over forecast; branch by audience (school/UG/PG) after real usage data |
| 3 | Completion definition | **Submit = complete; mentor review = separate quality flag** | Mentor throughput never blocks student progress or the metric |
| 4 | Enrollment model | **Both** — facilitator auto-enrol + open self-enrol | Classroom rollout AND voluntary/club delivery |

### Round 2 — workflow & storage
| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 5 | Edit lineage | **Snapshot** field-schema into each response | Later worksheet edits never orphan/scramble past answers; audit-safe (mirrors studio approval-chain snapshot) |
| 6 | Resubmission | **Yes, versioned history** | Book is iterative ("improve your idea"); mentors see the student's progression |
| 7 | Review SLA | **Best-effort queue; student sees awaiting/reviewed status** | No deadline pressure; simplest; no escalation config |
| 8 | Privacy | **Private**: student + their mentor + cohort facilitator | Safe default; honest answers on personal worksheets; peer Idea-Dating = explicit opt-in later |

### Round 3 — operational & artifacts
| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 9 | Proxy fill | **Yes** — facilitator fills on behalf, logged as proxy (`submitted_by` ≠ student) | Paper-first classrooms, younger students |
| 10 | Completion certificate | **Auto-generate + notify** on Level-0 completion | Reuse studio participation-cert pattern + notification |
| 11 | Drawing/image worksheets | **Build `image` field type in Phase 1** | Draw-Your-Solution + Logo land complete at launch |
| 12 | Completion scope | **Once per student (global)**, not per cohort | No double-counting in the Appathon metric; cohort = roster wrapper |

### Schema implications (derived — these override §4/§5/§10/§12/§13)
- **Responses key to the STUDENT, not the enrollment** (#12): `ss_foundations_responses` `UNIQUE(worksheet_id, student_id)`, with `cohort_id`/`enrollment_id` as nullable *context-where-done*. Completion = distinct submitted worksheets per student across all cohorts.
- **`fields_snapshot JSONB` on each response** (#5): freeze the worksheet's field definitions at submit-time.
- **Versioned resubmits** (#6): add `ss_foundations_response_versions` (append-only; latest canonical, history retained) — **net-new table #5**.
- **`submitted_by` distinct from student** (#9): keep the actual typer / proxy separate from the enrollment's `student_id`; audit who entered.
- **Response status enum** (#7): `draft | submitted | reviewed` (submitted ⇒ counts for completion; reviewed = quality flag). `reviewed_by`, `reviewed_at`, `mentor_feedback`, `mentor_rating`.
- **Level-0 graduation reads SUBMITTED %** (#3), not reviewed % — update §10 `foundations_graduation_pct` semantics to "submitted".
- **Engine extension = 3 field types** (#11): `matrix` + `markdown` + **`image`** (image reuses existing upload infra) — supersedes §5's "image deferred to P3".
- **Certificate generator + notification** (#10): Level-0 completion fires a notification + auto-generated PDF cert (reuse the studio participation-certificate mechanism) — supersedes §13 silence on artifacts.
- **RLS** (#8): student SELECTs own; mentor SELECTs assigned (via `ss_mentor_matches`/reviewer link); facilitator SELECTs cohort roster; **no peer SELECT**.

### Scope deltas vs original spec (Phase 1 grew)
- **Now in Phase 1** (pulled earlier): `image` field type + Draw/Logo worksheets; auto-certificate + notification; versioned resubmits; per-student-global completion.
- **Revised effort: Phase 1 ~3–4 weeks** (was 2–3) for image-upload + cert + versioning. **Total ~5–7 weeks.**
- **Net-new tables: 5** (4 `ss_foundations_*` + `ss_foundations_response_versions`). **Net-new field types: 3** (matrix, markdown, image).
- §13 open-Q resolved: #5 (cohort vs individual) → both, per-student completion; #3 (Idea Dating peer-scoring) remains Phase 3.

### Still verify before DDL (build Step 0)
- Confirm live `sf100_*` shape via Supabase MCP (`\d sf100_exercises`).
- Grep for the existing studio participation-certificate generator to reuse for #10 (don't build new PDF infra).
- Confirm existing image-upload infra (bucket + component) to wire the `image` field type for #11.
