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
import type {
  CreatePDEDemonstrationInput,
  PDECategoryKey,
} from '@/lib/types/pde-demonstrations';

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

    const input: CreatePDEDemonstrationInput = {
      learner_id: body.learner_id || user.id,
      institution_id: body.institution_id,
      category_key: body.category_key,
      rubric_policy_key: body.rubric_policy_key || undefined,
      skill_name: body.skill_name || undefined,
      evidence: body.evidence || {},
      evidence_type: body.evidence_type || undefined,
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
