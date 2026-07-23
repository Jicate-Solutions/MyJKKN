/**
 * GET /api/learners/my-marks/internal-final
 *
 * Phase 1 STUB: returns { status: 'coming_soon' } until the COE Final-CIA
 * endpoint is shared. The student page renders a "Coming Soon" card when
 * it sees this status, so the tab structure is in place but no real data
 * flows yet.
 *
 * Replace the body with a real COE proxy call when the endpoint lands.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type { MyMarksInternalFinalResponse } from '@/types/my-marks';

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    return NextResponse.json(
      { error: 'Forbidden', reason: validation.reason },
      { status: 403 }
    );
  }

  const response: MyMarksInternalFinalResponse = { status: 'coming_soon' };
  return NextResponse.json({ data: response });
}
