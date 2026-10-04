export const dynamic = 'force-dynamic';

// DELETE /api/id-cards/jobs/:id — cancel a print job that has not printed yet.
//
// The Print Queue page has called this endpoint since Phase 2, but no route
// existed (404 → the "Cancel" button did nothing) and "Print ID Card" answered
// 409 duplicate_active_job with no way past it. Cancelling deletes the row:
// the status CHECK has no 'cancelled' value and an active job carries nothing
// worth keeping (the bridge re-renders from the template on pickup).
//
// Only ACTIVE jobs (pending / rendering / sent_to_agent) can be cancelled;
// printed and failed rows are history and answer 409.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireUser, isAuthFailure } from '@/lib/id-cards/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { JOB_WRITER_ROLES } from '@/lib/id-cards/types';

const ACTIVE = ['pending', 'rendering', 'sent_to_agent'] as const;
const paramsSchema = z.string().uuid();

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = await requireUser(JOB_WRITER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsed = paramsSchema.safeParse(id);
    if (!parsed.success) return jsonError('Job id must be a valid uuid', 'bad_request', 400);

    // Service role for the write: the queue is office-staff tooling and the
    // row-level policies only cover reads for the person's own card.
    const db = createServiceRoleClient();
    const { data: job, error: readError } = await db
      .from('id_card_print_jobs')
      .select('id, status')
      .eq('id', parsed.data)
      .maybeSingle();
    if (readError) return jsonError(`Failed to read job: ${readError.message}`, 'query_failed', 500);
    if (!job) return jsonError('No print job exists for the given id', 'not_found', 404);
    if (!(ACTIVE as readonly string[]).includes(job.status as string)) {
      return jsonError(
        `Only queued jobs can be cancelled (this one is ${job.status})`,
        'not_cancellable',
        409
      );
    }

    const { error: deleteError } = await db.from('id_card_print_jobs').delete().eq('id', parsed.data);
    if (deleteError) return jsonError(`Failed to cancel job: ${deleteError.message}`, 'query_failed', 500);

    return jsonOk({ id: parsed.data, cancelled: true, previous_status: job.status });
  } catch (err) {
    console.error('[id-cards/jobs/:id] DELETE unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
