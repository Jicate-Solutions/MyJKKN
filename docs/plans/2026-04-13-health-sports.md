# Health Module — Sprint 2: Sports & Fitness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Digitalize the JKKN Sports Policy into MyJKKN — credit system, scholarships, fitness assessments, training logs, tournament permissions, injury tracking, and achievements.

**Architecture:** Client-side Supabase queries via HealthSportsService. 10 new DB tables (already applied to production). 4 new pages integrated into the Health & Wellness sidebar group. Types in types/health-sports.ts (already written). Service in lib/services/health/health-sports-service.ts (already written).

**Tech Stack:** Next.js App Router, Supabase (RLS), shadcn/ui, lucide-react.

**Source Policy:** JKKN Institutions Comprehensive Sports Policy & SOPs.

**Spec:** `docs/SPEC-health-module.md` (Section 10A)

---

## What's Already Done (Foundation)

| Task | Status | Files |
|------|--------|-------|
| 10 DB tables + RLS + indexes | DONE | Applied to production Supabase |
| TypeScript types | DONE | `types/health-sports.ts` (250 lines) |
| Service layer | DONE | `lib/services/health/health-sports-service.ts` (200 lines) |
| Sidebar integration | DONE | 4 new menu items added to `lib/sidebarMenuLink.ts` |

## What Needs Building (Pages)

### Task S1: Sports Profile Page — `/health/sports`

**Files:**
- Create: `app/(routes)/health/sports/page.tsx`

**Sections:**
1. **Sports Card** — prominent visual card: primary sport, level, team. Sports quota badge if applicable.
2. **My Sports List** — add/remove sports. Each: sport (dropdown from JKKN_SPORTS), position, level (SPORT_LEVELS), team. Tag/chip add pattern.
3. **Coach Info** — name + phone (tel: link for one-tap call)
4. **Scholarship Status** — amount, concessions (hostel 25%, bus waiver), verification status (3-step: PE Director → Admission → Director). Traffic-light badges.
5. **Credits This Semester** — total hours, attendance %, credits earned / 3 max. Progress bar. Breakdown: practice, tournaments, winning, leadership, sportsmanship per CREDIT_RULES constants.
6. **Evaluation Score** — 4 criteria bars: Participation (30%), Performance (30%), Achievements (20%), Sportsmanship (20%). Total out of 100.
7. **Tournament Permissions** — list of requests with 4-step approval chain visualization. "Request Permission" button opens form: tournament name, level, sport, dates, travel details, team members, justification.

**Service calls:** `getOrCreateSportsProfile`, `updateSportsProfile`, `getScholarship`, `getSportsCredits`, `getPermissions`, `submitPermissionRequest`

---

### Task S2: Fitness Tests Page — `/health/fitness`

**Files:**
- Create: `app/(routes)/health/fitness/page.tsx`

**Sections:**
1. **Latest Test Results** — grid of 12 metrics from Section 10A.5 of spec. Each metric: name, value, unit, colored indicator (poor→excellent). Overall fitness score as large circular gauge with category badge.
2. **BMI + VO2 Max** — auto-calculated from test data. VO2 max from beep test using Leger formula. Info tooltips explaining what these mean.
3. **History Timeline** — vertical timeline of past tests. Each: date, assessed by, score, trend arrow vs previous test (improved/declined/same).
4. **New Test Entry** (faculty/admin only) — form with all 12 fitness test fields. Auto-calculate BMI, VO2 max, fitness score, category on submit. Search learner by name/roll to assign test to.

**Service calls:** `getFitnessTests`, `submitFitnessTest`

**Gotcha:** VO2 max formula = 18.043461 + (3.238462 × beep_level) - (0.014636 × beep_level²). Already in service.

---

### Task S3: Training Log + Injury Tracker — `/health/training`

**Files:**
- Create: `app/(routes)/health/training/page.tsx`

