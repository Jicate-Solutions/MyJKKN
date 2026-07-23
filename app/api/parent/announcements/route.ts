import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveParentScope,
  assertLearnerAccess,
  parentErrorResponse,
} from '@/lib/utils/parent-access';
import type { Announcement, Attachment } from '@/types/parent-portal';

export const runtime = 'nodejs';

const asAttachments = (v: unknown): Attachment[] => (Array.isArray(v) ? (v as Attachment[]) : []);

/**
 * GET /api/parent/announcements?learnerId=… — announcements for the active
 * child's institution, narrowed by audience targeting (all / class / section /
 * learner). Audience matching is done in JS for clarity over a nested .or().
 */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id, program_id, section_id')
      .eq('id', learnerId)
      .maybeSingle();

    if (!learner?.institution_id) return NextResponse.json({ data: [] });

    const nowIso = new Date().toISOString();
    const { data: rows } = await db
      .from('pp_announcements')
      .select(
        'id, title, body, category, audience, program_id, section_id, learner_profile_id, banner_url, link_url, attachment_urls, published_at, expires_at'
      )
      .eq('institutions_id', learner.institution_id)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('published_at', { ascending: false })
      .limit(100);

    const matches = (row: {
      audience: string;
      program_id: string | null;
      section_id: string | null;
      learner_profile_id: string | null;
    }) => {
      switch (row.audience) {
        case 'class':
          return !!learner.program_id && row.program_id === learner.program_id;
        case 'section':
          return !!learner.section_id && row.section_id === learner.section_id;
        case 'learner':
          return row.learner_profile_id === learnerId;
        case 'all':
        default:
          return true;
      }
    };

    const data: Announcement[] = (rows ?? []).filter(matches).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body ?? undefined,
      category: r.category ?? undefined,
      bannerUrl: r.banner_url ?? undefined,
      linkUrl: r.link_url ?? undefined,
      attachmentUrls: asAttachments(r.attachment_urls),
      publishedAt: r.published_at,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
