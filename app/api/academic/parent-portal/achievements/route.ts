import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { notifyParentsOfLearners, htmlToText } from '@/lib/push/notify-parents';

export const runtime = 'nodejs';

/** GET /api/academic/parent-portal/achievements?institutionId= — recent items. */
export async function GET(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const institutionId = new URL(req.url).searchParams.get('institutionId');
  let q = db
    .from('pp_achievements')
    .select('id, title, category, achieved_on, learner_profile_id')
    .order('created_at', { ascending: false })
    .limit(50);
  if (institutionId) q = q.eq('institutions_id', institutionId);
  const { data } = await q;
  return NextResponse.json({ data: data ?? [] });
}

/** POST — record an achievement for a learner (resolved by admission). */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    institutionId?: string;
    learnerId?: string;
    admission?: string;
    title?: string;
    description?: string;
    category?: string;
    achievedOn?: string;
    attachments?: unknown[];
  };
  const admission = (body.admission ?? '').trim().toUpperCase();
  if (!body.institutionId || (!body.learnerId && !admission)) {
    return NextResponse.json(
      { error: 'Institution and learner are required.' },
      { status: 400 }
    );
  }
  if (
    !body.title?.trim() ||
    !body.description?.trim() ||
    !body.category?.trim() ||
    !body.achievedOn
  ) {
    return NextResponse.json(
      { error: 'Title, description, category and achieved-on date are required.' },
      { status: 400 }
    );
  }

  const db = createServiceRoleClient();

  // Prefer the picked learnerId (cascading selector); else resolve by admission.
  // Either way, verify the learner belongs to the chosen institution.
  let lq = db.from('learners_profiles').select('id').eq('institution_id', body.institutionId);
  lq = body.learnerId
    ? lq.eq('id', body.learnerId)
    : lq.or(`application_id.eq.${admission},roll_number.eq.${admission},register_number.eq.${admission}`);
  const { data: learnerRow } = await lq.maybeSingle();
  const learner = learnerRow as unknown as { id: string } | null;
  if (!learner) {
    return NextResponse.json(
      { error: 'Learner not found in this institution.' },
      { status: 404 }
    );
  }

  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const { error } = await db.from('pp_achievements').insert({
    institutions_id: body.institutionId,
    learner_profile_id: learner.id,
    title: body.title.trim(),
    description: body.description.trim(),
    category: body.category.trim(),
    achieved_on: body.achievedOn,
    attachment_urls: attachments,
    // Keep the legacy single-cert column populated with the first file.
    certificate_url: (attachments[0] as { url?: string } | undefined)?.url ?? null,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: 'Failed to record achievement' }, { status: 500 });

  // Push to this learner's parent(s). Never fail the create on a push error.
  try {
    await notifyParentsOfLearners({
      institutionsId: body.institutionId,
      learnerIds: [learner.id],
      title: `New achievement: ${body.title.trim()}`,
      body: htmlToText(body.description),
      category: 'achievement',
      actionUrl: '/parent/achievements',
    });
  } catch (e) {
    console.error('[PP achievements] push failed:', e);
  }

  return NextResponse.json({ ok: true });
}
