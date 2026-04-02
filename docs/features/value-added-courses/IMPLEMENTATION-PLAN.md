# VAC Module — Implementation Plan

**Created:** 2026-04-02
**Author:** Boobalan + Claude
**Module:** Value-Added Courses (VAC) + CASE Graduation Tracker
**Estimated Files:** 49 new + 1 modified + SQL updates
**Source Docs:** `docs/features/value-added-courses/`

---

## Pre-Implementation Checklist

- [ ] All 6 handoff docs read and understood
- [ ] Flow diagrams reviewed (`vac-flow-diagram.html`)
- [ ] Production Supabase access confirmed (`kvizhngldtiuufknvehv`)
- [ ] Devil's advocate risks acknowledged (RLS audit, schema fix, typed client)

---

## Phase 1: Database Foundation

**Goal:** Create all 13 tables, 3 views, 5 functions, triggers, RLS policies, and cron job.

### 1.1 Add Tables to `supabase/setup/01_tables.sql`

**Where:** Before the `-- END OF TABLE DEFINITIONS` comment (line ~2898)

**Tables to add (in order — FK dependencies matter):**

```
1. vac_courses          (refs: institutions, programs)
2. vac_lessons          (refs: vac_courses)
3. vac_enrollments      (refs: vac_courses, profiles via user_id)
4. vac_learner_progress (refs: vac_courses, vac_lessons)
5. vac_course_programmes (refs: vac_courses, programs)
6. case_tracks          (self-ref: prerequisite_track_id)
7. case_track_courses   (refs: case_tracks, vac_courses, programs, institutions)
8. case_track_enrollments (refs: case_tracks, vac_courses, case_track_enrollments self-ref)
9. case_batches         (refs: case_tracks, institutions)
10. case_learner_progress (refs: programs, institutions)
11. case_alerts          (refs: profiles)
12. case_graduation_requirements (refs: programs, institutions)
```

**Critical fix from Devil's Advocate:**
- `case_learner_progress`: Change `user_id UUID UNIQUE NOT NULL` to add composite unique:
  ```sql
  UNIQUE(user_id, programme_id)  -- NOT just UNIQUE(user_id)
  ```
  A student can be in multiple programmes.

**Also add:**
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS programme_id UUID REFERENCES programs(id);`
- `CREATE INDEX IF NOT EXISTS idx_profiles_programme ON profiles(programme_id);`

### 1.2 Add RLS Policies to `supabase/setup/03_policies.sql`

**Pattern to follow** (from existing codebase):
```sql
-- SELECT: institution-scoped + super_admin bypass
CREATE POLICY "vac_courses_select" ON vac_courses
  FOR SELECT USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid() AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- INSERT/UPDATE: institution admin
-- DELETE: super_admin or creator only
-- Enrollments/progress: own-data (user_id = auth.uid())
```

**Policies needed (17 total):**

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| vac_courses | institution-scoped | admin | admin | super_admin |
| vac_lessons | institution-scoped (via course) | admin | admin | admin |
| vac_enrollments | own-data (user_id = auth.uid()) + admin | authenticated | own + admin | admin |
| vac_learner_progress | own-data + admin | authenticated | own + admin | admin |
| vac_course_programmes | institution-scoped (via course) | admin | admin | admin |
| case_tracks | all authenticated (public catalog) | admin | admin | super_admin |
| case_track_courses | institution-scoped | admin | admin | admin |
| case_track_enrollments | own-data + admin | authenticated | own + admin | admin |
| case_batches | institution-scoped | admin | admin | admin |
| case_learner_progress | own-data + admin | authenticated | own + admin | admin |
| case_alerts | own-data (user_id) + coordinator | system | read_at update only | admin |
| case_graduation_reqs | institution-scoped | admin | admin | super_admin |

### 1.3 Add Triggers to `supabase/setup/04_triggers.sql`

```sql
-- Timestamp triggers (use existing handle_updated_at function)
CREATE TRIGGER update_vac_courses_updated_at
  BEFORE UPDATE ON vac_courses
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Same for: vac_lessons, vac_enrollments, vac_learner_progress,
-- case_tracks, case_track_enrollments, case_batches,
-- case_learner_progress, case_graduation_requirements

