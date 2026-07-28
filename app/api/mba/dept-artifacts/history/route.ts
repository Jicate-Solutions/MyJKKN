// app/api/mba/dept-artifacts/history/route.ts
// GET ?area_id=<uuid>&artifact_type=<type> — the approved-version history for one
// artifact, newest first. RLS-scoped (same read authority as the artifacts).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const artifactType = request.nextUrl.searchParams.get('artifact_type');
    if (!areaId || !artifactType) {
      return NextResponse.json(
        { error: 'area_id and artifact_type are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('mba_dept_artifact_versions')
      .select('id, version, content, approved_by, approved_at, created_at')
      .eq('area_id', areaId)
      .eq('artifact_type', artifactType)
      .order('approved_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[GET /api/mba/dept-artifacts/history] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    return NextResponse.json({ versions: data ?? [] });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts/history] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
