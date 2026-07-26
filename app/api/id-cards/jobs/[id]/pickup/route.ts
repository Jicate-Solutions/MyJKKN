export const dynamic = 'force-dynamic';

// POST /api/id-cards/jobs/:id/pickup
// Phase 1C — agent-token only. Atomically claim a pending job for printing.
//
// Update is gated to status='pending' so concurrent agents can race safely:
// only one row with the matching id+status='pending' will exist before the update,
// and only the winning UPDATE returns a row. 0 rows back → 409 (already claimed
// or terminal).

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireAgentToken, isAuthFailure } from '@/lib/id-cards/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { IdCardPrintJob } from '@/lib/id-cards/types';

const idSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = requireAgentToken(request);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return jsonError('Job id must be a valid uuid', 'bad_request', 400);
    }

    const service = createServiceRoleClient();

    // Atomic claim: WHERE id=:id AND status='pending'.
    // Postgres serializes the UPDATE; only one concurrent caller wins the row.
    const { data: claimed, error } = await service
      .from('id_card_print_jobs')
      .update({
        status: 'sent_to_agent',
        picked_up_at: new Date().toISOString()
      })
      .eq('id', parsed.data)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[id-cards/jobs/pickup] update error:', error);
      return jsonError(`Failed to claim job: ${error.message}`, 'update_failed', 500);
    }

    if (!claimed) {
      return jsonError(
        'Job is not available for pickup (already claimed, terminal, or does not exist).',
        'job_unavailable',
        409
      );
    }

    return jsonOk<IdCardPrintJob>(claimed as IdCardPrintJob);
  } catch (err) {
    console.error('[id-cards/jobs/pickup] unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