-- Business logic triggers:
-- 1. check_case_track_prerequisite() — BEFORE INSERT on case_track_enrollments
-- 2. update_case_learner_progress() — AFTER UPDATE on case_track_enrollments
```

### 1.4 Add Functions to `supabase/setup/02_functions.sql`

```
1. process_case_alerts()           — Daily cron: risk calc + alert generation
2. check_case_track_prerequisite() — Trigger: validate prerequisite track done
3. update_case_learner_progress()  — Trigger: update progress on track completion
4. get_vac_course_enrollment_stats() — Analytics: enrollment counts per course
5. is_enrolled_in_vac_course()     — Helper: check if user enrolled in course
```

### 1.5 Add Views to `supabase/setup/05_views.sql`

```
1. vac_enrollments_with_details  — Enrollments JOIN courses + profiles
2. case_risk_calculator          — Risk level computation per learner
3. case_graduation_readiness     — Institution-wide graduation stats
```

### 1.6 Create Migration File

**File:** `supabase/migrations/20260402_vac_case_module.sql`
- Complete migration script combining all above
- Apply via Supabase MCP `apply_migration` tool

### 1.7 Cron Job

```sql
SELECT cron.schedule('case-daily-alerts', '30 1 * * *', 'SELECT process_case_alerts();');
-- 30 1 = 1:30 AM UTC = 7:00 AM IST
```

### Phase 1 Verification

```sql
-- Run after migration:
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'vac_%') as vac_tables,
  (SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'case_%') as case_tables,
  (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'vac_%' OR tablename LIKE 'case_%') as policies;
-- Expected: 5 vac tables, 7 case tables, 17+ policies
```

---

## Phase 2: TypeScript Types

**Goal:** Define all type interfaces matching the database schema.

### 2.1 Create `types/vac.ts`

**Pattern** (from `types/admission.ts`): Union types for enums, interfaces for entities, separate filter/response types.

```typescript
// === ENUMS ===
export type VACCourseCategory = 'add_on' | 'value_add';
export type VACCourseTrack = 'AI-1' | 'AI-2' | 'AI-3' | 'AI-4' | 'H-1' | 'H-2' | 'general';
export type VACEnrollmentStatus = 'active' | 'completed' | 'cancelled' | 'expired';
export type VACPaymentStatus = 'pending' | 'paid' | 'waived' | 'refunded';
export type VACLessonStatus = 'not_started' | 'in_progress' | 'completed' | 'tested_out';
export type LTLPhase = 'learn' | 'leverage' | 'both';

// === FINK'S TAXONOMY ===
export interface FinksProfile {
  foundational_knowledge: number;
  application: number;
  integration: number;
  human_dimension: number;
  caring: number;
  learning_how_to_learn: number;
}

// === ENTITIES ===
export interface VACCourse { ... }       // Maps to vac_courses
export interface VACLesson { ... }       // Maps to vac_lessons
export interface VACEnrollment { ... }   // Maps to vac_enrollments
export interface VACLearnerProgress { ... } // Maps to vac_learner_progress
export interface VACCourseProgramme { ... } // Maps to vac_course_programmes

