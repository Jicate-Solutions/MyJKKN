# VAC Module — Architecture

## 5-Layer Pattern

```
Types (types/vac.ts, types/case.ts)
  ↓
Services (lib/services/vac-service.ts, case-service.ts)
  ↓ Static class methods, Supabase client
Hooks (hooks/vac/use-vac.ts, hooks/case/use-case.ts)
  ↓ TanStack React Query wrappers
Components (app/(routes)/vac/_components/)
  ↓ Reusable UI pieces
Pages (app/(routes)/vac/**/page.tsx)
```

## Key Patterns

### Supabase Client (untyped)
```typescript
// Services use untyped client because VAC tables aren't in generated types
const getSupabase = (): any => createClientSupabaseClient();
```

### Service Layer (static class)
```typescript
export class VACService {
  static async getCourses(filters?: VACCourseFilters): Promise<VACCoursesResponse> {
    const supabase = getSupabase();
    // ...
  }
}
```

### React Query Hooks
```typescript
export function useVACCourses(filters?: VACCourseFilters) {
  return useQuery({
    queryKey: vacQueryKeys.courses(filters),
    queryFn: () => VACService.getCourses(filters),
  });
}
```

## Module Structure

### Learner-Facing Pages

| Route | Purpose |
|-------|---------|
| `/vac` | Course catalog with search, filters, recommendations |
| `/vac/[courseId]` | Course detail with lesson list (sequential gating) |
| `/vac/[courseId]/[lessonId]` | Lesson content with tiered exercises |
| `/vac/my-courses` | Enrolled courses + Professional Development tab |
| `/vac/case` | CASE Graduation Tracker (6 tracks, progress ring) |
| `/vac/case/placement/[trackId]` | Placement test before enrollment |
| `/vac/certificate/[enrollmentId]` | Certificate + Senior Learner endorsement |
| `/vac/progress` | Overall progress view |

### Admin Pages

| Route | Purpose |
|-------|---------|
| `/vac/admin` | Admin dashboard |
| `/vac/admin/courses` | Course CRUD |
| `/vac/admin/courses/new` | Create course (with Fink's editor, NSQF) |
| `/vac/admin/courses/[id]/edit` | Edit course |
| `/vac/admin/courses/[id]/lessons` | Lesson management |
| `/vac/admin/enrollments` | Enrollment management |
| `/vac/admin/analytics` | Analytics (4 tabs: Overview, CASE Tracks, Programmes, Trends) |
| `/vac/admin/case` | CASE admin (at-risk, stats) |
| `/vac/admin/case/tracks` | Track list admin |
| `/vac/admin/case/tracks/[id]/edit` | Track edit |
| `/vac/admin/case/batches` | Batch management |
| `/vac/admin/case/readiness` | Graduation readiness |
| `/vac/admin/settings` | Module settings |

## Data Flow

### Enrollment Flow
```
Learner → /vac → clicks course → /vac/[courseId] → Enroll Now
  → (if CASE track) → /vac/case/placement/[trackId] → take test
  → placement_score saved → redirect to course
  → Hour 1 (free preview) → Mark Complete → Hour 2 unlocks → ...
```

### CASE Graduation Flow
```
6 tracks × 30 hours = 180 hours mandatory
AI-1 → AI-2 → AI-3 → AI-4 (sequential)
H-1 → H-2 (sequential)
AI + Human parallel (Sem 1: AI-1+H-1, Sem 2: AI-2+H-2, etc.)
Triple gate per track: Attendance 75% + Grader 80% + Project
Auto-alerts: 90/60/30/25-day warnings via cron
```

## JKKN Framework Alignment

| Framework | Implementation |
|-----------|---------------|
| Learn-Then-Leverage | `ltl_phase` on each lesson: Week 1 = 'learn', Week 2-3 = 'leverage' |
| Triple-A | Week 1 = Acquire, Week 2 = Apply, Week 3 = Advance |
| Humans as Principals | AI-1 teaches Principal-Agent framework explicitly |
| NSQF/NHEQF/NCrF | `nsqf_level`, `nheqf_level`, `ncrf_credits` on each course |
| course_category | 'add_on' (AI tracks) vs 'value_add' (Human tracks) |
| Agency Index | `agency_index` + `agency_dimensions` on case_learner_progress |
| Fink's Taxonomy | `overall_finks_profile` JSONB on each course (6 dimensions, sum=100%) |
