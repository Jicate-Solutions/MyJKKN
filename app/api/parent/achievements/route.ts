import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { Achievement, Attachment } from '@/types/parent-portal';

const asAttachments = (v: unknown): Attachment[] => (Array.isArray(v) ? (v as Attachment[]) : []);

export const runtime = 'nodejs';

/** GET /api/parent/achievements?learnerId=… */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: rows } = await db
      .from('pp_achievements')
      .select('id, title, description, category, achieved_on, certificate_url, attachment_urls')
      .eq('learner_profile_id', learnerId)
      .order('achieved_on', { ascending: false });

    const data: Achievement[] = (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? undefined,
      category: r.category ?? undefined,
      achievedOn: r.achieved_on ?? undefined,
      certificateUrl: r.certificate_url ?? undefined,
      attachmentUrls: asAttachments(r.attachment_urls),
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