// === FILTERS ===
export interface VACCourseFilters {
  institution_id?: string;
  track?: VACCourseTrack;
  course_category?: VACCourseCategory;
  search?: string;
  is_active?: boolean;
  faculty_eligible?: boolean;
  programme_id?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// === RESPONSES ===
export interface VACCoursesResponse {
  data: VACCourse[];
  metadata: { total: number; totalPages: number; page: number; };
}

// === DTOs ===
export interface CreateVACCourseInput { ... }
export interface UpdateVACCourseInput extends Partial<CreateVACCourseInput> {}
```

### 2.2 Create `types/case.ts`

```typescript
// === ENUMS ===
export type CASETrackType = 'ai_mastery' | 'human_excellence';
export type CASETrackEnrollmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'incomplete' | 'retry';
export type CASERiskLevel = 'on_track' | 'at_risk' | 'critical' | 'overdue' | 'completed';
export type CASEBatchStatus = 'planned' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type CASEDeliveryFormat = 'spread' | 'moderate' | 'intensive';

// === ENTITIES ===
export interface CASETrack { ... }
export interface CASETrackEnrollment { ... }
export interface CASEBatch { ... }
export interface CASELearnerProgress { ... }
export interface CASEAlert { ... }
export interface CASEGraduationRequirement { ... }

// === AGENCY INDEX ===
export interface AgencyDimensions {
  critical_thinking: number;
  problem_solving: number;
  creativity: number;
  collaboration: number;
  communication: number;
  digital_literacy: number;
}
```

### Phase 2 Verification

```bash
npx tsc --noEmit types/vac.ts types/case.ts
# Should pass with 0 errors
```

---

## Phase 3: Service Layer

**Goal:** Build VACService and CASEService with typed Supabase client.

### 3.1 Create `lib/services/vac/vac-service.ts` (~1000 lines)

**Pattern** (from `lib/services/admission/expo-service.ts`):
- Static class with `createClientSupabaseClient()`
- Sortable column allowlists
- Error handling with specific Supabase error codes

**Key methods:**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';

export class VACService {
  private static supabase = createClientSupabaseClient();

  // === COURSES ===
  static async getCourses(filters?: VACCourseFilters): Promise<VACCoursesResponse>
  static async getCourseById(id: string): Promise<VACCourse | null>
  static async createCourse(input: CreateVACCourseInput): Promise<VACCourse>
  static async updateCourse(id: string, input: UpdateVACCourseInput): Promise<VACCourse>
  static async deleteCourse(id: string): Promise<void>

  // === LESSONS ===
  static async getLessonsByCourse(courseId: string): Promise<VACLesson[]>
  static async getLessonById(id: string): Promise<VACLesson | null>
  static async createLesson(input: CreateVACLessonInput): Promise<VACLesson>
  static async updateLesson(id: string, input: UpdateVACLessonInput): Promise<VACLesson>
  static async deleteLesson(id: string): Promise<void>

  // === ENROLLMENTS ===
  static async enrollInCourse(userId: string, courseId: string): Promise<VACEnrollment>
  static async getMyEnrollments(userId: string): Promise<VACEnrollmentWithDetails[]>
  static async getEnrollmentsByCourse(courseId: string, filters?): Promise<VACEnrollmentsResponse>
  static async updateEnrollmentStatus(id: string, status: VACEnrollmentStatus): Promise<void>
  static async isEnrolled(userId: string, courseId: string): Promise<boolean>

  // === PROGRESS ===
  static async getProgress(userId: string, courseId: string): Promise<VACLearnerProgress[]>
  static async markLessonComplete(userId: string, courseId: string, lessonId: string, score?: number): Promise<void>
  static async getCourseCompletionPercentage(userId: string, courseId: string): Promise<number>

  // === RECOMMENDATIONS ===
  static async getRecommendedCourses(programmeId: string): Promise<VACCourse[]>

  // === ANALYTICS (Admin) ===
  static async getCourseEnrollmentStats(institutionId: string): Promise<CourseEnrollmentStats[]>
  static async getOverviewStats(institutionId: string): Promise<OverviewStats>

  // === PROGRAMME MAPPING ===
  static async getCourseProgrammes(courseId: string): Promise<VACCourseProgramme[]>
  static async updateCourseProgrammes(courseId: string, programmeIds: string[]): Promise<void>
}
```

**N+1 prevention** — use PostgREST joins:
```typescript
// GOOD: Single query with join
const { data } = await this.supabase
  .from('vac_enrollments')
  .select('*, vac_courses(name, code, track, fee, duration_hours)')
  .eq('user_id', userId);

// BAD: N+1 loop
// enrollments.forEach(e => getCourse(e.course_id)) // NEVER DO THIS
```

### 3.2 Create `lib/services/vac/case-service.ts` (~400 lines)

```typescript
export class CASEService {
  private static supabase = createClientSupabaseClient();

  // === TRACKS ===
  static async getTracks(): Promise<CASETrack[]>
  static async getTrackById(id: string): Promise<CASETrack | null>
  static async updateTrack(id: string, input: UpdateCASETrackInput): Promise<CASETrack>

  // === TRACK ENROLLMENTS ===
  static async enrollInTrack(userId: string, trackId: string, placementScore?: number): Promise<CASETrackEnrollment>
  static async getMyTrackEnrollments(userId: string): Promise<CASETrackEnrollment[]>
  static async updateTrackEnrollment(id: string, input: Partial<CASETrackEnrollment>): Promise<void>
  static async checkPrerequisite(userId: string, trackId: string): Promise<{ allowed: boolean; reason?: string }>

  // === PLACEMENT ===
  static async submitPlacement(userId: string, trackId: string, score: number): Promise<{ startWeek: number }>

  // === GRADUATION ===
  static async getLearnerProgress(userId: string): Promise<CASELearnerProgress | null>
  static async getGraduationReadiness(institutionId: string): Promise<GraduationReadinessStats>
  static async getAtRiskLearners(institutionId: string): Promise<AtRiskLearner[]>

  // === BATCHES ===
  static async getBatches(filters?: CASEBatchFilters): Promise<CASEBatch[]>
  static async createBatch(input: CreateCASEBatchInput): Promise<CASEBatch>
  static async updateBatch(id: string, input: UpdateCASEBatchInput): Promise<CASEBatch>

  // === ALERTS ===
  static async getAlerts(userId: string): Promise<CASEAlert[]>
  static async markAlertRead(alertId: string): Promise<void>

  // === ANALYTICS ===
  static async getTrackCompletionStats(institutionId: string): Promise<TrackCompletionStats[]>
  static async getRiskDistribution(institutionId: string): Promise<RiskDistribution>
}
```

### 3.3 Create `lib/data/case-placement-questions.ts`

50 placement test questions (10 per track area), structured as:
```typescript
export interface PlacementQuestion {
  id: string;
  trackCode: string; // 'AI-1', 'AI-2', etc.
  question: string;
  options: { label: string; value: string }[];
  correctAnswer: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  // 10 questions for AI-1, 10 for AI-2, etc.
];
```

### Phase 3 Verification

```bash
npx tsc --noEmit lib/services/vac/vac-service.ts lib/services/vac/case-service.ts
# Should pass with 0 errors
```

---

## Phase 4: React Query Hooks

**Goal:** Create query/mutation hooks wrapping services.

### 4.1 Create `hooks/vac/use-vac.ts` (~900 lines)

**Pattern** (from `hooks/admission/use-auto-trigger.ts`):

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VACService } from '@/lib/services/vac/vac-service';
import toast from 'react-hot-toast';

