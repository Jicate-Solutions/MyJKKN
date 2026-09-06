import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { EventItem, GalleryItem } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/events?learnerId=… — events + their gallery items. */
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

    const { data: events } = await db
      .from('pp_events')
      .select('id, title, description, event_date, venue, banner_url')
      .eq('institutions_id', learner.institution_id)
      .eq('is_active', true)
      .order('event_date', { ascending: false });

    const rows = events ?? [];
    const galleryByEvent = new Map<string, GalleryItem[]>();
    if (rows.length) {
      const { data: media } = await db
        .from('pp_gallery_items')
        .select('id, event_id, title, media_type, url, thumbnail_url')
        .in('event_id', rows.map((e) => e.id));
      for (const m of media ?? []) {
        const item: GalleryItem = {
          id: m.id,
          title: m.title ?? undefined,
          mediaType: m.media_type === 'video' ? 'video' : 'image',
          url: m.url ?? undefined,
          thumbnailUrl: m.thumbnail_url ?? undefined,
        };
        const list = galleryByEvent.get(m.event_id) ?? [];
        list.push(item);
        galleryByEvent.set(m.event_id, list);
      }
    }

    const data: EventItem[] = rows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description ?? undefined,
      eventDate: e.event_date ?? undefined,
      venue: e.venue ?? undefined,
      bannerUrl: e.banner_url ?? undefined,
      gallery: galleryByEvent.get(e.id) ?? [],
    }));
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
