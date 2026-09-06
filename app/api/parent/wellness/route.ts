import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { WellnessRecord } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/wellness?learnerId=… — health/wellness records, latest first. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: rows } = await db
      .from('pp_wellness_records')
      .select('id, record_date, height_cm, weight_kg, bmi, vision_left, vision_right, remarks')
      .eq('learner_profile_id', learnerId)
      .order('record_date', { ascending: false });

    const data: WellnessRecord[] = (rows ?? []).map((r) => ({
      id: r.id,
      recordDate: r.record_date ?? undefined,
      heightCm: r.height_cm ?? undefined,
      weightKg: r.weight_kg ?? undefined,
      bmi: r.bmi ?? undefined,
      visionLeft: r.vision_left ?? undefined,
      visionRight: r.vision_right ?? undefined,
      remarks: r.remarks ?? undefined,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