// === QUERY KEYS ===
export const vacKeys = {
  all: ['vac'] as const,
  courses: (filters?: VACCourseFilters) => [...vacKeys.all, 'courses', filters] as const,
  course: (id: string) => [...vacKeys.all, 'course', id] as const,
  lessons: (courseId: string) => [...vacKeys.all, 'lessons', courseId] as const,
  lesson: (id: string) => [...vacKeys.all, 'lesson', id] as const,
  enrollments: (userId: string) => [...vacKeys.all, 'enrollments', userId] as const,
  progress: (userId: string, courseId: string) => [...vacKeys.all, 'progress', userId, courseId] as const,
  recommended: (programmeId: string) => [...vacKeys.all, 'recommended', programmeId] as const,
  stats: (institutionId: string) => [...vacKeys.all, 'stats', institutionId] as const,
};

// === COURSE HOOKS ===
export function useVACCourses(filters?: VACCourseFilters) {
  return useQuery({
    queryKey: vacKeys.courses(filters),
    queryFn: () => VACService.getCourses(filters),
    staleTime: 5 * 60 * 1000, // 5 min (catalog rarely changes)
  });
}

export function useVACCourse(id: string) {
  return useQuery({
    queryKey: vacKeys.course(id),
    queryFn: () => VACService.getCourseById(id),
    enabled: !!id,
  });
}

