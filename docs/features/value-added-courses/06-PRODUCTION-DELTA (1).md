# VAC Module — Production Delta

**Comparison:** `omm-dev` (ommdev remote) vs `origin/main` (production)
**Generated:** 2026-03-31

## Summary

| Action | Count |
|--------|-------|
| New files (CREATE) | 49 |
| Modified files (UPDATE) | 1 |
| Deleted files | 0 |
| **Total** | **50** |

## New Files — Developer Must CREATE (49)

### Types (2)
- `types/vac.ts` — VAC course, lesson, enrollment, progress types + FinksProfile + TieredExercises
- `types/case.ts` — CASE track, enrollment, batch, risk types

### Services (2)
- `lib/services/vac-service.ts` — 1000+ lines: course CRUD, enrollment, progress, analytics, recommendations, filtering
- `lib/services/case-service.ts` — 400+ lines: tracks, enrollments, placement, graduation, risk

### Hooks (2)
- `hooks/vac/use-vac.ts` — 900+ lines: 30+ React Query hooks for all VAC operations
- `hooks/case/use-case.ts` — 300+ lines: track, enrollment, placement, analytics hooks

### Data (1)
- `lib/data/case-placement-questions.ts` — 50 placement test questions (10 per track)

### Learner Pages (8)
- `app/(routes)/vac/page.tsx` — Course catalog with search, filters, recommendations
- `app/(routes)/vac/[courseId]/page.tsx` — Course detail with sequential lesson gating
- `app/(routes)/vac/[courseId]/[lessonId]/page.tsx` — Lesson content with tiered exercises
- `app/(routes)/vac/my-courses/page.tsx` — My enrollments + Professional Development tab
- `app/(routes)/vac/case/page.tsx` — CASE Graduation Tracker dashboard
- `app/(routes)/vac/case/placement/[trackId]/page.tsx` — Placement test page
- `app/(routes)/vac/certificate/[enrollmentId]/page.tsx` — Certificate + Senior Learner endorsement
- `app/(routes)/vac/progress/page.tsx` — Progress overview

### Learner Components (9)
- `app/(routes)/vac/_components/course-filters.tsx` — Filter sidebar (search, track, fee, sort)
- `app/(routes)/vac/_components/recommended-courses.tsx` — Programme-based recommendations
- `app/(routes)/vac/_components/enroll-button.tsx` — Enrollment action button
- `app/(routes)/vac/_components/enrollment-gate.tsx` — Content gating for unenrolled users
- `app/(routes)/vac/_components/finks-profile.tsx` — Fink's Taxonomy visualization
- `app/(routes)/vac/_components/progress-bar.tsx` — Course progress indicator
- `app/(routes)/vac/case/_components/progress-overview.tsx` — CASE progress ring
- `app/(routes)/vac/case/_components/risk-banner.tsx` — Risk status banner
- `app/(routes)/vac/case/_components/track-card.tsx` — CASE track card

### Admin Pages (12)
- `app/(routes)/vac/admin/page.tsx` — Admin dashboard
- `app/(routes)/vac/admin/courses/page.tsx` — Course list
- `app/(routes)/vac/admin/courses/new/page.tsx` — Create course
- `app/(routes)/vac/admin/courses/[courseId]/edit/page.tsx` — Edit course
- `app/(routes)/vac/admin/courses/[courseId]/lessons/page.tsx` — Lesson list
- `app/(routes)/vac/admin/courses/[courseId]/lessons/new/page.tsx` — Create lesson
- `app/(routes)/vac/admin/courses/[courseId]/lessons/[lessonId]/edit/page.tsx` — Edit lesson
- `app/(routes)/vac/admin/enrollments/page.tsx` — Enrollment admin
- `app/(routes)/vac/admin/analytics/page.tsx` — Analytics (4 tabs)
- `app/(routes)/vac/admin/settings/page.tsx` — Module settings
- `app/(routes)/vac/admin/case/page.tsx` — CASE admin
- `app/(routes)/vac/admin/case/tracks/page.tsx` — Track list admin
- `app/(routes)/vac/admin/case/tracks/[trackId]/edit/page.tsx` — Track edit

### Admin Components (7)
- `app/(routes)/vac/admin/case/_components/at-risk-table.tsx`
- `app/(routes)/vac/admin/case/_components/stats-cards.tsx`
- `app/(routes)/vac/admin/case/batches/_components/batch-form.tsx`
- `app/(routes)/vac/admin/case/batches/_components/batch-list.tsx`
- `app/(routes)/vac/admin/case/batches/page.tsx`
- `app/(routes)/vac/admin/case/readiness/_components/readiness-chart.tsx`
- `app/(routes)/vac/admin/case/readiness/page.tsx`

### Admin Course Components (3)
- `app/(routes)/vac/admin/courses/_components/vac-course-form.tsx` — Course form with Fink's editor
- `app/(routes)/vac/admin/courses/_components/vac-course-filters.tsx`
- `app/(routes)/vac/admin/courses/_components/vac-course-list.tsx`

### Lesson Components (2)
- `app/(routes)/vac/admin/courses/[courseId]/lessons/_components/lesson-form.tsx`
- `app/(routes)/vac/admin/courses/[courseId]/lessons/_components/lesson-preview.tsx`

## Modified Files — Developer Must UPDATE (1)

### `lib/sidebarMenuLink.ts`
- Added 12 VAC/CASE route permission mappings (lines 552-563)
- Added VAC menu group with submenu items (Learner + Admin sections)
- Added CASE Tracks admin link

## Database Changes (Not in Git)

All database changes were made directly on staging Supabase. For production, follow `04-MIGRATION-GUIDE.md`.

| Change Type | Count |
|-------------|-------|
| New tables | 12 |
| New views | 3 |
| New functions | 5 |
| New cron jobs | 1 |
| New columns on existing tables (profiles) | 1 |
| RLS policies | 17 |
| Seed data (courses, lessons, tracks, etc.) | ~3,000 rows |
