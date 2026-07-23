import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { notifyParentsOfLearners, htmlToText } from '@/lib/push/notify-parents';

export const runtime = 'nodejs';

/** GET /api/academic/parent-portal/announcements?institutionId= — recent items. */
export async function GET(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const institutionId = new URL(req.url).searchParams.get('institutionId');
  let q = db
    .from('pp_announcements')
    .select('id, title, category, audience, published_at, is_active')
    .order('published_at', { ascending: false })
    .limit(50);
  if (institutionId) q = q.eq('institutions_id', institutionId);
  const { data } = await q;
  return NextResponse.json({ data: data ?? [] });
}

/** POST — create an announcement. */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    institutionId?: string;
    title?: string;
    body?: string;
    category?: string;
    programId?: string;
    sectionId?: string;
    learnerId?: string;
    linkUrl?: string;
    attachments?: unknown[];
  };
  if (!body.institutionId) {
    return NextResponse.json({ error: 'Institution is required.' }, { status: 400 });
  }
  if (!body.title?.trim() || !body.body?.trim() || !body.category?.trim()) {
    return NextResponse.json(
      { error: 'Title, message and category are required.' },
      { status: 400 }
    );
  }

  const db = createServiceRoleClient();
  // Narrowest target wins: learner → section → class(program) → whole institution.
  const audience = body.learnerId
    ? 'learner'
    : body.sectionId
    ? 'section'
    : body.programId
    ? 'class'
    : 'all';
  const { data: inserted, error } = await db
    .from('pp_announcements')
    .insert({
      institutions_id: body.institutionId,
      title: body.title.trim(),
      body: body.body ?? null,
      category: body.category ?? 'general',
      audience,
      program_id: audience === 'class' ? body.programId : null,
      section_id: audience === 'section' ? body.sectionId : null,
      learner_profile_id: audience === 'learner' ? body.learnerId : null,
      link_url: body.linkUrl ?? null,
      attachment_urls: Array.isArray(body.attachments) ? body.attachments : [],
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });

  // Push to the targeted audience's parents. Never fail the create on push.
  try {
    let lq = db.from('learners_profiles').select('id').eq('institution_id', body.institutionId);
    if (audience === 'class') lq = lq.eq('program_id', body.programId!);
    else if (audience === 'section') lq = lq.eq('section_id', body.sectionId!);
    else if (audience === 'learner') lq = lq.eq('id', body.learnerId!);
    const { data: learners } = await lq;
    await notifyParentsOfLearners({
      institutionsId: body.institutionId,
      learnerIds: (learners ?? []).map((l) => l.id as string),
      title: `New announcement: ${body.title!.trim()}`,
      body: htmlToText(body.body),
      category: 'announcement',
      actionUrl: inserted?.id ? `/parent/announcements/${inserted.id}` : '/parent/announcements',
    });
  } catch (e) {
    console.error('[PP announcements] push failed:', e);
  }

  return NextResponse.json({ ok: true });
}