export function useCreateVACCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVACCourseInput) => VACService.createCourse(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vacKeys.all });
      toast.success('Course created successfully');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create course'),
  });
}

// ... 25+ more hooks for:
// useUpdateVACCourse, useDeleteVACCourse
// useVACLessons, useVACLesson, useCreateVACLesson, useUpdateVACLesson
// useEnrollInCourse, useMyEnrollments, useIsEnrolled
// useVACProgress, useMarkLessonComplete
// useRecommendedCourses
// useVACOverviewStats, useCourseEnrollmentStats
// useCourseProgrammes, useUpdateCourseProgrammes
```

### 4.2 Create `hooks/vac/use-case.ts` (~300 lines)

```typescript
export const caseKeys = {
  all: ['case'] as const,
  tracks: () => [...caseKeys.all, 'tracks'] as const,
  track: (id: string) => [...caseKeys.all, 'track', id] as const,
  trackEnrollments: (userId: string) => [...caseKeys.all, 'track-enrollments', userId] as const,
  learnerProgress: (userId: string) => [...caseKeys.all, 'learner-progress', userId] as const,
  batches: (filters?) => [...caseKeys.all, 'batches', filters] as const,
  alerts: (userId: string) => [...caseKeys.all, 'alerts', userId] as const,
  graduationReadiness: (instId: string) => [...caseKeys.all, 'graduation', instId] as const,
  atRisk: (instId: string) => [...caseKeys.all, 'at-risk', instId] as const,
  riskDistribution: (instId: string) => [...caseKeys.all, 'risk-dist', instId] as const,
};

// === TRACK HOOKS ===
export function useCASETracks() { ... }
export function useCASETrack(id: string) { ... }

// === ENROLLMENT HOOKS ===
export function useEnrollInTrack() { ... }
export function useMyTrackEnrollments(userId: string) { ... }
export function useSubmitPlacement() { ... }

// === PROGRESS HOOKS ===
export function useCASELearnerProgress(userId: string) { ... }
export function useGraduationReadiness(institutionId: string) { ... }
export function useAtRiskLearners(institutionId: string) { ... }

// === BATCH HOOKS ===
export function useCASEBatches(filters?) { ... }
export function useCreateCASEBatch() { ... }

// === ALERT HOOKS ===
export function useCASEAlerts(userId: string) { ... }
export function useMarkAlertRead() { ... }

