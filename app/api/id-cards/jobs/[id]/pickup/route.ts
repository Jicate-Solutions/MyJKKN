export const dynamic = 'force-dynamic';

// POST /api/id-cards/jobs/:id/pickup
// Phase 1C — agent-token only. Atomically claim a pending job for printing.
//
// Update is gated to status='pending' so concurrent agents can race safely:
// only one row with the matching id+status='pending' will exist before the update,
// and only the winning UPDATE returns a row. 0 rows back → 409 (already claimed
// or terminal).
//
// DUPLEX CONTRACT (additive, 2026-07-25):
//   Response data = the claimed job row + `has_back: boolean`.
//   has_back=true  ⇔ the job's template has back_layout_json set (non-null),
//                    i.e. GET /api/id-cards/templates/:tid/render
//                    ?profile_id=...&side=back&format=png returns the back PNG
//                    with the SAME agent bearer token (requireUserOrAgent runs
//                    before any side handling on that route).
//   has_back=false → front-only card; ?side=back would 404 back_not_configured.
//   Fail-soft: if the template lookup errors, has_back is false (bridge prints
//   the front only — never blocks a claim on the duplex hint).
//   Backward compatible: pre-duplex bridges ignore unknown fields, so this
//   field is dark until a bridge version reads it AND a template opts in.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireAgentToken, isAuthFailure } from '@/lib/id-cards/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  hasBackSide,
  type IdCardPrintJob,
  type IdCardPrintJobPickup
} from '@/lib/id-cards/types';

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

    const claimedJob = claimed as IdCardPrintJob;

    // Duplex hint (see DUPLEX CONTRACT in the header). Fail-soft: any error
    // reading the template degrades to has_back=false — the claim already
    // succeeded and a front-only print is always safe.
    let hasBack = false;
    try {
      const { data: template, error: templateError } = await service
        .from('id_card_templates')
        .select('back_layout_json')
        .eq('id', claimedJob.template_id)
        .maybeSingle();
      if (templateError) {
        console.warn(
          '[id-cards/jobs/pickup] has_back lookup skipped:',
          templateError.message
        );
      } else {
        hasBack = hasBackSide(template?.back_layout_json);
      }
    } catch (lookupErr) {
      console.warn('[id-cards/jobs/pickup] has_back lookup skipped:', lookupErr);
    }

    return jsonOk<IdCardPrintJobPickup>({
      ...claimedJob,
      has_back: hasBack
    });
  } catch (err) {
    console.error('[id-cards/jobs/pickup] unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
