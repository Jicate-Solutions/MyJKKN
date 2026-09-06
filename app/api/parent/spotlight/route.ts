import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { SpotlightItem } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/spotlight?learnerId=… — curated highlights for the institution. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', learnerId)
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ data: [] });

    const { data: rows } = await db
      .from('pp_spotlight')
      .select('id, title, body, media_url, link_url, sort_order')
      .eq('institutions_id', learner.institution_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const data: SpotlightItem[] = (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body ?? undefined,
      mediaUrl: r.media_url ?? undefined,
      linkUrl: r.link_url ?? undefined,
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