// === ANALYTICS ===
export function useTrackCompletionStats(institutionId: string) { ... }
```

### Phase 4 Verification

```bash
npx tsc --noEmit hooks/vac/use-vac.ts hooks/vac/use-case.ts
# Should pass with 0 errors
```

---

## Phase 5: Learner Pages & Components (8 pages + 9 components)

**Goal:** Build the student-facing experience.

### 5.1 Components (create first — pages depend on these)

| File | Purpose | Key Props |
|------|---------|-----------|
| `app/(routes)/vac/_components/course-filters.tsx` | Filter sidebar | filters, onFilterChange |
| `app/(routes)/vac/_components/recommended-courses.tsx` | Programme recs | programmeId |
| `app/(routes)/vac/_components/enroll-button.tsx` | Enrollment CTA | courseId, fee, isEnrolled |
| `app/(routes)/vac/_components/enrollment-gate.tsx` | Content lock overlay | courseId |
| `app/(routes)/vac/_components/finks-profile.tsx` | Radar/bar chart of 6 dims | profile: FinksProfile |
| `app/(routes)/vac/_components/progress-bar.tsx` | Course progress % | completed, total |
| `app/(routes)/vac/case/_components/progress-overview.tsx` | CASE progress ring | tracksCompleted, totalHours |
| `app/(routes)/vac/case/_components/risk-banner.tsx` | Risk level display | riskLevel: CASERiskLevel |
| `app/(routes)/vac/case/_components/track-card.tsx` | Individual track card | track, enrollment, gates |

### 5.2 Pages

| # | Route | File | Type | Key Features |
|---|-------|------|------|-------------|
| 1 | `/vac` | `app/(routes)/vac/page.tsx` | Server | Course grid + filters + recommendations |
| 2 | `/vac/[courseId]` | `app/(routes)/vac/[courseId]/page.tsx` | Client | Course detail + lesson list + enroll button |
| 3 | `/vac/[courseId]/[lessonId]` | `app/(routes)/vac/[courseId]/[lessonId]/page.tsx` | Client | Lesson content + exercises + mark complete |
| 4 | `/vac/my-courses` | `app/(routes)/vac/my-courses/page.tsx` | Client | Enrolled courses + Professional Dev tab |
| 5 | `/vac/progress` | `app/(routes)/vac/progress/page.tsx` | Client | Overall progress view |
| 6 | `/vac/case` | `app/(routes)/vac/case/page.tsx` | Client | 6-track dashboard + progress ring |
| 7 | `/vac/case/placement/[trackId]` | `app/(routes)/vac/case/placement/[trackId]/page.tsx` | Client | 10-question test + scoring |
| 8 | `/vac/certificate/[enrollmentId]` | `app/(routes)/vac/certificate/[enrollmentId]/page.tsx` | Client | Certificate + PDF download + QR |

**Page structure pattern** (from codebase):
```tsx
// Server page:
<PermissionGuard module='vac.courses' action='view'>
  <ContentLayout title='Value Added Courses'>
    <Breadcrumb>...</Breadcrumb>
    <div className='space-y-6'>
      <CourseFilters />
      <CourseGrid />
    </div>
  </ContentLayout>
</PermissionGuard>

