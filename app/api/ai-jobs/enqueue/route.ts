export const dynamic = 'force-dynamic';

// /api/ai-jobs/enqueue
// POST — enqueue one generic AI job. Body: { job_type: string, payload?: object }.
//        Reuses the EXISTING fn_ai_enqueue RPC (identity, allow_rule and the
//        per-requester in-flight cap are all enforced inside it from auth.uid()).
//        The queue is NOT reimplemented here.
//
// Auth + error shape mirror /api/ai-query (the other caller of these RPCs).
// Returns { job_id } on success, or { error } with an appropriate status.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
        { status: 401 },
      );
    }

    let body: { job_type?: unknown; payload?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const jobType = body.job_type;
    if (!jobType || typeof jobType !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'job_type is required' } },
        { status: 400 },
      );
    }
    const payload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? body.payload
        : {};

    const { data, error } = await supabase.rpc('fn_ai_enqueue', {
      p_job_type: jobType,
      p_payload: payload,
    });
    if (error) {
      console.error('[ai-jobs/enqueue] rpc error:', error.message);
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Failed to enqueue job.' } },
        { status: 500 },
      );
    }

    // fn_ai_enqueue returns { ok, job_id } | { ok:false, error }.
    if (!data?.ok || typeof data?.job_id !== 'string') {
      const errText = typeof data?.error === 'string' ? data.error : 'Could not enqueue this job.';
      const status =
        errText === 'UNAUTHORIZED'
          ? 401
          : errText === 'not allowed for this job_type'
            ? 403
            : errText === 'too many in-flight jobs of this type'
              ? 429
              : 400;
      return NextResponse.json({ error: { code: 'ENQUEUE_REJECTED', message: errText } }, { status });
    }

    return NextResponse.json({ job_id: data.job_id });
  } catch (error) {
    console.error('[ai-jobs/enqueue] route error:', error);
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 },
    );
  }
}
