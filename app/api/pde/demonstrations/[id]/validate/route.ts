/**
 * POST /api/pde/demonstrations/[id]/validate
 * ============================================================================
 * Faculty/staff records a validation review for a PDE demonstration.
 *
 * Auth: relies on Supabase RLS — the route reads the authenticated user via
 * `supabase.auth.getUser()` and the row-level policies on `pde_demonstrations`
 * (see 20260518_pde_demonstrations_table.sql) enforce that only
 * faculty/hod/coordinator/dean/admin in the same institution can write.
 *
 * Body: { notes: string, raw_score: number }
 *   - notes: free-form validator commentary (required, can be empty string)
 *   - raw_score: 0-100 numeric score the validator assigns
 *
 * Returns: { data: PdeDemonstrationRow } on success
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PDEValidatorService } from '@/lib/services/pde-validator-service';
import { normalizeCloRefs } from '@/lib/services/pde-curriculum-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const notes = typeof body?.notes === 'string' ? body.notes : '';
    const rawScore = Number(body?.raw_score);

    if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 100) {
      return NextResponse.json(
        { error: 'raw_score must be a number in [0,100]' },
        { status: 400 }
      );
    }

    // Curriculum connector: validator-confirmed CLO set (attainment reads only
    // this). Omitted → column untouched; [] → cleared (validator rejected all
    // proposals). Validators are not bound by the learner-side tag cap.
    let cloRefsConfirmed: number[] | null | undefined = undefined;
    if (body?.clo_refs_confirmed !== undefined) {
      cloRefsConfirmed = normalizeCloRefs(body.clo_refs_confirmed);
    }

    const updated = await PDEValidatorService.recordValidation(
      id,
      user.id,
      notes,
      rawScore,
      cloRefsConfirmed
    );
    return NextResponse.json({ data: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
