import { NextRequest, NextResponse } from 'next/server';
import { requireProcurement, PROC_GRN_CREATE } from '@/lib/utils/procurement-auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/procurement/grn/extract-invoice/status?job_id=<uuid>
 *
 * Reports on a ₹0 Max-lane invoice read started by the sibling POST route.
 * Returns { status, result? } where status is one of
 * pending | claimed | running | done | error | canceled | not_found.
 *
 * Mirrors the quotation status route, gated on grn_create instead of quotation_manage
 * (a receiver holds the first, not the second). fn_ai_job_status answers 'not_found'
 * for anyone else's job, so only the uploader can follow a read.
 */
export async function GET(req: NextRequest) {
  const user = await requireProcurement(PROC_GRN_CREATE);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const jobId = new URL(req.url).searchParams.get('job_id') ?? '';
  if (!UUID_RE.test(jobId))
    return NextResponse.json({ error: 'Missing or invalid job_id.' }, { status: 400 });

  const supabase = await createClient();
  const { data: st, error } = await supabase.rpc('fn_ai_job_status', { p_job_id: jobId });

  if (error || !st || typeof st.status !== 'string') {
    if (error) console.error('[procurement grn extract-invoice status] rpc failed:', error);
    return NextResponse.json({ status: 'error' });
  }

  if (st.status === 'done') {
    return NextResponse.json({ status: 'done', result: st.result ?? null });
  }
  return NextResponse.json({ status: st.status });
}
