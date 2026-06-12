/**
 * PDE Demonstrations — REST surface for the learner submission UI.
 * ============================================================================
 *
 * GET  /api/pde/demonstrations           → list rows owned by current user
 * POST /api/pde/demonstrations           → create a draft row
 *
 * Status transitions (submit / withdraw) ship as nested routes in T1.2; this
 * file intentionally stays narrow for Tier 1.1.
 *
 * Auth pattern mirrors `app/api/pde/quests/route.ts` (cookie SSR + getUser).
 * RLS on `public.pde_demonstrations` does the heavy lifting — we never need
 * a manual `eq('learner_id', user.id)` filter for the list call.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDEDemonstrationService } from '@/lib/services/pde-demonstration-service';
import { getCloTagCap, normalizeCloRefs } from '@/lib/services/pde-curriculum-service';
import type {
  CreatePDEDemonstrationInput,
  PDECategoryKey,
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

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await PDEDemonstrationService.listMine();
    return NextResponse.json({ data: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<CreatePDEDemonstrationInput> & {
      submit?: boolean;
    };

    // Validate required fields inline (no zod — this codebase keeps zod usage
    // narrow; matches the pde/quests POST shape).
    if (!body.category_key) {
      return NextResponse.json({ error: 'category_key is required' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(body.category_key)) {
      return NextResponse.json(
        { error: `category_key must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    // --- Curriculum connector validation (dual-lane, spec §4) ---
    const bosSyllabusId = body.bos_syllabus_id ?? null;
    const vacCourseId = body.vac_course_id ?? null;
    if (bosSyllabusId && !UUID_RE.test(bosSyllabusId)) {
      return NextResponse.json({ error: 'bos_syllabus_id must be a uuid' }, { status: 400 });
    }
    if (vacCourseId && !UUID_RE.test(vacCourseId)) {
      return NextResponse.json({ error: 'vac_course_id must be a uuid' }, { status: 400 });
    }
    if (bosSyllabusId && vacCourseId) {
      return NextResponse.json(
        { error: 'Link either a BoS syllabus or a VAC course, not both' },
        { status: 400 }
      );
    }

    // CLO proposals ride only on the BoS lane; cap is the zero-deploy policy
    // row pde.obe.clo_tag_cap (anti blanket-tag gaming, spec §4.10).
    let cloRefs: number[] | null = null;
    if (body.clo_refs !== undefined && body.clo_refs !== null) {
      if (!bosSyllabusId) {
        return NextResponse.json(
          { error: 'clo_refs requires bos_syllabus_id' },
          { status: 400 }
        );
      }
      cloRefs = normalizeCloRefs(body.clo_refs);
      const cap = await getCloTagCap();
      if (cloRefs.length > cap) {
        return NextResponse.json(
          { error: `You can tag at most ${cap} CLO${cap === 1 ? '' : 's'} per demonstration` },
          { status: 400 }
        );
      }
      if (cloRefs.length === 0) cloRefs = null;
    }

    const input: CreatePDEDemonstrationInput = {
      learner_id: body.learner_id || user.id,
      institution_id: body.institution_id,
      category_key: body.category_key,
      rubric_policy_key: body.rubric_policy_key || undefined,
      skill_name: body.skill_name || undefined,
      evidence: body.evidence || {},
      evidence_type: body.evidence_type || undefined,
      bos_syllabus_id: bosSyllabusId,
      vac_course_id: vacCourseId,
      clo_refs: cloRefs,
    };

    const row = await PDEDemonstrationService.create(input);

    // Optional one-shot submit — saves the form a second round-trip when the
    // learner clicks "Submit for review" instead of "Save as draft".
    if (body.submit) {
      const submitted = await PDEDemonstrationService.submit(row.id);
      return NextResponse.json({ data: submitted }, { status: 201 });
    }

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
