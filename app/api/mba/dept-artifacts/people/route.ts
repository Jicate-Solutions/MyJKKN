// app/api/mba/dept-artifacts/people/route.ts
// GET ?area_id=<uuid> — real people connected to a department, to pre-fill the
// organogram edit form (so holders come from actual MyJKKN records, not blanks).
// v1 source: the associates posted to the area (mba_associate_postings -> profiles)
// plus the current manager. Returns [] when nobody is posted yet (honest — the
// manager then types names in manually).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export interface AreaPerson {
  id: string;
  name: string | null;
  email: string | null;
  source: 'posted_associate' | 'me';
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Manager-only: the edit form these feed is a manager surface.
    const { data: canManage } = await supabase.rpc('user_has_permission', {
      permission_name: 'improvement.board.manage',
    });
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const areaId = request.nextUrl.searchParams.get('area_id');
    if (!areaId) {
      return NextResponse.json({ error: 'area_id is required' }, { status: 400 });
    }

    const admin = createServiceRoleClient();

    const { data: postings } = await admin
      .from('mba_associate_postings')
      .select('associate_user_id')
      .eq('area_id', areaId);

    const ids = Array.from(
      new Set([...(postings ?? []).map((p) => p.associate_user_id), user.id].filter(Boolean)),
    );

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const people: AreaPerson[] = ids.map((id) => {
      const p = byId.get(id);
      return {
        id,
        name: p?.full_name ?? null,
        email: p?.email ?? null,
        source: id === user.id ? 'me' : 'posted_associate',
      };
    });

    return NextResponse.json({ people });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts/people] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
