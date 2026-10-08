export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  executeClaimedAction,
  type ClaimedProposal,
} from '@/lib/services/ai-query/actions/execute-action';

/**
 * POST /api/ai-query/actions/[id]/confirm
 *
 * The person clicked Confirm on an AI Assistant action card. This is the ONLY
 * path by which a proposed message, email or task is carried out.
 *
 *  1. fn_ai_claim_action_proposal runs under the person's OWN session. It is
 *     owner-only, locks the row, re-checks everything at click time (still
 *     pending, not expired, permission still held, every recipient still
 *     reachable, 20-a-day limit) and stamps confirmed_at. A second click —
 *     or a second tab — finds confirmed_at set and is refused, so nothing is
 *     ever sent twice.
 *  2. Only after a successful claim is the action executed.
 *  3. The outcome (sent / failed, counts, error) is recorded on the row.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLAIM_HTTP_STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  ALREADY_CONFIRMED: 409,
  NOT_PENDING: 409,
  EXPIRED: 409,
  RECIPIENTS_CHANGED: 409,
  PROJECT_NOT_FOUND: 409,
  DAILY_LIMIT: 429,
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'This action was not found.' }, { status: 404 });
  }

  let claimedBy: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Step 1 — the click-time gate, as the owner.
    const { data: claim, error: claimError } = await (supabase as any).rpc('fn_ai_claim_action_proposal', {
      p_proposal_id: id,
    });
    if (claimError) throw claimError;
    if (!claim?.success) {
      const code = typeof claim?.code === 'string' ? claim.code : 'NOT_PENDING';
      return NextResponse.json(
        {
          error: claim?.message ?? 'This action cannot be confirmed.',
          code,
          status: claim?.status ?? null,
        },
        { status: CLAIM_HTTP_STATUS[code] ?? 409 }
      );
    }

    claimedBy = user.id;
    const proposal = claim.proposal as ClaimedProposal;
    const service = createServiceRoleClient();

    const { data: ownerRow } = await service
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    const owner = {
      id: user.id,
      name: (ownerRow?.full_name ?? '').trim() || 'a MyJKKN colleague',
      email: (ownerRow?.email ?? '').trim() || null,
    };

    // Step 2 — execute (never throws; failures come back as an outcome).
    const outcome = await executeClaimedAction({
      proposal,
      owner,
      userClient: supabase as any,
      serviceClient: service as any,
    });

    // Step 3 — record. Guarded so it can only close the row this click claimed.
    const { error: recordError } = await service
      .from('ai_action_proposals')
      .update({
        status: outcome.status,
        result: outcome.result,
        error: outcome.error,
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .not('confirmed_at', 'is', null);
    if (recordError) {
      logger.error('ai-query/actions', `Executed ${proposal.id} but could not record the outcome`, recordError);
    }

    return NextResponse.json(
      {
        ok: outcome.status === 'sent',
        status: outcome.status,
        result: outcome.result,
        error: outcome.error,
      },
      { status: outcome.status === 'sent' ? 200 : 502 }
    );
  } catch (error) {
    logger.error('ai-query/actions', `Confirm failed for ${id}`, error);
    if (claimedBy) {
      // The click was claimed, so a retry would be refused as already
      // confirmed. Close the card as failed rather than leave it "sending".
      try {
        await createServiceRoleClient()
          .from('ai_action_proposals')
          .update({
            status: 'failed',
            error: 'Something went wrong while carrying this out. Check with the people before asking again.',
            executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('requested_by', claimedBy)
          .eq('status', 'pending');
      } catch (recordErr) {
        logger.error('ai-query/actions', `Could not mark ${id} failed`, recordErr);
      }
      return NextResponse.json(
        { error: 'Something went wrong while carrying this out. Check with the people before asking again.', status: 'failed' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: 'Could not confirm this action. Try again.' }, { status: 500 });
  }
}
