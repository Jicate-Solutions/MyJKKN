# Health — Wellness Programs feature

**Date:** 2026-06-15
**Driver:** "MindSmile – Patanjali Payilvom" 7-day yoga awareness week (15–21 June 2026), proposed by Dr. P.K. Meena Priya.
**Status:** PR1 (DB substrate) in progress.

## Why

The `/health` module is fully built but **dormant in production** (0 consents, 0 daily logs,
9 auto-created profiles). It has a dead "Upcoming Health Camps" placeholder and no way to
publish a program/campaign. MindSmile is the first concrete program AND the adoption on-ramp:
scan/open → watch → land in `/health` → consent → start tracking.

## Scope decision (from Director, 2026-06-15)

- **Build a reusable platform feature**, not a one-off page.
- **Audience v1: students + staff, tracked in-app** (who watched each day + quiz + streak).
- Public no-login fallback for patients = PR4 (optional).

## Reuse verdict

Copy AI Pulse **patterns**, do NOT reuse its tables.
- AI Pulse engine is student-only (`learners_profiles.id`) and single-shot (one video/quiz per cycle).
- MindSmile needs 7 daily videos + staff participation → both break the AI Pulse engine.
- Pattern precedents: `startup_events` (cycle lifecycle), `event_team_attendance.engagement_signals`
  (per-person engagement), AI Pulse `quiz-editor.tsx` / `cycle-edit-form.tsx` / `publication-metrics-card.tsx`
  (admin authoring + impact display), Family Moments public `[token]` + `/api/public/.../track` (PR4 fallback),
  `components/resource-management/qr-code-generator.tsx` + `qr-label-sheet.tsx` (QR printing).

## Persona note (gate finding)

The existing `/health` module keys everything on `learner_id` → **student-only by construction**.
Including staff REQUIRES keying new participation on `profiles.id` (= `auth.users.id`, held by both).
Admin persona `health_supervisor` (scope=all) already exists; no missing role.

## Impact measurement (designed into schema)

| Tier | Metrics | Columns |
|---|---|---|
| Reach | unique participants, opens/day, % eligible reached | `participation` rows count |
| Engagement | completion funnel 1/7→7/7, drop-off day, streak | `watched_at`, `completed` |
| Learning | quiz attempts + scores, per-theme correct-rate | `quiz_score` |
| Outcome (self-report) | "was this useful?" tap, end-of-week reflection | `usefulness_rating`, `reflection_text` |
| **North-star: adoption lift** | new consents + first mood-log within 14d of participating | JOIN `health_consents` / `health_daily_logs` by date |

Honesty rule: report reach/engagement/usefulness/adoption-lift. Never claim a 7×1-min video
week causes clinical wellbeing change — not attributable, not measured.

## Tables (PR1)

1. `health_programs` — campaign container (status enum draft→scheduled→active→completed→archived;
   `institution_id` NULL = all colleges; `audience` students|staff|both|public; `public_token` for PR4).
2. `health_program_days` — 7 daily items (day_number, title, video_url, summary, publish_date, quiz JSONB).
3. `health_program_participation` — **keyed on `profiles.id`**, per-day (watched_at, completed, quiz_score,
   usefulness_rating, reflection_text). UNIQUE(day_id, user_id).
+ `fn_health_program_impact(program_id)` RPC — aggregates the tiers above. REVOKE anon / GRANT authenticated.

Q1 value-list: only `status` (state machine → enum, justified) + `audience` (fixed set → text+CHECK). No master table.
Q2 UI-twin: admin authoring copies AI Pulse `quiz-editor` / `cycle-edit-form`.

## Surfaces (later PRs)

- PR2: `/health/programs/[slug]` consume page + dashboard "Active Wellness Programs" card
  (repurpose `HealthCampsCard` at `health/dashboard/page.tsx:511-536`) + service + hooks
  + permission catalog keys (`health.programs.view` / `.manage`) + sidebar + role grants + smart-guide fragment.
- PR3: `/health/admin/programs` authoring + `/health/admin/programs/[id]/impact` dashboard.
- PR4 (optional): public `/p/[token]` page + `/api/public/health-programs/[token]/track` + QR print +
  `health_program_views` table.

## Permission keys

- `health.programs.view` — students/staff consume.
- `health.programs.manage` — health_supervisor authors + sees impact.
RLS references these strings now; catalog entries + role grants land in PR2.
