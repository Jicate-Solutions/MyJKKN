'use server';

/**
 * Learner edit/resubmit server actions (#9b).
 *
 * When a validator returns a demonstration with decision='changes_requested',
 * the row is set back to 'draft'. The learner re-opens the existing
 * new-demonstration form in edit mode (/pde/learn/demonstrations/new?edit=<id>),
 * fixes it, and saves — which calls one of these actions instead of the POST
 * /api/pde/demonstrations create path.
 *
 * Why a server action (not the API route): the create/list REST surface lives
 * at /api/pde/demonstrations and is out of this feature's edit scope. A
 * colocated server action keeps the edit path inside the learner demonstrations
 * subtree, adds no new HTTP route, and reuses the SSR PDEDemonstrationService
 * (RLS-bound to the owning learner via pde_demonstrations_learner_own).
 *
 * Validation mirrors the POST route (category whitelist, dual-lane curriculum
 * rules, CLO cap) so the edit path can't write a shape the create path would
 * have rejected.
 */

import { createClient } from '@/lib/supabase/server';
import { PDEDemonstrationService } from '@/lib/services/pde-demonstration-service';
import { getCloTagCap, normalizeCloRefs } from '@/lib/services/pde-curriculum-service';
import type {
  PDECategoryKey,
  PDEDemonstration,
  PDEDemonstrationEvidence,
} from '@/lib/types/pde-demonstrations';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CATEGORIES: PDECategoryKey[] = [
  'judgment',
  'embodied',
  'problem_finding',
  'accountability',
  'social_leadership',
  'cultural_civic',
  'credential',
];

export interface EditDemonstrationInput {
  id: string;
  category_key?: PDECategoryKey;
  rubric_policy_key?: string | null;
  skill_name?: string | null;
  evidence?: PDEDemonstrationEvidence;
  evidence_type?: string | null;
  bos_syllabus_id?: string | null;
  vac_course_id?: string | null;
  clo_refs?: number[] | null;
  /** When true, the row is promoted draft -> submitted after the edit lands. */
  submit?: boolean;
}

export type EditDemonstrationResult =
  | { ok: true; data: PDEDemonstration }
  | { ok: false; error: string };

/**
 * Fetch a single demonstration the current learner owns, for prefilling the
 * edit form. RLS restricts the read to the owner (or institution reviewers, who
 * never hit this action). Returns null if not found / not visible.
 */
export async function getMyDemonstrationForEdit(
  id: string
): Promise<PDEDemonstration | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const row = await PDEDemonstrationService.getById(id);
  // Only the owning learner may edit. Reviewers can READ via RLS but must not
  // edit through this learner-facing action.
  if (!row || row.learner_id !== user.id) return null;
  return row;
}

/**
 * Edit a draft demonstration, optionally resubmitting it for review.
 * Only drafts are editable (enforced again at the service layer + by RLS).
 */
export async function editDemonstration(
  input: EditDemonstrationInput
): Promise<EditDemonstrationResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    if (!UUID_RE.test(input.id)) {
      return { ok: false, error: 'Invalid demonstration id' };
    }

    // Ownership + draft gate (defense in depth — the service + RLS also enforce).
    const existing = await PDEDemonstrationService.getById(input.id);
    if (!existing || existing.learner_id !== user.id) {
      return { ok: false, error: 'Demonstration not found' };
    }
    if (existing.status !== 'draft') {
      return {
        ok: false,
        error: 'Only a draft demonstration can be edited. This one has already been submitted.',
      };
    }

    if (input.category_key && !VALID_CATEGORIES.includes(input.category_key)) {
      return {
        ok: false,
        error: `category_key must be one of: ${VALID_CATEGORIES.join(', ')}`,
      };
    }

    // --- Curriculum connector validation (dual-lane, mirrors the POST route) ---
    const bosSyllabusId = input.bos_syllabus_id ?? null;
    const vacCourseId = input.vac_course_id ?? null;
    if (bosSyllabusId && !UUID_RE.test(bosSyllabusId)) {
      return { ok: false, error: 'bos_syllabus_id must be a uuid' };
    }
    if (vacCourseId && !UUID_RE.test(vacCourseId)) {
      return { ok: false, error: 'vac_course_id must be a uuid' };
    }
    if (bosSyllabusId && vacCourseId) {
      return { ok: false, error: 'Link either a BoS syllabus or a VAC course, not both' };
    }

    let cloRefs: number[] | null = null;
    if (input.clo_refs !== undefined && input.clo_refs !== null) {
      if (!bosSyllabusId) {
        return { ok: false, error: 'clo_refs requires bos_syllabus_id' };
      }
      cloRefs = normalizeCloRefs(input.clo_refs);
      const cap = await getCloTagCap();
      if (cloRefs.length > cap) {
        return {
          ok: false,
          error: `You can tag at most ${cap} CLO${cap === 1 ? '' : 's'} per demonstration`,
        };
      }
      if (cloRefs.length === 0) cloRefs = null;
    }

    const updated = await PDEDemonstrationService.update(input.id, {
      category_key: input.category_key,
      rubric_policy_key: input.rubric_policy_key ?? null,
      skill_name: input.skill_name ?? null,
      evidence: input.evidence ?? {},
      evidence_type: input.evidence_type ?? null,
      bos_syllabus_id: bosSyllabusId,
      vac_course_id: vacCourseId,
      clo_refs: cloRefs,
    });

    if (input.submit) {
      const submitted = await PDEDemonstrationService.submit(updated.id);
      return { ok: true, data: submitted };
    }

    return { ok: true, data: updated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save your changes.',
    };
  }
}
