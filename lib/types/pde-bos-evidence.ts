// =============================================================================
// lib/types/pde-bos-evidence.ts
// PDE Tier 4 — T4.3 — types for the BoS-keyed PDE evidence surface.
// =============================================================================
//
// This is a read-only consumer layer: it joins existing `bos_course_reviews`
// (BoS module, owned by a separate workstream) with existing `pde_demonstrations`
// (PDE substrate, this module). No schema changes. No writes. RLS handles authz.
//
// Linkage strategy
// ----------------
// `pde_demonstrations` does NOT currently have a `course_id` FK. The honest
// linkage available today is at the `institution_id` level. We surface the
// review's course context (code/name/action/regulation) alongside the demos
// captured for that institution, grouped by PDE category. When/if a `course_id`
// column is added to pde_demonstrations later, this layer can tighten the join
// without changing the public shape.
// =============================================================================

import type {
  PDECategoryKey,
  PDEDemonstrationStatus,
} from '@/lib/types/pde-demonstrations';

/** Mirror of `bos_course_reviews` row. Loose typing — BoS schema may evolve. */
export interface BosCourseReview {
  id: string;
  institution_id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  course_id: string | null; // COE-API ref; no local FK
  course_code: string;
  course_name: string;
  review_action:
    | 'approved'
    | 'approved_with_changes'
    | 'rejected'
    | 'deferred'
    | 'noted';
  changes_suggested: string | null;
  remarks: string | null;
  regulation_code: string | null;
  created_at: string;
  updated_at: string;
}

/** Minimal demonstration row surfaced per-review. */
export interface PdeEvidenceDemonstration {
  id: string;
  category_key: PDECategoryKey;
  skill_name: string | null;
  status: PDEDemonstrationStatus;
  weighted_score: number | null;
  created_at: string;
}

/** Slim syllabus pointer; PO mappings exposed for accreditation tie-back. */
export interface BosSyllabusLink {
  id: string;
  course_code: string;
  course_name: string;
  po_mappings: unknown | null;
}

/** Per-review aggregation result. */
export interface PdeBosEvidence {
  review: BosCourseReview;
  demonstrations: PdeEvidenceDemonstration[];
  demonstrations_by_category: Partial<Record<PDECategoryKey, number>>;
  syllabus_link: BosSyllabusLink | null;
}

/** Row shape for the list view. */
export interface BosReviewWithDemoCount {
  review: BosCourseReview;
  demo_count: number;
}
