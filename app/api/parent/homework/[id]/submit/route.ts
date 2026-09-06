import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { Attachment } from '@/types/parent-portal';

export const runtime = 'nodejs';

/**
 * POST /api/parent/homework/[id]/submit
 * Body: { learnerId, submissionText?, attachments?: Attachment[] }
 *
 * Phase A3: persists the submission (text + attachment refs). Actual Google
 * Drive file upload is wired when GOOGLE_DRIVE_* is configured (isDriveConfigured);
 * until then attachments carry client-provided metadata only.
 *
 * Rules: cannot resubmit once marked; submitted after due_date → 'late'.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: homeworkId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      learnerId?: string;
      submissionText?: string;
      attachments?: Attachment[];
    };
    const learnerId = body.learnerId ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: hw } = await db
      .from('pp_homework')
      .select('id, institutions_id, due_date')
      .eq('id', homeworkId)
      .maybeSingle();
    if (!hw) return NextResponse.json({ error: 'Homework not found' }, { status: 404 });

    const { data: existing } = await db
      .from('pp_homework_submissions')
      .select('id, status')
      .eq('homework_id', homeworkId)
      .eq('learner_profile_id', learnerId)
      .maybeSingle();
    if (existing?.status === 'marked') {
      return NextResponse.json({ error: 'This homework has already been marked.' }, { status: 409 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const isLate = hw.due_date ? today > hw.due_date : false;
    const nowIso = new Date().toISOString();

    const payload = {
      institutions_id: hw.institutions_id,
      homework_id: homeworkId,
      learner_profile_id: learnerId,
      submission_text: body.submissionText ?? null,
      attachment_urls: body.attachments ?? [],
      submitted_at: nowIso,
      status: isLate ? 'late' : 'submitted',
      updated_at: nowIso,
    };

    const { error } = await db
      .from('pp_homework_submissions')
      .upsert(payload, { onConflict: 'homework_id,learner_profile_id' });
    if (error) return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });

    return NextResponse.json({ ok: true, status: payload.status });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
