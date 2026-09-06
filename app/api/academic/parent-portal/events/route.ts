import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { notifyParentsOfLearners, htmlToText } from '@/lib/push/notify-parents';

export const runtime = 'nodejs';

/** GET /api/academic/parent-portal/events?institutionId= — recent events. */
export async function GET(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const institutionId = new URL(req.url).searchParams.get('institutionId');
  let q = db
    .from('pp_events')
    .select('id, title, event_date, venue, is_active')
    .order('event_date', { ascending: false })
    .limit(50);
  if (institutionId) q = q.eq('institutions_id', institutionId);
  const { data } = await q;
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST — create an institution-wide event and push to every parent in it.
 * (pp_events has no section/program targeting, so events are institution-wide.)
 */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    institutionId?: string;
    title?: string;
    description?: string;
    eventDate?: string;
    venue?: string;
    bannerUrl?: string;
  };
  if (!body.institutionId || !body.title?.trim()) {
    return NextResponse.json({ error: 'Institution and title are required.' }, { status: 400 });
  }

  const db = createServiceRoleClient();
  const { error } = await db.from('pp_events').insert({
    institutions_id: body.institutionId,
    title: body.title.trim(),
    description: body.description ?? null,
    event_date: body.eventDate || null,
    venue: body.venue ?? null,
    banner_url: body.bannerUrl ?? null,
  });
  if (error) return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });

  // Push to all parents in the institution. Never fail the create on a push error.
  try {
    const { data: learners } = await db
      .from('learners_profiles')
      .select('id')
      .eq('institution_id', body.institutionId)
      .limit(5000);
    await notifyParentsOfLearners({
      institutionsId: body.institutionId,
      learnerIds: ((learners as unknown as Array<{ id: string }>) ?? []).map((l) => l.id),
      title: `New event: ${body.title.trim()}`,
      body: htmlToText(body.description),
      category: 'event',
      actionUrl: '/parent/events',
    });
  } catch (e) {
    console.error('[PP events] push failed:', e);
  }

  return NextResponse.json({ ok: true });
}
