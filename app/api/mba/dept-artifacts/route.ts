// app/api/mba/dept-artifacts/route.ts
// GET — list department playbook artifacts, RLS-scoped to the caller.
// ?area_id=<uuid> filters to one area. Reads through the user's own client so
// the mba_dept_artifacts SELECT policy decides what is visible (super/admin OR
// improvement.board.manage OR an associate posted to the area).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MbaDeptArtifact } from '@/lib/services/mba-dept-artifacts/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const areaId = request.nextUrl.searchParams.get('area_id');

    let query = supabase
      .from('mba_dept_artifacts')
      .select(
        'id, area_id, artifact_type, content, status, version, ai_model, ai_drafted_at, reviewed_by, reviewed_at, review_notes, updated_at',
      );
    if (areaId) query = query.eq('area_id', areaId);

    const { data, error } = await query;
    if (error) {
      console.error('[GET /api/mba/dept-artifacts] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch artifacts' }, { status: 500 });
    }

    return NextResponse.json({ artifacts: (data ?? []) as MbaDeptArtifact[] });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
