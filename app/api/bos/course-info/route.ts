// app/api/bos/course-info/route.ts
//
// MyJKKN proxy for COE's GET /api/v1/course-info master lookup.
// Drives the course_type dropdown across the BOS module.
//
// COE credentials stay server-side; clients only see this proxy.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos } from '@/lib/utils/bos/bos-access';
import type { CoeCourseInfoListResponse } from '@/types/bos-courses';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Reuse bos-courses permission: anyone allowed to view the course list
    // is implicitly allowed to read the course_type lookup.
    const hasAccess = await canAccessBos(user.id, 'academic.bos-courses', 'view');
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = CoeRestClient.create();
    const raw = await client.get<CoeCourseInfoListResponse>('/api/v1/course-info');
    return NextResponse.json(raw);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/course-info] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch course types' }, { status: 500 });
  }
}
