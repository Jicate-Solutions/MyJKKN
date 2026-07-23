// POST /api/hr/disciplinary/cases/[id]/decision — record outcome + close case
// Body: { outcome, outcome_note, suspension_start_date?, suspension_end_date? }
//   outcome: 'warning' | 'suspension' | 'termination' | 'exonerated'
// Side effect: outcome='termination' writes a new hr_offboarding_cases row.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  HRDisciplinaryService,
  type DisciplinaryOutcome,
} from '@/lib/services/hr/disciplinary-service';

const VALID_OUTCOMES: DisciplinaryOutcome[] = [
  'warning',
  'suspension',
  'termination',
  'exonerated',
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    outcome?: string;
    outcome_note?: string;
    suspension_start_date?: string;
    suspension_end_date?: string;
  };

  if (!body.outcome || !VALID_OUTCOMES.includes(body.outcome as DisciplinaryOutcome)) {
    return NextResponse.json(
      {
        error: `outcome must be one of ${VALID_OUTCOMES.join(', ')}`,
      },
      { status: 400 },
    );
  }
  const note = (body.outcome_note ?? '').trim();
  if (note.length < 10) {
    return NextResponse.json(
      { error: 'outcome_note must be at least 10 characters' },
      { status: 400 },
    );
  }
  if (body.outcome === 'suspension') {
    if (!body.suspension_start_date || !body.suspension_end_date) {
      return NextResponse.json(
        {
          error:
            'suspension_start_date and suspension_end_date required for suspension outcome',
        },
        { status: 400 },
      );
    }
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = new HRDisciplinaryService(supabase);
  try {
    const result = await service.recordDecision({
      caseId: id,
      outcome: body.outcome as DisciplinaryOutcome,
      outcomeNote: note,
      recordedBy: user.id,
      suspensionStartDate: body.suspension_start_date,
      suspensionEndDate: body.suspension_end_date,
    });
    return NextResponse.json({
      ok: true,
      case: result.case,
      offboarding_case_id: result.offboardingCaseId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
