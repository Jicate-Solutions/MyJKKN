export const dynamic = 'force-dynamic';

// POST /api/id-cards/jobs/:id/result
// Phase 1C — agent-token only. Report the terminal outcome of a print job.
//
// Body: { success: boolean, error_message?: string | null }
// success=true  → status='printed', result={success:true,error_message:null}
// success=false → status='failed',  result={success:false,error_message:"..."}
//
// We only allow the transition from sent_to_agent → (printed|failed). Any other
// source state is treated as a stale/conflicting report and rejected with 409
// so we don't silently overwrite a manually-resolved job.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireAgentToken, isAuthFailure } from '@/lib/id-cards/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { IdCardPrintJob } from '@/lib/id-cards/types';

const paramsSchema = z.string().uuid();

const bodySchema = z.object({
  success: z.boolean(),
  error_message: z.string().max(2000).nullable().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = requireAgentToken(request);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsedId = paramsSchema.safeParse(id);
    if (!parsedId.success) {
      return jsonError('Job id must be a valid uuid', 'bad_request', 400);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 'bad_request', 400);
    }

    const parsedBody = bodySchema.safeParse(raw);
    if (!parsedBody.success) {
      return jsonError(
        `Invalid body: ${parsedBody.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        'bad_request',
        400
      );
    }

    const { success, error_message = null } = parsedBody.data;

    if (!success && (error_message === null || error_message.trim() === '')) {
      return jsonError(
        'When success=false, error_message is required and must be non-empty.',
        'bad_request',
        400
      );
    }

    const service = createServiceRoleClient();

    const { data: updated, error } = await service
      .from('id_card_print_jobs')
      .update({
        status: success ? 'printed' : 'failed',
        result: { success, error_message: success ? null : error_message }
      })
      .eq('id', parsedId.data)
      .eq('status', 'sent_to_agent')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[id-cards/jobs/result] update error:', error);
      return jsonError(
        `Failed to record job result: ${error.message}`,
        'update_failed',
        500
      );
    }

    if (!updated) {
      return jsonError(
        'Job not found in sent_to_agent state. It may already be terminal or never picked up.',
        'job_state_conflict',
        409
      );
    }

    return jsonOk<IdCardPrintJob>(updated as IdCardPrintJob);
  } catch (err) {
    console.error('[id-cards/jobs/result] unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