**Two tabs: "Training Log" and "Injury Log"**

**Training Log tab:**
1. **Week Summary** — total minutes, sessions, sports trained. 7-day heatmap (Mon-Sun blocks).
2. **Add Entry** — form: sport (JKKN_SPORTS), type (TRAINING_TYPES with emojis), duration minutes, intensity (4 buttons: low/moderate/high/max), self-rating (1-5 stars), notes. Submit calls addTrainingLog.
3. **Recent Entries** — 30-day list grouped by date. Each: sport, type+emoji, duration badge, intensity badge, self-rating stars.

**Injury Log tab:**
1. **Active Injuries** — cards for recovery_status != 'recovered'. Body part label, injury type, severity badge (minor=yellow, moderate=orange, severe=red), days since, cleared-to-play status.
2. **Report Injury** — form: date, sport, type (INJURY_TYPES), body part (BODY_PARTS), severity radio, description, treatment. Submit calls addInjury.
3. **History** — collapsed list of recovered injuries.

**Service calls:** `getTrainingLogs`, `addTrainingLog`, `getWeeklyTrainingSummary`, `getInjuries`, `addInjury`

---

### Task S4: Achievements / Medal Wall — `/health/achievements`

**Files:**
- Create: `app/(routes)/health/achievements/page.tsx`

**Sections:**
1. **Summary Cards** — 3 stat cards: total medals (gold+silver+bronze), highest level achieved, verified count.
2. **Medal Wall** — visual grid. Each achievement: medal icon (🥇🥈🥉🏅), sport, event name, level badge, date. Gold/silver/bronze have different border accent colors. Verified badge overlay.
3. **Add Achievement** — form: date, sport (JKKN_SPORTS), event name, level (SPORT_LEVELS), type (gold/silver/bronze/participation/record/best_player/captain), description, certificate URL. Submit calls addAchievement.
4. **Level Progression Pyramid** — visual showing count at each level. International at top (rare), intra-college at bottom (common). Pyramid shape.

**Service calls:** `getAchievements`, `addAchievement`

---

### Task S5: Build Verification

**Step 1:** Run `npm run build` — all 4 new pages must appear in route list.
**Step 2:** Verify all 10 sports DB tables exist on production with RLS.
**Step 3:** Verify sidebar shows 4 new sports menu items.

---

## Dependency Graph

```
Foundation (DONE)
├── Types (health-sports.ts) ✅
├── Service (health-sports-service.ts) ✅
├── DB Tables (10 tables + RLS) ✅
└── Sidebar (4 items added) ✅

Pages (CAN RUN IN PARALLEL)
├── Task S1: /health/sports (credits + scholarships + permissions)
├── Task S2: /health/fitness (test results + new test form)
├── Task S3: /health/training (log + injuries)
└── Task S4: /health/achievements (medal wall + progression)

Verification (AFTER all pages)
└── Task S5: Build + DB + sidebar check
```

Tasks S1-S4 have NO dependencies on each other — they all use the same service layer and types. A swarm of 2-4 agents can build all 4 simultaneously.

---

## Gotchas

| Risk | Mitigation |
|------|-----------|
| Credit calculation is complex (5 categories × thresholds) | CREDIT_RULES constant in types/health-sports.ts encodes all policy rules. Service calculates, pages display. |
| Scholarship amounts must match policy EXACTLY | Scholarship table has exact amounts. UI shows them read-only from DB, never calculated client-side. |
| 5-step permission approval chain is sequential | Each step is a separate column. UI shows all 4 steps with status. Only the current pending step is actionable. |
| Fitness test VO2 max formula must be scientifically accurate | Leger formula hardcoded in service. Not editable. |
| Injury "cleared to play" is a medical decision | Only health_supervisor role can mark cleared_to_play = true. Student can report injury but not clear themselves. |

---

*Plan produced by writing-plans skill for Sprint 2 (Sports). Ready for human gate.*
