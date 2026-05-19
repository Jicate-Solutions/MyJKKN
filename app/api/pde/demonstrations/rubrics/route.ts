/**
 * Rubric lookup for the demonstration form.
 *
 * GET /api/pde/demonstrations/rubrics?category=<key>
 *   → returns the seeded rubrics under `pde.rubrics.<namespace>.*` for the
 *     three categories that have rubrics today (embodied / social_leadership
 *     / cultural_civic). Other categories return an empty array — the form
 *     should treat that as "no rubric required, free-form".
 *
 * Auth: requires authenticated learner (cookie SSR). RLS on the rubric reads
 * is enforced inside PDEDemonstrationService.listRubricsForCategory via the
 * `fn_get_policy_json` RPC.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDEDemonstrationService } from '@/lib/services/pde-demonstration-service';
import type { PDECategoryKey } from '@/lib/types/pde-demonstrations';

const VALID: PDECategoryKey[] = [
  'judgment',
  'embodied',
  'problem_finding',
  'accountability',
  'social_leadership',
  'cultural_civic',
  'credential',
];

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const category = request.nextUrl.searchParams.get('category') as PDECategoryKey | null;
    if (!category || !VALID.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID.join(', ')}` },
        { status: 400 }
      );
    }

    const rubrics = await PDEDemonstrationService.listRubricsForCategory(category);
    return NextResponse.json({ data: rubrics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