// Client page:
'use client';
// usePermissions, useRouter, useVACCourse, etc.
```

### Phase 5 Verification

- Navigate to `/vac` — course catalog loads with filters
- Click course → detail page with lesson list
- Hour 1 accessible without enrollment
- Hour 2+ shows enrollment gate
- `/vac/case` shows 6 track cards
- Placement test flow works end-to-end

---

## Phase 6: Admin Pages & Components (15 pages + 10 components)

**Goal:** Build the admin management experience.

### 6.1 Admin Components

| File | Purpose |
|------|---------|
| `app/(routes)/vac/admin/courses/_components/vac-course-form.tsx` | Course create/edit form with Fink's editor |
| `app/(routes)/vac/admin/courses/_components/vac-course-filters.tsx` | Admin course filters |
| `app/(routes)/vac/admin/courses/_components/vac-course-list.tsx` | DataTable for courses |
| `app/(routes)/vac/admin/courses/[courseId]/lessons/_components/lesson-form.tsx` | Lesson editor (JSONB fields) |
| `app/(routes)/vac/admin/courses/[courseId]/lessons/_components/lesson-preview.tsx` | Lesson content preview |
| `app/(routes)/vac/admin/case/_components/at-risk-table.tsx` | At-risk learners DataTable |
| `app/(routes)/vac/admin/case/_components/stats-cards.tsx` | CASE stats overview |
| `app/(routes)/vac/admin/case/batches/_components/batch-form.tsx` | Batch create/edit |
| `app/(routes)/vac/admin/case/batches/_components/batch-list.tsx` | Batch DataTable |
| `app/(routes)/vac/admin/case/readiness/_components/readiness-chart.tsx` | Graduation readiness chart |

### 6.2 Admin Pages

| # | Route | Purpose |
|---|-------|---------|
| 1 | `/vac/admin` | Dashboard with stats cards |
| 2 | `/vac/admin/courses` | Course list (DataTable) |
| 3 | `/vac/admin/courses/new` | Create course (form) |
| 4 | `/vac/admin/courses/[courseId]/edit` | Edit course |
| 5 | `/vac/admin/courses/[courseId]/lessons` | Lesson list by week |
| 6 | `/vac/admin/courses/[courseId]/lessons/new` | Create lesson |
| 7 | `/vac/admin/courses/[courseId]/lessons/[lessonId]/edit` | Edit lesson |
| 8 | `/vac/admin/enrollments` | Enrollment management |
| 9 | `/vac/admin/analytics` | 4-tab analytics dashboard |
| 10 | `/vac/admin/settings` | Module settings |
| 11 | `/vac/admin/case` | CASE admin dashboard |
| 12 | `/vac/admin/case/tracks` | Track list |
| 13 | `/vac/admin/case/tracks/[trackId]/edit` | Track edit |
| 14 | `/vac/admin/case/batches` | Batch management |
| 15 | `/vac/admin/case/readiness` | Graduation readiness |

**Form pattern** (from codebase): React Hook Form + Zod + shadcn Form components

**DataTable pattern** (from codebase): Reusable `<DataTable>` with `fetchDataFn`, `getColumns`, `config`

### Phase 6 Verification

- `/vac/admin` loads with correct stats
- Create course → appears in list
- Edit course → changes persist
- Add lessons to course (30 hours)
- Enrollment admin: approve, cancel, waive fee
- Analytics: all 4 tabs render with charts
- CASE admin: at-risk table, track management, batch CRUD

---

## Phase 7: Sidebar, Permissions & Navigation

**Goal:** Wire up sidebar menu and permission guards.

### 7.1 Update `lib/sidebarMenuLink.ts`

**Add to MENU_PERMISSIONS object:**
```typescript
// VAC Module
'/vac': 'vac.courses.view',
'/vac/my-courses': 'vac.my_courses.view',
'/vac/case': 'vac.case.view',
'/vac/progress': 'vac.progress.view',
'/vac/admin': 'vac.admin.view',
'/vac/admin/courses': 'vac.admin.courses.view',
'/vac/admin/courses/new': 'vac.admin.courses.create',
'/vac/admin/enrollments': 'vac.admin.enrollments.view',
'/vac/admin/analytics': 'vac.admin.analytics.view',
'/vac/admin/case': 'vac.admin.case.view',
'/vac/admin/case/tracks': 'vac.admin.case.tracks.view',
'/vac/admin/settings': 'vac.admin.settings.view',
```

**Add new menu group** (after the last existing group):
```typescript
{
  groupLabel: 'Value Added Courses',
  menus: [
    {
      href: '/vac',
      label: 'Course Catalog',
      active: pathname === '/vac',
      icon: BookOpen,
      submenus: []
    },
    {
      href: '/vac/my-courses',
      label: 'My Courses',
      active: pathname.startsWith('/vac/my-courses'),
      icon: GraduationCap,
      submenus: []
    },
    {
      href: '/vac/case',
      label: 'CASE Tracker',
      active: pathname.startsWith('/vac/case') && !pathname.includes('admin'),
      icon: Target,
      submenus: []
    },
    {
      href: '/vac/admin',
      label: 'VAC Admin',
      active: pathname.startsWith('/vac/admin'),
      icon: Settings,
      submenus: [
        { href: '/vac/admin/courses', label: 'Courses', active: pathname.startsWith('/vac/admin/courses') },
        { href: '/vac/admin/enrollments', label: 'Enrollments', active: pathname.startsWith('/vac/admin/enrollments') },
        { href: '/vac/admin/analytics', label: 'Analytics', active: pathname.startsWith('/vac/admin/analytics') },
        { href: '/vac/admin/case', label: 'CASE Admin', active: pathname.startsWith('/vac/admin/case') },
        { href: '/vac/admin/settings', label: 'Settings', active: pathname.startsWith('/vac/admin/settings') },
      ]
    },
  ]
},
```

### Phase 7 Verification

- Sidebar shows "Value Added Courses" group
- Learner roles see: Catalog, My Courses, CASE Tracker
- Admin roles see: VAC Admin with all sub-items
- PermissionGuard blocks unauthorized access
- All routes navigable from sidebar

---

## Phase 8: Build & Deploy Verification

### 8.1 TypeScript Compilation

```bash
npm run build
# Must pass with 0 errors
```

### 8.2 Route Verification Checklist

| Route | Expected Behavior |
|-------|------------------|
| `/vac` | Course catalog with search + filters |
| `/vac/[courseId]` | Course detail with lesson list |
| `/vac/[courseId]/[lessonId]` | Lesson content (Hour 1 free) |
| `/vac/my-courses` | Enrolled courses list |
| `/vac/case` | 6-track CASE dashboard |
| `/vac/case/placement/[trackId]` | 10-question placement test |
| `/vac/certificate/[enrollmentId]` | Certificate with PDF download |
| `/vac/admin` | Admin dashboard with stats |
| `/vac/admin/courses` | Course DataTable |
| `/vac/admin/courses/new` | Create course form |
| `/vac/admin/enrollments` | Enrollment management |
| `/vac/admin/analytics` | 4-tab analytics |
| `/vac/admin/case/tracks` | Track management |
| `/vac/admin/case/batches` | Batch management |

### 8.3 E2E Flow Test

1. Admin creates course → visible in catalog
2. Learner enrolls → bill generated (or waived)
3. Learner completes Hour 1-30 sequentially
4. Enrollment status → completed
5. Certificate accessible with PDF download
6. CASE: placement test → track enrollment → triple gate check
7. Cron: risk alerts generated for at-risk learners

### 8.4 Security Verification

```sql
-- Test as student: should only see own enrollments
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "student-uuid-here"}';
SELECT * FROM vac_enrollments; -- should return only own rows
SELECT * FROM case_alerts; -- should return only own alerts
```

---

## File Count Summary

| Category | Count |
|----------|-------|
| Types | 2 (`types/vac.ts`, `types/case.ts`) |
| Services | 2 (`lib/services/vac/vac-service.ts`, `case-service.ts`) |
| Data | 1 (`lib/data/case-placement-questions.ts`) |
| Hooks | 2 (`hooks/vac/use-vac.ts`, `use-case.ts`) |
| Learner Pages | 8 |
| Learner Components | 9 |
| Admin Pages | 15 |
| Admin Components | 10 |
| Sidebar (modified) | 1 (`lib/sidebarMenuLink.ts`) |
| SQL (setup files) | 4 modified (`01_tables`, `02_functions`, `03_policies`, `04_triggers`, `05_views`) |
| SQL (migration) | 1 new (`20260402_vac_case_module.sql`) |
| **TOTAL** | **49 new + 1 modified + SQL updates** |

---

## Risk Mitigation Checklist

- [ ] `case_learner_progress` UNIQUE fixed to `(user_id, programme_id)`
- [ ] All services use typed Supabase client (NOT `any`)
- [ ] N+1 queries prevented with PostgREST joins
- [ ] RLS policies cover all 12 tables with institution scoping
- [ ] Enrollment → billing integration tested
- [ ] Attendance → triple gate calculation verified
- [ ] Cron job `process_case_alerts()` tested manually first
- [ ] `npm run build` passes with 0 errors
