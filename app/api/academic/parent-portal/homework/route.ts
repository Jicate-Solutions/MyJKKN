import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { notifyParentsOfLearners, htmlToText } from '@/lib/push/notify-parents';

export const runtime = 'nodejs';

/** GET /api/academic/parent-portal/homework?institutionId= — recent homework. */
export async function GET(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const institutionId = new URL(req.url).searchParams.get('institutionId');
  let q = db
    .from('pp_homework')
    .select('id, title, subject, due_date, is_active')
    .order('assigned_on', { ascending: false })
    .limit(50);
  if (institutionId) q = q.eq('institutions_id', institutionId);
  const { data } = await q;
  return NextResponse.json({ data: data ?? [] });
}

/** POST — assign homework to a section. */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    institutionId?: string;
    sectionId?: string;
    subject?: string;
    title?: string;
    instructions?: string;
    dueDate?: string;
    maxMarks?: number;
    attachments?: unknown[];
  };
  if (!body.institutionId || !body.sectionId) {
    return NextResponse.json(
      { error: 'Institution and section are required.' },
      { status: 400 }
    );
  }
  if (
    !body.subject?.trim() ||
    !body.title?.trim() ||
    !body.instructions?.trim() ||
    !body.dueDate ||
    body.maxMarks == null ||
    Number.isNaN(Number(body.maxMarks))
  ) {
    return NextResponse.json(
      { error: 'Subject, title, instructions, due date and max marks are required.' },
      { status: 400 }
    );
  }

  const db = createServiceRoleClient();
  const { data: inserted, error } = await db
    .from('pp_homework')
    .insert({
      institutions_id: body.institutionId,
      section_id: body.sectionId,
      subject: body.subject.trim(),
      title: body.title.trim(),
      instructions: body.instructions.trim(),
      due_date: body.dueDate,
      max_marks: body.maxMarks,
      attachment_urls: Array.isArray(body.attachments) ? body.attachments : [],
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: 'Failed to assign homework' }, { status: 500 });

  // Push to every learner in the assigned section. Never fail the create on push.
  try {
    const { data: learners } = await db
      .from('learners_profiles')
      .select('id')
      .eq('institution_id', body.institutionId)
      .eq('section_id', body.sectionId);
    await notifyParentsOfLearners({
      institutionsId: body.institutionId,
      learnerIds: (learners ?? []).map((l) => l.id as string),
      title: `New homework: ${body.title.trim()}`,
      body: htmlToText(body.instructions) || body.subject.trim(),
      category: 'homework',
      actionUrl: inserted?.id ? `/parent/homework/${inserted.id}` : '/parent/homework',
    });
  } catch (e) {
    console.error('[PP homework] push failed:', e);
  }

  return NextResponse.json({ ok: true });
}
