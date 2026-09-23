export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * POST /api/ai-query/actions/[id]/cancel
 *
 * The person clicked Cancel on an AI Assistant action card. Runs under the
 * person's own session; fn_ai_cancel_action_proposal is owner-only and refuses
 * a card that was already confirmed, sent, failed or expired.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'This action was not found.' }, { status: 404 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await (supabase as any).rpc('fn_ai_cancel_action_proposal', {
      p_proposal_id: id,
    });
    if (error) throw error;
    if (!data?.success) {
      const code = typeof data?.code === 'string' ? data.code : 'NOT_PENDING';
      return NextResponse.json(
        { error: data?.message ?? 'This action cannot be cancelled.', code, status: data?.status ?? null },
        { status: code === 'NOT_FOUND' ? 404 : code === 'UNAUTHORIZED' ? 401 : 409 }
      );
    }
    return NextResponse.json({ ok: true, status: 'cancelled' });
  } catch (error) {
    logger.error('ai-query/actions', `Cancel failed for ${id}`, error);
    return NextResponse.json({ error: 'Could not cancel this action. Try again.' }, { status: 500 });
  }
}
