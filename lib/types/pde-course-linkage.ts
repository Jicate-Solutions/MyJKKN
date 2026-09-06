// =============================================================================
// lib/types/pde-course-linkage.ts
// PDE Tier 4 — T4.2: types for course + lesson linkage aggregations.
// =============================================================================
//
// Companion file to lib/services/pde-course-linkage-service.ts. Kept narrow
// (per HARD NEGATIVE PERMISSIONS — do NOT touch lib/types/pde.ts or the
// PdeDemonstrationRow definition in pde-scoring-service.ts).
// =============================================================================

import type { PdeDemonstrationRow } from '@/lib/services/pde-scoring-service';

/** A demonstration row joined with its course + lesson linkage. */
export type LinkedDemonstration = PdeDemonstrationRow & {
  course_id: string | null;
  lesson_id: string | null;
};

/** Result shape for "demos under this course" aggregation. */
export type DemonstrationsByCourseResult = {
  course_id: string;
  total: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  samples: LinkedDemonstration[];
};

/** Result shape for "demos under this lesson" aggregation. */
export type DemonstrationsByLessonResult = {
  lesson_id: string;
  total: number;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  samples: LinkedDemonstration[];
};

/** Input for linking (or unlinking) a demo to a course/lesson. */
export type LinkDemonstrationInput = {
  demonstrationId: string;
  courseId: string | null;
  lessonId?: string | null;
};
