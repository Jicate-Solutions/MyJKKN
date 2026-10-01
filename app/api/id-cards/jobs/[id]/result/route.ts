export const dynamic = 'force-dynamic';

// POST /api/id-cards/jobs/:id/result
// Phase 1C — agent-token only. Report the terminal outcome of a print job.
//
// Body: { success: boolean, error_message?: string | null, timings?: {...} }
// success=true  → status='printed', result={success:true,error_message:null}
// success=false → status='failed',  result={success:false,error_message:"..."}
//
// TIMING (additive, 2026-10-01): result also carries `reported_at` (server
// clock) so the queue can split each card's cycle into "printing" (picked_up_at
// → reported_at) and "waiting for the next pickup" (reported_at → next job's
// picked_up_at). The 30 Sept batch ran at a median 101 s per card with a
// 99–107 s spread — a fixed cycle, far above the printer's own duplex time —
// and nothing recorded which side of the cycle the time went to. A bridge may
// additionally send `timings` { render_ms, print_ms, poll_interval_s } which
// are stored verbatim; older bridges that omit it are unaffected.
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
  error_message: z.string().max(2000).nullable().optional(),
  timings: z
    .object({
      render_ms: z.number().int().nonnegative().optional(),
      print_ms: z.number().int().nonnegative().optional(),
      poll_interval_s: z.number().nonnegative().optional()
    })
    .optional()
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

    const { success, error_message = null, timings } = parsedBody.data;

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
        result: {
          success,
          error_message: success ? null : error_message,
          reported_at: new Date().toISOString(),
          ...(timings ? { timings } : {})
        }
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
